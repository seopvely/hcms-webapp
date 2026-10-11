"""직원 견적서 API (/api/managed/estimates) — cms 견적발행 + 견적서관리(new) 통합.

상태 코드(varchar): 1 작성중 / 2 발송 / 3 승인 / 4 거절 / 5 계약전환. 상태 머신:
- 발송은 1·2·4 에서만(승인·전환된 견적은 재발송 불가). 발송마다 승인 토큰 재발급(24시간).
- 수동 변경은 1~4 사이만. 5(계약전환)는 전환 기능으로만, 전환된 견적은 철회로만 되돌린다.
이력 change_reason 접두('고객 이메일 발송: ')는 맥미니 iMessage·cms 화면이 읽으므로 그대로 쓴다.
"""
import re
import secrets
from datetime import date, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session, joinedload

from app.api.endpoints.estimates import WITHDRAW_REASON_PREFIX, build_estimate_pdf_data
from app.services.estimate_calc import amounts
from app.db.locks import hold_lock
from app.api.endpoints.managed.common import page_response, require_write, verify_step_up, write_enabled
from app.core.deps import get_current_staff
from app.db.session import get_db
from app.models.company import Company
from app.models.customer import (
    CustomAuthUser,
    Domain,
    Estimate,
    EstimateContract,
    EstimateItem,
    EstimateRevisionRequest,
    EstimateStatusHistory,
)
from app.models.manager import Manager
from app.services import staff_auth
from app.services.email import notify_manager_estimate_action, send_estimate_to_customer_mail
from app.utils.html_sanitize import sanitize_html
from app.utils.pdf_generator import generate_estimate_pdf

router = APIRouter(prefix="/estimates", tags=["managed-estimates"])
WRITE = require_write("estimates")

STATUS_LABELS = {"1": "작성중", "2": "발송", "3": "승인", "4": "거절", "5": "계약전환"}
CONTRACT_STATUS_LABELS = {"1": "작성중", "2": "검토대기", "3": "발송", "4": "서명완료(갑)", "5": "취소", "6": "쌍방서명완료"}
PROJECT_TYPES = {
    "1": "웹사이트", "2": "모바일앱", "3": "웹앱", "4": "웹+앱", "5": "도메인", "6": "보안서버", "7": "쇼핑몰",
    "8": "운영", "9": "유지보수", "10": "서버관리", "11": "서버마이그레이션", "12": "호스팅", "13": "개발구독",
    "14": "AI개발팀구축(판매종료)", "15": "유지보수구독", "16": "FDE",
}
SENDABLE = {"1", "2", "4"}
MANUAL_STATUSES = {"1", "2", "3", "4"}
# 수동 상태 변경 허용 전이(SPEC 04 §3: 1→2→3/4, 계약전환 5 는 전환·철회 기능으로만)
MANUAL_TRANSITIONS = {"1": {"2"}, "2": {"1", "3", "4"}, "3": {"2", "4"}, "4": {"1", "2"}}
NUMBER_RE = re.compile(r"^EST-(\d{8})-(\d{4})$")


def _st(e: Estimate) -> str:
    return str(e.estimate_status or "1")


def _iso(v):
    return v.isoformat() if v else None


def next_estimate_number(db: Session, on: date | None = None) -> str:
    """EST-YYYYMMDD-NNNN — 그날 마지막 번호 + 1 (cms 와 같은 규칙)."""
    day = (on or date.today()).strftime("%Y%m%d")
    hold_lock(db, "hcms_estimate_number")  # 커밋까지 다른 생성이 같은 번호를 읽지 못하게
    rows = db.query(Estimate.estimate_number).filter(Estimate.estimate_number.like(f"EST-{day}-%")).all()
    last = max((int(m.group(2)) for (n,) in rows if n and (m := NUMBER_RE.match(n))), default=0)
    return f"EST-{day}-{last + 1:04d}"


def _history(db: Session, e: Estimate, new: str, staff_id: int | None, reason: str) -> None:
    db.add(EstimateStatusHistory(estimate_id=e.seq, previous_status=_st(e), new_status=new,
                                 changed_by_id=staff_id, change_reason=reason, created_at=datetime.now()))


def _withdrawn_ids(db: Session) -> set:
    ids = {i for (i,) in db.query(EstimateStatusHistory.estimate_id).filter(
        EstimateStatusHistory.previous_status == "5",
        EstimateStatusHistory.change_reason.like(f"%{WITHDRAW_REASON_PREFIX}%"))}
    if not ids:
        return set()
    reconverted = {i for (i,) in db.query(Estimate.seq).filter(Estimate.seq.in_(ids), Estimate.estimate_status == "5")}
    return ids - reconverted


def _get(db: Session, seq: int, lock: bool = False) -> Estimate:
    q = db.query(Estimate).options(joinedload(Estimate.items), joinedload(Estimate.company)).filter(Estimate.seq == seq)
    if lock:
        q = q.with_for_update()
    e = q.first()
    if e is None:
        raise HTTPException(status_code=404, detail="견적서를 찾을 수 없습니다.")
    return e


# ── 조회 ────────────────────────────────────────────────────────────────

@router.get("")
def list_estimates(
    q: str | None = None,
    company_id: int | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(Estimate).options(joinedload(Estimate.items), joinedload(Estimate.company)).outerjoin(
        Company, Estimate.company_id == Company.seq)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(Estimate.estimate_title.like(like), Estimate.estimate_number.like(like), Company.name.like(like)))
    if company_id:
        query = query.filter(Estimate.company_id == company_id)
    if status:
        query = query.filter(Estimate.estimate_status == status)
    total = query.count()
    rows = query.order_by(Estimate.created_at.desc(), Estimate.seq.desc()).offset((page - 1) * per_page).limit(per_page).all()
    withdrawn = _withdrawn_ids(db)
    managers = {u.id: (u.name or u.username) for u in db.query(CustomAuthUser)}
    items = [{
        "seq": e.seq,
        "estimate_number": e.estimate_number,
        "title": e.estimate_title,
        "company_name": e.company.name if e.company else None,
        "status": _st(e),
        "status_label": STATUS_LABELS.get(_st(e), "-"),
        "withdrawn": e.seq in withdrawn,
        "total": amounts(e)["total"],
        "manager_name": managers.get(e.estimate_manager_id),
        "written_date": _iso(e.written_date or e.estimate_date),
        "validity_period": _iso(e.validity_period),
        "created_at": _iso(e.created_at),
    } for e in rows]
    return page_response(items, total, page, per_page) | {"write_enabled": write_enabled("estimates")}


@router.get("/next-number")
def get_next_number(db: Session = Depends(get_db)):
    return {"estimate_number": next_estimate_number(db)}


@router.get("/dashboard")
def dashboard(months: int = Query(6, ge=1, le=36), db: Session = Depends(get_db)):
    """견적 대시보드 — 승인률은 승인 이상(3·5)을 성공으로 계산한다(cms 식 정정)."""
    since = datetime.now() - timedelta(days=30 * months)
    rows = db.query(Estimate).options(joinedload(Estimate.items), joinedload(Estimate.company)).filter(Estimate.created_at >= since).all()
    withdrawn = _withdrawn_ids(db)
    by_status: dict[str, dict] = {}
    for e in rows:
        key = "withdrawn" if e.seq in withdrawn else _st(e)
        bucket = by_status.setdefault(key, {"count": 0, "amount": 0})
        bucket["count"] += 1
        bucket["amount"] += amounts(e)["total"]
    decided = sum(by_status.get(k, {}).get("count", 0) for k in ("2", "3", "4", "5", "withdrawn"))
    success = sum(by_status.get(k, {}).get("count", 0) for k in ("3", "5"))
    monthly: dict[str, int] = {}
    companies: dict[str, dict] = {}
    for e in rows:
        if e.created_at:
            monthly[e.created_at.strftime("%Y-%m")] = monthly.get(e.created_at.strftime("%Y-%m"), 0) + 1
        name = e.company.name if e.company else "(없음)"
        c = companies.setdefault(name, {"name": name, "count": 0, "amount": 0})
        c["count"] += 1
        c["amount"] += amounts(e)["total"]
    soon = datetime.now() + timedelta(days=7)
    expiring = db.query(Estimate).filter(Estimate.estimate_status == "2", Estimate.validity_period.isnot(None),
                                         Estimate.validity_period >= datetime.now(), Estimate.validity_period <= soon).all()
    return {
        "months": months,
        "total_count": len(rows),
        "total_amount": sum(b["amount"] for b in by_status.values()),
        "by_status": [{"status": k, "label": "계약철회" if k == "withdrawn" else STATUS_LABELS.get(k, k), **v}
                      for k, v in sorted(by_status.items())],
        "approval_rate": round(success / decided * 100, 1) if decided else None,
        "monthly": [{"month": k, "count": v} for k, v in sorted(monthly.items())],
        "top_companies": sorted(companies.values(), key=lambda c: -c["amount"])[:10],
        "expiring": [{"seq": e.seq, "title": e.estimate_title, "validity_period": _iso(e.validity_period)} for e in expiring],
    }


@router.get("/{seq}")
def get_estimate(seq: int, db: Session = Depends(get_db)):
    e = _get(db, seq)
    staff = {u.id: (u.name or u.username) for u in db.query(CustomAuthUser)}
    histories = db.query(EstimateStatusHistory).filter(EstimateStatusHistory.estimate_id == seq).order_by(EstimateStatusHistory.created_at).all()
    revisions = db.query(EstimateRevisionRequest).filter(EstimateRevisionRequest.estimate_id == seq).order_by(EstimateRevisionRequest.created_at.desc()).all()
    contracts = db.query(EstimateContract).filter(EstimateContract.estimate_id == seq).order_by(EstimateContract.seq.desc()).all()
    recipients = db.query(Manager).filter(Manager.company_id == e.company_id, Manager.email.isnot(None), Manager.email != "").all() if e.company_id else []
    fields = ("estimate_title", "estimate_number", "estimate_type", "project_id", "company_id", "estimate_content",
              "payment_terms", "delivery_terms", "tax_rate", "discount_type", "discount_rate", "discount_amount",
              "discount_description", "deposit_pct", "progress_pct", "balance_pct", "project_type",
              "contract_period_range", "contract_deposit", "point", "maint_subscription_plan", "free_maint_months",
              "free_maint_scope", "requirements", "folder_name", "converted_project_id", "dev_subscription_plan",
              "maint_hosting_type", "maint_hosting_provider", "maint_domain_id")
    data = {f: getattr(e, f) for f in fields}
    for f in ("written_date", "validity_period", "deposit_due_date", "progress_due_date", "balance_due_date",
              "contract_date", "contract_termination_date", "created_at", "maint_hosting_start_date", "maint_hosting_end_date"):
        data[f] = _iso(getattr(e, f))
    data["tax_rate"] = float(e.tax_rate) if e.tax_rate is not None else None
    data["discount_rate"] = float(e.discount_rate) if e.discount_rate is not None else None
    return {
        "seq": e.seq,
        **data,
        "estimate_content": sanitize_html(e.estimate_content),
        "company_name": e.company.name if e.company else None,
        "status": _st(e),
        "status_label": STATUS_LABELS.get(_st(e), "-"),
        "withdrawn": seq in _withdrawn_ids(db),
        "manager_name": staff.get(e.estimate_manager_id),
        "customer_email_sent": e.customer_email_sent,
        "approval_token_created_at": _iso(e.approval_token_created_at),
        "amounts": amounts(e),
        "items": [{
            "seq": i.seq, "item_order": i.item_order, "category": i.category, "item_name": i.item_name,
            "specification": i.specification, "quantity": i.quantity, "unit": i.unit, "unit_price": i.unit_price,
            "is_separate": bool(i.is_separate), "remarks": i.remarks,
            "total": 0 if i.is_separate else (i.quantity or 0) * (i.unit_price or 0),
        } for i in sorted(e.items, key=lambda x: (x.item_order or 0, x.seq))],
        "histories": [{
            "previous_status": h.previous_status, "new_status": h.new_status,
            "by": staff.get(h.changed_by_id) if h.changed_by_id else "고객",
            "reason": h.change_reason, "created_at": _iso(h.created_at),  # 저장값 KST — 보정하지 않는다
        } for h in histories],
        "revisions": [{
            "seq": r.seq, "requester_name": r.requester_name, "requester_email": r.requester_email, "title": r.title,
            "content": r.content, "is_resolved": bool(r.is_resolved), "resolved_comment": r.resolved_comment,
            "resolved_at": _iso(r.resolved_at), "created_at": _iso(r.created_at),
        } for r in revisions],
        "contracts": [{"seq": c.seq, "contract_number": c.contract_number, "status": str(c.status),
                       "status_label": CONTRACT_STATUS_LABELS.get(str(c.status), "-")} for c in contracts],
        "recipients": [{"seq": m.seq, "name": m.name, "email": m.email} for m in recipients],
        "project_types": PROJECT_TYPES,
        "write_enabled": write_enabled("estimates"),
    }


@router.get("/{seq}/pdf")
def estimate_pdf(seq: int, db: Session = Depends(get_db)):
    e = _get(db, seq)
    pdf = bytes(generate_estimate_pdf(build_estimate_pdf_data(db, e)))
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f"inline; filename=estimate_{seq}.pdf"})


# ── 작성·수정 ───────────────────────────────────────────────────────────

class EstimateBody(BaseModel):
    company_id: int | None = None
    project_id: int | None = None
    estimate_title: str | None = None
    estimate_number: str | None = None
    estimate_type: str | None = None
    written_date: date | None = None
    validity_period: datetime | None = None
    deposit_pct: int | None = None
    deposit_due_date: date | None = None
    progress_pct: int | None = None
    progress_due_date: date | None = None
    balance_pct: int | None = None
    balance_due_date: date | None = None
    payment_terms: str | None = None
    delivery_terms: str | None = None
    tax_rate: float | None = None
    estimate_content: str | None = None
    project_type: str | None = None
    contract_date: date | None = None
    contract_termination_date: date | None = None
    contract_period_range: str | None = None
    contract_deposit: int | None = None
    point: int | None = None
    maint_subscription_plan: str | None = None
    dev_subscription_plan: str | None = None
    maint_hosting_type: str | None = None
    maint_hosting_provider: str | None = None
    maint_hosting_start_date: date | None = None
    maint_hosting_end_date: date | None = None
    maint_domain_id: int | None = None
    free_maint_months: int | None = None
    free_maint_scope: str | None = None
    discount_type: str | None = None
    discount_rate: float | None = None
    discount_amount: int | None = None
    discount_description: str | None = None
    requirements: str | None = None
    folder_name: str | None = None


def _apply(db: Session, e: Estimate, data: dict) -> None:
    if "project_type" in data and data["project_type"] == "14":
        raise HTTPException(status_code=400, detail="AI개발팀구축(유형 14)은 판매 종료되었습니다(FDE 로 대체).")
    from app.services.subscriptions import DEV_PLAN_DEFAULTS
    from app.utils.maint_plans import PLAN_DEFAULTS as MAINT_PLANS
    if data.get("maint_subscription_plan") and data["maint_subscription_plan"] not in MAINT_PLANS:
        raise HTTPException(status_code=400, detail="유지보수구독 요금제가 올바르지 않습니다.")
    if data.get("dev_subscription_plan") and data["dev_subscription_plan"] not in DEV_PLAN_DEFAULTS:
        raise HTTPException(status_code=400, detail="개발구독 플랜이 올바르지 않습니다.")
    if data.get("maint_hosting_type") not in (None, "", "I", "E"):
        raise HTTPException(status_code=400, detail="호스팅 구분이 올바르지 않습니다.")
    if data.get("maint_domain_id") and e.company_id and not db.query(Domain.seq).filter(
            Domain.seq == data["maint_domain_id"], Domain.company_id == (data.get("company_id") or e.company_id)).first():
        raise HTTPException(status_code=400, detail="이 업체의 도메인이 아닙니다.")
    if "discount_type" in data and data["discount_type"] not in (None, "", "1", "2"):
        raise HTTPException(status_code=400, detail="할인 유형이 올바르지 않습니다.")
    if "estimate_number" in data and data["estimate_number"]:
        dup = db.query(Estimate.seq).filter(Estimate.estimate_number == data["estimate_number"], Estimate.seq != (e.seq or 0)).first()
        if dup:
            raise HTTPException(status_code=400, detail="이미 사용 중인 견적번호입니다.")
    for key, value in data.items():
        if key == "estimate_content":
            value = sanitize_html(value)
        elif key in ("contract_date", "contract_termination_date") and value:
            value = datetime.combine(value, datetime.min.time())
        elif isinstance(value, str):
            value = value.strip() or None
        setattr(e, key, value)
    if str(e.project_type or "") != "15":  # cms apply_maint_estimate_fields — 유형 15 가 아니면 호스팅 필드를 비운다
        e.maint_hosting_type = e.maint_hosting_provider = e.maint_domain_id = None
        e.maint_hosting_start_date = e.maint_hosting_end_date = None
    elif e.maint_hosting_type != "E":
        e.maint_hosting_provider = None
    if "written_date" in data and e.written_date:
        e.estimate_date = datetime.combine(e.written_date, datetime.min.time())
    e.updated_at = datetime.now()


@router.post("", dependencies=[WRITE])
def create_estimate(body: EstimateBody, request: Request, staff: CustomAuthUser = Depends(get_current_staff),
                    db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    if not data.get("company_id") or not (data.get("estimate_title") or "").strip():
        raise HTTPException(status_code=400, detail="업체와 제목은 필수입니다.")
    now = datetime.now()
    e = Estimate(estimate_status="1", estimate_manager_id=staff.id, tax_rate=10.0, created_at=now, estimate_amount=0)
    data.setdefault("written_date", date.today())
    data.setdefault("estimate_number", next_estimate_number(db, data["written_date"]))
    _apply(db, e, data)
    db.add(e)
    db.flush()
    staff_auth.audit(db, request, "estimate_create", user_id=staff.id, target=f"estimate:{e.seq}")
    db.commit()
    return {"seq": e.seq}


@router.patch("/{seq}", dependencies=[WRITE])
def update_estimate(seq: int, body: EstimateBody, db: Session = Depends(get_db)):
    e = _get(db, seq, lock=True)
    if _st(e) == "5":
        raise HTTPException(status_code=400, detail="계약전환된 견적서는 수정할 수 없습니다.")
    _apply(db, e, body.model_dump(exclude_unset=True))
    db.commit()
    return {"ok": True}


class StepUp(BaseModel):
    password: str


@router.post("/{seq}/delete", dependencies=[WRITE])
def delete_estimate(seq: int, body: StepUp, request: Request, staff: CustomAuthUser = Depends(get_current_staff),
                    db: Session = Depends(get_db)):
    """삭제 — 전환됐거나 서명된 계약서가 있으면 거부. 하위 행은 cms CASCADE/SET_NULL 과 같게 정리."""
    verify_step_up(staff, body.password)
    e = _get(db, seq, lock=True)
    if _st(e) == "5" or e.converted_project_id:
        raise HTTPException(status_code=400, detail="계약전환된 견적서는 삭제할 수 없습니다.")
    if db.query(EstimateContract.seq).filter(EstimateContract.estimate_id == seq, EstimateContract.status.in_(["4", "6"])).first():
        raise HTTPException(status_code=400, detail="서명된 계약서가 있는 견적서는 삭제할 수 없습니다.")
    db.query(EstimateItem).filter(EstimateItem.estimate_id == seq).delete(synchronize_session=False)
    db.query(EstimateStatusHistory).filter(EstimateStatusHistory.estimate_id == seq).delete(synchronize_session=False)
    db.query(EstimateRevisionRequest).filter(EstimateRevisionRequest.estimate_id == seq).delete(synchronize_session=False)
    for table in ("estimate_contract", "sales_lead", "maint_renewal"):
        db.execute(text(f"UPDATE `{table}` SET estimate_id = NULL WHERE estimate_id = :id"), {"id": seq})
    for table in ("pacms_devsubscription", "pacms_aidevsubscription", "pacms_maintsubscription"):
        db.execute(text(f"UPDATE `{table}` SET source_estimate_id = NULL WHERE source_estimate_id = :id"), {"id": seq})
    staff_auth.audit(db, request, "estimate_delete", user_id=staff.id, target=f"estimate:{seq}", detail=e.estimate_number)
    db.expunge(e)
    db.execute(text("DELETE FROM `Estimate` WHERE seq = :id"), {"id": seq})
    db.commit()
    return {"ok": True}


# ── 항목 ────────────────────────────────────────────────────────────────

class ItemBody(BaseModel):
    category: str | None = None
    item_name: str
    specification: str | None = None
    quantity: int = 1
    unit: str = "식"
    unit_price: int = 0
    is_separate: bool = False
    remarks: str | None = None


def _editable(db: Session, seq: int) -> Estimate:
    e = _get(db, seq, lock=True)
    if _st(e) == "5":
        raise HTTPException(status_code=400, detail="계약전환된 견적서는 수정할 수 없습니다.")
    return e


@router.post("/{seq}/items", dependencies=[WRITE])
def add_item(seq: int, body: ItemBody, db: Session = Depends(get_db)):
    e = _editable(db, seq)
    if not body.item_name.strip():
        raise HTTPException(status_code=400, detail="항목명을 입력하세요.")
    order = max((i.item_order or 0 for i in e.items), default=0) + 1
    now = datetime.now()
    item = EstimateItem(estimate_id=seq, item_order=order, created_at=now, updated_at=now,
                        **(body.model_dump() | {"unit": body.unit or "식"}))
    db.add(item)
    e.updated_at = now
    db.commit()
    return {"seq": item.seq}


@router.patch("/items/{item_id}", dependencies=[WRITE])
def update_item(item_id: int, body: ItemBody, db: Session = Depends(get_db)):
    item = db.query(EstimateItem).filter(EstimateItem.seq == item_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="항목을 찾을 수 없습니다.")
    _editable(db, item.estimate_id)
    for key, value in body.model_dump().items():
        setattr(item, key, value)
    item.updated_at = datetime.now()
    db.commit()
    return {"ok": True}


@router.post("/items/{item_id}/delete", dependencies=[WRITE])
def delete_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(EstimateItem).filter(EstimateItem.seq == item_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="항목을 찾을 수 없습니다.")
    _editable(db, item.estimate_id)
    db.delete(item)
    db.commit()
    return {"ok": True}


class Reorder(BaseModel):
    item_ids: list[int]


@router.post("/{seq}/items/reorder", dependencies=[WRITE])
def reorder_items(seq: int, body: Reorder, db: Session = Depends(get_db)):
    e = _editable(db, seq)
    by_id = {i.seq: i for i in e.items}
    for order, item_id in enumerate(body.item_ids, start=1):
        if item_id in by_id:
            by_id[item_id].item_order = order
    db.commit()
    return {"ok": True}


class ScaleBody(BaseModel):
    target_subtotal: int
    apply: bool = False


@router.post("/{seq}/items/scale", dependencies=[WRITE])
def scale_items(seq: int, body: ScaleBody, db: Session = Depends(get_db)):
    """단가 일괄 조정(cms 견적서관리(new)): 목표 소계 ÷ 현재 소계 비율, 50만원 단위 반올림(0 초과면 최소 50만원), 별도 항목 제외."""
    e = _editable(db, seq)
    current = amounts(e)["subtotal"]
    if current <= 0 or body.target_subtotal <= 0:
        raise HTTPException(status_code=400, detail="현재 소계와 목표 소계가 0 보다 커야 합니다.")
    ratio = body.target_subtotal / current
    preview = []
    for i in e.items:
        if i.is_separate or not i.unit_price:
            continue
        new_price = int(round(i.unit_price * ratio / 500000) * 500000) or 500000
        preview.append({"seq": i.seq, "item_name": i.item_name, "old": i.unit_price, "new": new_price})
        if body.apply:
            i.unit_price = new_price
    if body.apply:
        e.updated_at = datetime.now()
        db.commit()
    return {"ratio": round(ratio, 4), "items": preview,
            "new_subtotal": sum(p["new"] * next(x.quantity or 0 for x in e.items if x.seq == p["seq"]) for p in preview)}


# ── 발송·상태 ───────────────────────────────────────────────────────────

class SendBody(BaseModel):
    email: str


@router.post("/{seq}/send", dependencies=[WRITE])
def send_estimate(seq: int, body: SendBody, request: Request, background: BackgroundTasks,
                  staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    e = _get(db, seq, lock=True)
    if _st(e) not in SENDABLE:
        raise HTTPException(status_code=400, detail=f"{STATUS_LABELS.get(_st(e))} 상태의 견적서는 발송할 수 없습니다.")
    email = body.email.strip()
    if "@" not in email:
        raise HTTPException(status_code=400, detail="이메일을 확인하세요.")
    if not e.items:
        raise HTTPException(status_code=400, detail="항목이 없는 견적서는 발송할 수 없습니다.")
    token = secrets.token_urlsafe(32)
    now = datetime.now()
    e.approval_token = token
    e.approval_token_created_at = now
    e.customer_email_sent = email
    _history(db, e, "2", staff.id, f"고객 이메일 발송: {email}")
    e.estimate_status = "2"
    e.updated_at = now
    a = amounts(e)
    manager = db.query(CustomAuthUser).filter(CustomAuthUser.id == e.estimate_manager_id).first()
    staff_auth.audit(db, request, "estimate_send", user_id=staff.id, target=f"estimate:{seq}", detail=email)
    db.commit()
    background.add_task(send_estimate_to_customer_mail, email, seq, e.estimate_title, e.estimate_number, a["total"], a["tax"],
                        e.validity_period.strftime("%Y-%m-%d %H:%M") if e.validity_period else None, token,
                        manager.name if manager else None, manager.email if manager else None)
    return {"ok": True}


class StatusBody(BaseModel):
    status: str
    reason: str | None = None


@router.post("/{seq}/status", dependencies=[WRITE])
def change_status(seq: int, body: StatusBody, background: BackgroundTasks,
                  staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    e = _get(db, seq, lock=True)
    if body.status not in MANUAL_STATUSES:
        raise HTTPException(status_code=400, detail="수동으로는 작성중·발송·승인·거절만 지정할 수 있습니다(계약전환은 전환 기능으로).")
    if _st(e) == "5":
        raise HTTPException(status_code=400, detail="계약전환된 견적서는 계약 철회로만 되돌릴 수 있습니다.")
    if body.status == _st(e):
        return {"ok": True}
    if body.status not in MANUAL_TRANSITIONS.get(_st(e), set()):
        raise HTTPException(status_code=400, detail=f"{STATUS_LABELS.get(_st(e))} → {STATUS_LABELS.get(body.status)} 로는 바꿀 수 없습니다.")
    previous = _st(e)
    _history(db, e, body.status, staff.id, (body.reason or "").strip())
    e.estimate_status = body.status
    e.updated_at = datetime.now()
    db.commit()
    if body.status == "3" and previous != "3":
        manager = db.query(CustomAuthUser).filter(CustomAuthUser.id == e.estimate_manager_id).first()
        if manager and manager.email:
            background.add_task(notify_manager_estimate_action, manager.email, seq, e.estimate_title,
                                e.estimate_number, "approved", staff.name or staff.username, body.reason or "")
    return {"ok": True}


class ResolveBody(BaseModel):
    comment: str | None = None


@router.post("/revisions/{rid}/resolve", dependencies=[WRITE])
def resolve_revision(rid: int, body: ResolveBody, staff: CustomAuthUser = Depends(get_current_staff),
                     db: Session = Depends(get_db)):
    r = db.query(EstimateRevisionRequest).filter(EstimateRevisionRequest.seq == rid).first()
    if r is None:
        raise HTTPException(status_code=404, detail="수정요청을 찾을 수 없습니다.")
    now = datetime.now()
    r.is_resolved = True
    r.resolved_by_id = staff.id
    r.resolved_at = now
    r.resolved_comment = (body.comment or "").strip()
    r.updated_at = now
    db.commit()
    return {"ok": True}
