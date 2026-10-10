"""구독 (/api/managed/subscriptions) — 개발 구독·유지보수 구독·각 접수 목록·일괄 차감·제공 서비스.

cms 와 다른 점: 상세 포인트 현황은 cms 처럼 회사 전체 누적(구독별 분리 장부가 없어 SPEC 05 §8 의 '섞임'은 그대로 표시한다).
유지보수 구독 수동 등록은 cms 처럼 막는다(견적 → 계약 → 계약전환 경로만).
"""
from datetime import date, datetime

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.endpoints.managed.common import MAINT_STATUS_LABELS, page_response, require_write, verify_step_up, write_enabled
from app.core.deps import get_current_staff
from app.db.session import get_db
from app.models.company import Company
from app.models.customer import (
    CustomAuthUser,
    DevSubscription,
    Domain,
    Managelist,
    ManagelistComment,
    MaintSubscription,
    MaintSubscriptionService,
    PointHistory,
    Project,
)
from app.services import staff_auth
from app.services import subscriptions as subs
from app.utils.maint_plans import HOSTING_LABELS, plan_monthly_price, plans_payload

router = APIRouter(prefix="/subscriptions", tags=["managed-subscriptions"])
WRITE = require_write("subscriptions")


def _iso(v):
    return v.isoformat() if v else None


def _company_names(db: Session, ids) -> dict:
    return dict(db.query(Company.seq, Company.name).filter(Company.seq.in_(set(ids) or {0})))


def _row(kind: str, s, companies: dict) -> dict:
    out = {"seq": s.seq, "company_id": s.company_id, "company": companies.get(s.company_id, ""), "plan_type": s.plan_type,
           "plan_label": subs.plan_label(kind, s.plan_type), "status": s.status, "status_label": subs.SUB_STATUS.get(s.status, s.status),
           "start_date": _iso(s.start_date), "next_charge_date": _iso(s.next_charge_date), "is_beta": bool(s.is_beta),
           "maintenance_points_per_month": s.maintenance_points_per_month, "monthly_price": s.monthly_price, "notes": s.notes,
           "source_estimate_id": s.source_estimate_id, "created_at": _iso(s.created_at)}
    if kind == "dev":
        out["dev_points_per_month"] = s.dev_points_per_month
    else:
        out.update(end_date=_iso(s.end_date), project_id=s.project_id, renewal_id=s.renewal_id, hosting_type=s.hosting_type,
                   hosting_label=HOSTING_LABELS.get(s.hosting_type or "", ""), hosting_provider=s.hosting_provider, domain_id=s.domain_id)
    return out


def _model(kind: str):
    if kind not in ("dev", "maint"):
        raise HTTPException(404, "알 수 없는 구독 종류입니다.")
    return DevSubscription if kind == "dev" else MaintSubscription


@router.get("/plans")
def plans():
    return {"dev": {k: dict(v, label=subs.DEV_PLAN_LABELS[k], beta_price=subs.beta_price(v["price"])) for k, v in subs.DEV_PLAN_DEFAULTS.items()},
            "maint": plans_payload(), "status": subs.SUB_STATUS, "service_status": subs.SERVICE_STATUS}


@router.get("/{kind}")
def list_subscriptions(kind: str, status: str | None = None, plan: str | None = None, q: str | None = None,
                       page: int = Query(1, ge=1), per_page: int = Query(20, le=100), db: Session = Depends(get_db)):
    M = _model(kind)
    query = db.query(M)
    if status:
        query = query.filter(M.status == status)
    if plan:
        query = query.filter(M.plan_type == plan)
    if q:
        query = query.filter(M.company_id.in_(db.query(Company.seq).filter(Company.name.like(f"%{q}%"))))
    total = query.count()
    rows = query.order_by(M.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    companies = _company_names(db, [r.company_id for r in rows])
    out = page_response([_row(kind, r, companies) for r in rows], total, page, per_page)
    out["write_enabled"] = write_enabled("subscriptions")
    return out


def _request_rows(db: Session, rows: list[Managelist]) -> list[dict]:
    companies = _company_names(db, [r.company_id for r in rows if r.company_id])
    return [{"seq": r.seq, "title": r.title, "company": companies.get(r.company_id, ""), "status": str(r.status or ""),
             "status_label": MAINT_STATUS_LABELS.get(str(r.status or ""), ""), "points_used": r.points_used or 0,
             "created_at": _iso(r.created_at)} for r in rows]


@router.get("/{kind}/requests")
def list_requests(kind: str, status: str | None = None, q: str | None = None, company_id: int | None = None,
                  page: int = Query(1, ge=1), per_page: int = Query(20, le=100), db: Session = Depends(get_db)):
    _model(kind)
    query = subs.requests_query(db, kind)
    if status:
        query = query.filter(Managelist.status == status)
    if q:
        query = query.filter(or_(Managelist.title.like(f"%{q}%"), Managelist.company_id.in_(db.query(Company.seq).filter(Company.name.like(f"%{q}%")))))
    if company_id:
        query = query.filter(Managelist.company_id == company_id)
    total = query.count()
    rows = query.order_by(Managelist.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    out = page_response(_request_rows(db, rows), total, page, per_page)
    pending = _pending_comments(db, kind)
    out["pending"] = {"count": len(pending), "points": sum(c.point or 0 for c in pending)}
    out["write_enabled"] = write_enabled("subscriptions")
    return out


def _pending_comments(db: Session, kind: str) -> list[ManagelistComment]:
    ids = subs.requests_query(db, kind).with_entities(Managelist.seq)
    return db.query(ManagelistComment).filter(ManagelistComment.managelist_id.in_(ids), ManagelistComment.point > 0,
                                              ManagelistComment.point_executed == False).all()  # noqa: E712


class StepUpBody(BaseModel):
    password: str


@router.post("/{kind}/requests/bulk-deduct", dependencies=[WRITE])
def bulk_deduct(kind: str, body: StepUpBody, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """미실행 포인트 댓글 전부 책정→사용(cms *_subscription_bulk_deduct). 본인 비밀번호 재확인."""
    _model(kind)
    verify_step_up(staff, body.password)
    pending = _pending_comments(db, kind)
    if not pending:
        raise HTTPException(400, "차감할 포인트가 없습니다.")
    total = 0
    for c in pending:
        db.query(PointHistory).filter(PointHistory.comment_id == c.seq, PointHistory.point_type == "3").update(
            {PointHistory.status: "2", PointHistory.point_type: "2"}, synchronize_session=False)
        m = db.query(Managelist).filter(Managelist.seq == c.managelist_id).first()
        m.points_used = (m.points_used or 0) + c.point
        c.point_executed = True
        total += c.point
    staff_auth.audit(db, request, f"subscriptions.{kind}.bulk_deduct", user_id=staff.id, detail=f"{len(pending)}건 {total}P")
    db.commit()
    return {"count": len(pending), "points": total}


@router.get("/{kind}/{seq}")
def get_subscription(kind: str, seq: int, db: Session = Depends(get_db)):
    M = _model(kind)
    s = db.query(M).filter(M.seq == seq).first()
    if not s:
        raise HTTPException(404, "구독을 찾을 수 없습니다.")
    companies = _company_names(db, [s.company_id])
    out = _row(kind, s, companies)
    out["points"] = {"maint": subs.point_summary(db, s.company_id, "1")}
    cats = ["1"]
    if kind == "dev":
        out["points"]["dev"] = subs.point_summary(db, s.company_id, "2")
        cats.append("2")
    col = Managelist.dev_subscription_id if kind == "dev" else Managelist.maint_subscription_id
    out["recent_requests"] = _request_rows(db, db.query(Managelist).filter(col == seq).order_by(Managelist.created_at.desc()).limit(10).all())
    out["point_histories"] = [{"seq": p.seq, "content": p.content, "point": p.point, "point_type": str(p.point_type or ""),
                               "point_category": p.point_category, "created_at": _iso(p.created_at)}
                              for p in db.query(PointHistory).filter(PointHistory.company_id == s.company_id, PointHistory.point_category.in_(cats))
                              .order_by(PointHistory.created_at.desc()).limit(20)]
    if kind == "maint":
        project = db.query(Project).filter(Project.seq == s.project_id).first() if s.project_id else None
        out["project"] = {"seq": project.seq, "title": project.title} if project else None
        domains = db.query(Domain).filter(Domain.company_id == s.company_id).order_by(Domain.seq).all()
        labels = {d.seq: subs.domain_label(d) for d in domains}
        out["domain_label"] = labels.get(s.domain_id, "")
        out["domain_options"] = [{"seq": k, "label": v} for k, v in labels.items()]
        out["services"] = [{"seq": v.seq, "service_code": v.service_code, "name": v.name, "spec": v.spec, "status": v.status,
                            "status_label": subs.SERVICE_STATUS.get(v.status, v.status), "domain_id": v.domain_id,
                            "domain_label": labels.get(v.domain_id, ""), "start_date": _iso(v.start_date), "end_date": _iso(v.end_date), "memo": v.memo}
                           for v in db.query(MaintSubscriptionService).filter(MaintSubscriptionService.subscription_id == seq)
                           .order_by(MaintSubscriptionService.order_no, MaintSubscriptionService.seq)]
    out["write_enabled"] = write_enabled("subscriptions")
    return out


class DevCreateBody(BaseModel):
    company_id: int
    plan_type: str
    start_date: date
    is_beta: bool = False
    notes: str = ""


@router.post("/dev", dependencies=[WRITE])
def create_dev(body: DevCreateBody, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """cms dev_subscription_register — 다음 충전일 = 시작 + 1개월, 초기 포인트 즉시 충전."""
    d = subs.DEV_PLAN_DEFAULTS.get(body.plan_type)
    if not d:
        raise HTTPException(400, "잘못된 플랜입니다.")
    company = db.query(Company).filter(Company.seq == body.company_id).first()
    if not company:
        raise HTTPException(400, "업체를 찾을 수 없습니다.")
    now = datetime.now()
    s = DevSubscription(company_id=company.seq, plan_type=body.plan_type, status="beta" if body.is_beta else "active", start_date=body.start_date,
                        next_charge_date=body.start_date + relativedelta(months=1), is_beta=body.is_beta,
                        maintenance_points_per_month=d["maintenance"], dev_points_per_month=d["dev"],
                        monthly_price=subs.beta_price(d["price"]) if body.is_beta else d["price"], notes=body.notes, created_at=now, updated_at=now)
    db.add(s)
    db.flush()
    label = subs.DEV_PLAN_LABELS[body.plan_type]
    for cat, key, name in (("1", "maintenance", "유지보수"), ("2", "dev", "개발")):
        if d[key] > 0:
            db.add(PointHistory(company_id=company.seq, point=d[key], point_type="1", status="2", point_category=cat,
                                content=f"[개발구독 {label}] 초기 {name} 포인트 충전", writer_id=staff.id, contract_date=body.start_date,
                                created_at=now, updated_at=now, edited_at=now))
    staff_auth.audit(db, request, "subscriptions.dev.create", user_id=staff.id, target=f"dev_subscription:{s.seq}")
    db.commit()
    return {"seq": s.seq}


class UpdateBody(BaseModel):
    plan_type: str
    is_beta: bool = False
    notes: str = ""


@router.patch("/{kind}/{seq}", dependencies=[WRITE])
def update_subscription(kind: str, seq: int, body: UpdateBody, request: Request, staff: CustomAuthUser = Depends(get_current_staff),
                        db: Session = Depends(get_db)):
    """플랜·베타·메모 — 가격·월 포인트는 요금표로 다시 계산(cms 와 같음). 해지된 구독은 수정으로 재활성하지 않는다."""
    M = _model(kind)
    s = db.query(M).filter(M.seq == seq).first()
    if not s:
        raise HTTPException(404, "구독을 찾을 수 없습니다.")
    if kind == "dev":
        d = subs.DEV_PLAN_DEFAULTS.get(body.plan_type)
        if not d:
            raise HTTPException(400, "잘못된 플랜입니다.")
        base = d["price"]
        s.dev_points_per_month = d["dev"]
    else:
        d = subs.MAINT_PLAN_DEFAULTS.get(body.plan_type)
        if not d:
            raise HTTPException(400, "잘못된 플랜입니다.")
        base = plan_monthly_price(body.plan_type, s.hosting_type)
    s.plan_type, s.is_beta, s.notes = body.plan_type, body.is_beta, body.notes
    if s.status != "inactive":
        s.status = "beta" if body.is_beta else "active"
    s.maintenance_points_per_month = d["maintenance"]
    s.monthly_price = subs.beta_price(base) if body.is_beta else base
    s.updated_at = datetime.now()
    staff_auth.audit(db, request, f"subscriptions.{kind}.update", user_id=staff.id, target=f"{kind}_subscription:{seq}")
    db.commit()
    return {"ok": True}


@router.post("/{kind}/{seq}/cancel", dependencies=[WRITE])
def cancel_subscription(kind: str, seq: int, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    M = _model(kind)
    s = db.query(M).filter(M.seq == seq).first()
    if not s:
        raise HTTPException(404, "구독을 찾을 수 없습니다.")
    s.status = "inactive"
    s.updated_at = datetime.now()
    staff_auth.audit(db, request, f"subscriptions.{kind}.cancel", user_id=staff.id, target=f"{kind}_subscription:{seq}")
    db.commit()
    return {"ok": True}


class ServiceBody(BaseModel):
    status: str
    domain_id: int | None = None
    start_date: date | None = None
    end_date: date | None = None
    memo: str | None = None


@router.patch("/maint/{seq}/services/{sid}", dependencies=[WRITE])
def update_service(seq: int, sid: int, body: ServiceBody, db: Session = Depends(get_db)):
    s = db.query(MaintSubscription).filter(MaintSubscription.seq == seq).first()
    v = db.query(MaintSubscriptionService).filter(MaintSubscriptionService.seq == sid, MaintSubscriptionService.subscription_id == seq).first()
    if not s or not v:
        raise HTTPException(404, "서비스를 찾을 수 없습니다.")
    if body.status not in subs.SERVICE_STATUS:
        raise HTTPException(400, "잘못된 상태값입니다.")
    if body.domain_id and not db.query(Domain.seq).filter(Domain.seq == body.domain_id, Domain.company_id == s.company_id).first():
        raise HTTPException(400, "이 업체의 도메인이 아닙니다.")
    if body.start_date and body.end_date and body.end_date < body.start_date:
        raise HTTPException(400, "종료일이 시작일보다 빠릅니다.")
    v.status, v.domain_id, v.start_date, v.end_date = body.status, body.domain_id, body.start_date, body.end_date
    v.memo = (body.memo or "").strip() or None
    v.updated_at = datetime.now()
    db.commit()
    return {"ok": True}


@router.post("/maint/{seq}/services/register", dependencies=[WRITE])
def register_services(seq: int, db: Session = Depends(get_db)):
    s = db.query(MaintSubscription).filter(MaintSubscription.seq == seq).first()
    if not s:
        raise HTTPException(404, "구독을 찾을 수 없습니다.")
    if db.query(MaintSubscriptionService.seq).filter(MaintSubscriptionService.subscription_id == seq).first():
        raise HTTPException(400, "이미 등록된 제공 서비스가 있습니다. 개별 항목을 수정해 주세요.")
    n = subs.register_plan_services(db, s)
    if not n:
        raise HTTPException(400, "등록할 서비스가 없습니다. 요금제를 확인해 주세요.")
    db.commit()
    return {"created": n}
