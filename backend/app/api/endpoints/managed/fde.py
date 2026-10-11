"""FDE (/api/managed/fde) — 요금제 카탈로그·계약(engagement)·옵션·청구 일정 (SPEC 05 §7).

청구는 기존 납부(Payment/PaymentHistory)를 만든다 → 납부리스트·미수금·월별수익·매출계획이 그대로 따라온다.
그래서 매출계획 구독 소스에는 FDE 를 넣지 않는다(이중 집계 금지 — §7.5).
- 진단·파일럿(split_50_50): 착수금(유형 1, 시작일) + 잔금(유형 6, 종료일), 공급가 − 진단 차감 + 1회성 옵션.
- 상주(monthly_prepaid): 월별 선결제(유형 1) — 처음 최소 개월(3)만큼, 이후 연장 시 1개월씩.
금액: 공급가 × 1.1 ROUND_HALF_UP = 포함액(Payment 관례). 미결(D14·D15): 운영지원 연결가, 진단 차감 자동화, 상주 청구 기준일 —
진단 차감은 직원이 입력(직전 진단 50% 를 제안만), 청구일은 billing_day(기본 시작일의 일).
"""
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.endpoints.managed.common import apply_sort, page_response, require_write, write_enabled
from app.core.deps import get_current_staff, require_staff_admin
from app.db.session import get_db
from app.models.company import Company
from app.models.customer import CustomAuthUser, Payment, PaymentHistory
from app.models.fde import FdeEngagement, FdeEngagementAddon, ServicePlan
from app.services import staff_auth
from app.services.billing import PaymentContext, payment_status

router = APIRouter(prefix="/fde", tags=["managed-fde"])
WRITE = require_write("fde")
STATUS = {"consulting": "상담", "quoted": "견적", "active": "진행", "completed": "완료", "terminated": "해지"}
BILLING_KIND = {"split_50_50": "1회(착수 50% / 완료 50%)", "monthly_prepaid": "월 정기(매월 선결제)", "monthly": "월", "per_week": "주 단위",
                "one_time": "1회", "linked_subscription": "구독 연결"}
UNIT = {"once": "1회", "week": "주", "month": "월", "half_day": "반일"}


def _iso(v):
    return v.isoformat() if v else None


def vat_incl(supply: int) -> int:
    return int((Decimal(supply) * Decimal("1.1")).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _plan_row(p: ServicePlan) -> dict:
    return {"plan_id": p.plan_id, "product": p.product, "kind": p.kind, "name_ko": p.name_ko, "name_en": p.name_en, "billing_kind": p.billing_kind,
            "billing_kind_label": BILLING_KIND.get(p.billing_kind, p.billing_kind), "unit": p.unit, "unit_label": UNIT.get(p.unit, p.unit),
            "list_price_supply": p.list_price_supply, "price_is_from": bool(p.price_is_from), "price_status": p.price_status,
            "price_confirmed_at": _iso(p.price_confirmed_at), "confirmed_by_id": p.confirmed_by_id, "deposit_ratio": p.deposit_ratio,
            "min_months": p.min_months, "notice_days": p.notice_days, "applies_to": [x for x in (p.applies_to or "").split(",") if x],
            "is_public": bool(p.is_public), "sort_order": p.sort_order, "contact_type": p.contact_type, "linked_dev_plan": p.linked_dev_plan,
            "description": p.description}


@router.get("/plans")
def list_plans(db: Session = Depends(get_db)):
    return {"items": [_plan_row(p) for p in db.query(ServicePlan).order_by(ServicePlan.sort_order)], "status": STATUS}


class PlanBody(BaseModel):
    name_ko: str
    name_en: str | None = None
    list_price_supply: int | None = None
    price_is_from: bool = False
    price_status: str = "draft"
    min_months: int | None = None
    notice_days: int | None = None
    is_public: bool = False
    description: str | None = None
    linked_dev_plan: str | None = None


@router.patch("/plans/{plan_id}", dependencies=[WRITE])
def update_plan(plan_id: str, body: PlanBody, request: Request, admin: CustomAuthUser = Depends(require_staff_admin), db: Session = Depends(get_db)):
    """요금제 수정(관리자). 확정가로 바꾸면 확정일·확정자를 기록하고, 다시 제안가로 돌리면 지운다."""
    p = db.query(ServicePlan).filter(ServicePlan.plan_id == plan_id).first()
    if not p:
        raise HTTPException(404, "요금제를 찾을 수 없습니다.")
    if body.price_status not in ("draft", "confirmed"):
        raise HTTPException(400, "가격 상태가 올바르지 않습니다.")
    if body.linked_dev_plan and body.linked_dev_plan not in ("starter", "growth", "scale"):
        raise HTTPException(400, "연결 개발구독 플랜이 올바르지 않습니다.")
    now = datetime.now()
    if body.price_status == "confirmed" and (p.price_status != "confirmed" or p.list_price_supply != body.list_price_supply):
        p.price_confirmed_at, p.confirmed_by_id = now, admin.id
    elif body.price_status == "draft":
        p.price_confirmed_at = p.confirmed_by_id = None
    for f in ("name_ko", "name_en", "list_price_supply", "price_is_from", "price_status", "min_months", "notice_days", "is_public",
              "description", "linked_dev_plan"):
        setattr(p, f, getattr(body, f))
    p.updated_at = now
    staff_auth.audit(db, request, "fde.plan.update", user_id=admin.id, target=f"service_plan:{plan_id}",
                     detail=f"{body.price_status} {body.list_price_supply}")
    db.commit()
    return {"ok": True}


# ── 계약 ─────────────────────────────────────────────────────────────────

def _marker(e: FdeEngagement) -> str:
    return f"[FDE #{e.id}]"


def _billing_payments(db: Session, e: FdeEngagement) -> list[Payment]:
    return db.query(Payment).filter(Payment.company_id == e.company_id, Payment.history_remarks.like(f"{_marker(e)}%")).order_by(Payment.payment_date, Payment.seq).all()


def _row(e: FdeEngagement, plans: dict, companies: dict) -> dict:
    p = plans.get(e.plan_id)
    return {"id": e.id, "company_id": e.company_id, "company": companies.get(e.company_id, ""), "plan_id": e.plan_id,
            "plan_name": p.name_ko if p else e.plan_id, "billing_kind": p.billing_kind if p else None, "status": e.status,
            "status_label": STATUS.get(e.status, e.status), "start_date": _iso(e.start_date), "end_date": _iso(e.end_date),
            "min_end_date": _iso(e.min_end_date), "notice_received_at": _iso(e.notice_received_at),
            "contract_price_supply": e.contract_price_supply, "monthly_price_supply": e.monthly_price_supply, "headcount": e.headcount,
            "created_at": _iso(e.created_at)}


@router.get("/engagements")
def list_engagements(status: str | None = None, plan_id: str | None = None, company_id: int | None = None, q: str | None = None,
                     sort: str | None = Query(None, description="start_date|end_date|headcount|status|created_at, '-' 접두 = 내림차순"),
                     page: int = Query(1, ge=1), per_page: int = Query(20, le=100), db: Session = Depends(get_db)):
    query = db.query(FdeEngagement)
    if status:
        query = query.filter(FdeEngagement.status == status)
    if plan_id:
        query = query.filter(FdeEngagement.plan_id == plan_id)
    if company_id:
        query = query.filter(FdeEngagement.company_id == company_id)
    if q:
        query = query.filter(FdeEngagement.company_id.in_(db.query(Company.seq).filter(Company.name.like(f"%{q}%"))))
    total = query.count()
    query = apply_sort(query, sort, {"start_date": FdeEngagement.start_date, "end_date": FdeEngagement.end_date,
                                    "headcount": FdeEngagement.headcount, "status": FdeEngagement.status,
                                    "created_at": FdeEngagement.created_at},
                       [FdeEngagement.created_at.desc()])
    rows = query.offset((page - 1) * per_page).limit(per_page).all()
    plans = {p.plan_id: p for p in db.query(ServicePlan)}
    companies = dict(db.query(Company.seq, Company.name).filter(Company.seq.in_({r.company_id for r in rows} or {0})))
    out = page_response([_row(r, plans, companies) for r in rows], total, page, per_page)
    out.update(write_enabled=write_enabled("fde"), status=STATUS)
    return out


def _get(db: Session, eid: int) -> FdeEngagement:
    e = db.query(FdeEngagement).filter(FdeEngagement.id == eid).first()
    if not e:
        raise HTTPException(404, "FDE 계약을 찾을 수 없습니다.")
    return e


def _credit_hint(db: Session, e: FdeEngagement) -> dict | None:
    """직전 진단 계약이 있고 이번 계약 시작이 진단 종료 후 2주 이내면 진단비 50% 차감을 제안(자동 적용은 미결 D15-2)."""
    if not e.predecessor_id:
        return None
    pre = db.query(FdeEngagement).filter(FdeEngagement.id == e.predecessor_id).first()
    if not pre or pre.plan_id != "fde-diagnosis" or not pre.contract_price_supply:
        return None
    within = bool(pre.end_date and e.start_date and (e.start_date - pre.end_date).days <= 14)
    return {"predecessor_id": pre.id, "suggested": pre.contract_price_supply // 2, "within_two_weeks": within}


@router.get("/engagements/{eid}")
def get_engagement(eid: int, db: Session = Depends(get_db)):
    e = _get(db, eid)
    plans = {p.plan_id: p for p in db.query(ServicePlan)}
    company = db.query(Company).filter(Company.seq == e.company_id).first()
    out = _row(e, plans, {e.company_id: company.name if company else ""})
    out.update({k: getattr(e, k) for k in ("engineer_ids", "predecessor_id", "diagnosis_credit_supply", "travel_expense_policy",
                                           "ip_transfer_on_full_payment", "billing_day", "source_estimate_id", "source_lead_id", "project_id", "notes")})
    out["nda_signed_at"], out["hcms_portal_opened_at"] = _iso(e.nda_signed_at), _iso(e.hcms_portal_opened_at)
    out["engineer_id_list"] = [int(x) for x in (e.engineer_ids or "").split(",") if x.strip().isdigit()]
    out["addons"] = [{"id": a.id, "plan_id": a.plan_id, "plan_name": plans[a.plan_id].name_ko if a.plan_id in plans else a.plan_id,
                      "qty": a.qty, "unit_price_supply": a.unit_price_supply, "start_date": _iso(a.start_date), "end_date": _iso(a.end_date),
                      "dev_subscription_id": a.dev_subscription_id, "notes": a.notes}
                     for a in db.query(FdeEngagementAddon).filter(FdeEngagementAddon.engagement_id == eid).order_by(FdeEngagementAddon.id)]
    pays = _billing_payments(db, e)
    ctx = PaymentContext(db, [p.seq for p in pays])
    out["payments"] = []
    for p in pays:
        text_, color = payment_status(p, None, ctx)
        out["payments"].append({"seq": p.seq, "payment_date": _iso(p.payment_date), "payment_amount": p.payment_amount, "remarks": p.history_remarks,
                                "status_text": text_, "status_color": color})
    out["credit_hint"] = _credit_hint(db, e)
    out["write_enabled"] = write_enabled("fde")
    if e.notice_received_at and e.end_date and plans.get(e.plan_id) and plans[e.plan_id].notice_days:
        out["notice_ok"] = (e.end_date - e.notice_received_at).days >= plans[e.plan_id].notice_days
    return out


class EngagementBody(BaseModel):
    company_id: int
    plan_id: str
    status: str = "consulting"
    start_date: date | None = None
    end_date: date | None = None
    notice_received_at: date | None = None
    contract_price_supply: int | None = None
    monthly_price_supply: int | None = None
    headcount: int = 1
    engineer_ids: list[int] = []
    predecessor_id: int | None = None
    diagnosis_credit_supply: int | None = None
    travel_expense_policy: str | None = None
    nda_signed_at: date | None = None
    ip_transfer_on_full_payment: bool = True
    billing_day: int | None = None
    source_estimate_id: int | None = None
    source_lead_id: int | None = None
    project_id: int | None = None
    notes: str | None = None


def _apply(db: Session, e: FdeEngagement, body: EngagementBody) -> None:
    plan = db.query(ServicePlan).filter(ServicePlan.plan_id == body.plan_id, ServicePlan.kind == "plan").first()
    if not plan:
        raise HTTPException(400, "요금제를 선택하세요.")
    if body.status not in STATUS:
        raise HTTPException(400, "상태가 올바르지 않습니다.")
    if not db.query(Company.seq).filter(Company.seq == body.company_id).first():
        raise HTTPException(400, "업체를 찾을 수 없습니다.")
    if body.start_date and body.end_date and body.end_date < body.start_date:
        raise HTTPException(400, "종료일이 시작일보다 빠릅니다.")
    if body.billing_day is not None and not 1 <= body.billing_day <= 31:
        raise HTTPException(400, "청구일은 1~31 입니다.")
    if body.predecessor_id and not db.query(FdeEngagement.id).filter(FdeEngagement.id == body.predecessor_id, FdeEngagement.company_id == body.company_id).first():
        raise HTTPException(400, "같은 업체의 선행 계약이 아닙니다.")
    for f in ("company_id", "plan_id", "status", "start_date", "end_date", "notice_received_at", "contract_price_supply", "monthly_price_supply",
              "predecessor_id", "diagnosis_credit_supply", "travel_expense_policy", "nda_signed_at", "ip_transfer_on_full_payment", "billing_day",
              "source_estimate_id", "source_lead_id", "project_id", "notes"):
        setattr(e, f, getattr(body, f))
    e.headcount = max(1, body.headcount)
    e.engineer_ids = ",".join(str(i) for i in body.engineer_ids) or None
    # 상주: 최소 종료일 = 시작 + 최소 개월 − 1일
    e.min_end_date = (body.start_date + relativedelta(months=plan.min_months) - relativedelta(days=1)) if plan.min_months and body.start_date else None


@router.post("/engagements", dependencies=[WRITE])
def create_engagement(body: EngagementBody, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    now = datetime.now()
    e = FdeEngagement(created_by_id=staff.id, created_at=now, updated_at=now)
    _apply(db, e, body)
    db.add(e)
    db.flush()
    staff_auth.audit(db, request, "fde.engagement.create", user_id=staff.id, target=f"fde_engagement:{e.id}")
    db.commit()
    return {"id": e.id}


@router.patch("/engagements/{eid}", dependencies=[WRITE])
def update_engagement(eid: int, body: EngagementBody, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    e = _get(db, eid)
    if body.company_id != e.company_id and _billing_payments(db, e):
        raise HTTPException(400, "청구가 만들어진 계약은 업체를 바꿀 수 없습니다.")
    _apply(db, e, body)
    e.updated_at = datetime.now()
    staff_auth.audit(db, request, "fde.engagement.update", user_id=staff.id, target=f"fde_engagement:{eid}")
    db.commit()
    return {"ok": True}


class AddonBody(BaseModel):
    plan_id: str
    qty: int = 1
    unit_price_supply: int | None = None
    start_date: date | None = None
    end_date: date | None = None
    dev_subscription_id: int | None = None
    notes: str | None = None


@router.post("/engagements/{eid}/addons", dependencies=[WRITE])
def add_addon(eid: int, body: AddonBody, db: Session = Depends(get_db)):
    """옵션 추가 — applies_to 제약(추가 FDE 는 상주에만, 연장은 파일럿에만)."""
    e = _get(db, eid)
    p = db.query(ServicePlan).filter(ServicePlan.plan_id == body.plan_id, ServicePlan.kind == "addon").first()
    if not p:
        raise HTTPException(400, "옵션을 선택하세요.")
    if p.applies_to and e.plan_id not in p.applies_to.split(","):
        raise HTTPException(400, f"{p.name_ko} 옵션은 {p.applies_to} 계약에만 붙일 수 있습니다.")
    if body.qty < 1:
        raise HTTPException(400, "수량은 1 이상입니다.")
    a = FdeEngagementAddon(engagement_id=eid, plan_id=p.plan_id, qty=body.qty,
                           unit_price_supply=body.unit_price_supply if body.unit_price_supply is not None else (p.list_price_supply or 0),
                           start_date=body.start_date, end_date=body.end_date, dev_subscription_id=body.dev_subscription_id, notes=body.notes,
                           created_at=datetime.now())
    db.add(a)
    db.commit()
    return {"id": a.id}


@router.post("/engagements/{eid}/addons/{aid}/delete", dependencies=[WRITE])
def delete_addon(eid: int, aid: int, db: Session = Depends(get_db)):
    n = db.query(FdeEngagementAddon).filter(FdeEngagementAddon.id == aid, FdeEngagementAddon.engagement_id == eid).delete(synchronize_session=False)
    if not n:
        raise HTTPException(404, "옵션을 찾을 수 없습니다.")
    db.commit()
    return {"ok": True}


class BillingBody(BaseModel):
    months: int | None = None  # 상주: 추가로 만들 개월 수(처음엔 최소 개월)


def _add_payment(db: Session, e: FdeEngagement, ptype: str, amount: int, when: date | None, remarks: str, history_field: str, now: datetime) -> Payment:
    p = Payment(project_type="16", company_id=e.company_id, project_id=e.project_id, payment_amount=amount, production_price=amount,
                payment_type=ptype, payment_status="3", payment_date=datetime.combine(when, datetime.min.time()) if when else None,
                history_remarks=remarks, extra_items="[]", created_at=now, updated_at=now)
    db.add(p)
    db.flush()
    db.add(PaymentHistory(company_id=e.company_id, project_id=e.project_id, payment_id=p.seq, payment_amount=amount, payment_tf="2",
                          created_at=now, updated_at=now, **{history_field: amount}))
    return p


@router.post("/engagements/{eid}/billing", dependencies=[WRITE, require_write("billing")])
def generate_billing(eid: int, body: BillingBody, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    e = _get(db, eid)
    plan = db.query(ServicePlan).filter(ServicePlan.plan_id == e.plan_id).first()
    if not e.start_date:
        raise HTTPException(400, "시작일을 먼저 입력하세요.")
    addons = db.query(FdeEngagementAddon).filter(FdeEngagementAddon.engagement_id == eid).all()
    addon_plans = {p.plan_id: p for p in db.query(ServicePlan).filter(ServicePlan.kind == "addon")}
    existing = _billing_payments(db, e)
    now = datetime.now()
    created = []
    if plan.billing_kind == "split_50_50":
        if existing:
            raise HTTPException(400, "이미 청구가 만들어졌습니다. 납부리스트에서 수정하세요.")
        if not e.contract_price_supply:
            raise HTTPException(400, "계약 금액(공급가)을 입력하세요.")
        once = sum(a.qty * a.unit_price_supply for a in addons if addon_plans.get(a.plan_id) and addon_plans[a.plan_id].billing_kind in ("per_week", "one_time"))
        supply = e.contract_price_supply - (e.diagnosis_credit_supply or 0) + once
        if supply <= 0:
            raise HTTPException(400, "청구할 금액이 없습니다.")
        total = vat_incl(supply)
        ratio = plan.deposit_ratio or 50
        deposit = int((Decimal(total) * ratio / 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        created.append(_add_payment(db, e, "1", deposit, e.start_date, f"{_marker(e)} {plan.name_ko} 착수금 {ratio}% (공급가 {supply:,})", "deposit_amount", now))
        created.append(_add_payment(db, e, "6", total - deposit, e.end_date, f"{_marker(e)} {plan.name_ko} 잔금 {100 - ratio}% (공급가 {supply:,})", "balance_amount", now))
    elif plan.billing_kind == "monthly_prepaid":
        if not e.monthly_price_supply:
            raise HTTPException(400, "월 금액(공급가)을 입력하세요.")
        n = len(existing)
        months = body.months or (max((plan.min_months or 1) - n, 1) if n < (plan.min_months or 1) else 1)
        if not 1 <= months <= 24:
            raise HTTPException(400, "개월 수는 1~24 입니다.")
        day = e.billing_day or e.start_date.day
        for i in range(n, n + months):
            first = e.start_date.replace(day=1) + relativedelta(months=i)
            when = first.replace(day=min(day, (first + relativedelta(months=1) - relativedelta(days=1)).day))
            if e.end_date and when > e.end_date:
                break
            monthly_addons = sum(a.qty * a.unit_price_supply for a in addons
                                 if addon_plans.get(a.plan_id) and addon_plans[a.plan_id].billing_kind == "monthly"
                                 and (not a.start_date or a.start_date <= when) and (not a.end_date or a.end_date >= when))
            supply = e.monthly_price_supply + monthly_addons
            note = ""
            if i == 0 and e.diagnosis_credit_supply:  # 진단비 차감은 첫 달 청구에서
                credit = min(e.diagnosis_credit_supply, supply)
                supply -= credit
                note = f", 진단비 차감 {credit:,}"
            created.append(_add_payment(db, e, "1", vat_incl(supply), when, f"{_marker(e)} {plan.name_ko} {when:%Y-%m} 월 선결제 (공급가 {supply:,}{note})",
                                        "deposit_amount", now))
        if not created:
            raise HTTPException(400, "계약 종료일 이후라 더 만들 청구가 없습니다.")
    else:
        raise HTTPException(400, "이 요금제는 청구 일정을 만들 수 없습니다.")
    staff_auth.audit(db, request, "fde.billing.generate", user_id=staff.id, target=f"fde_engagement:{eid}", detail=f"{len(created)}건")
    db.commit()
    return {"created": [p.seq for p in created]}
