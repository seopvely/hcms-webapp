"""직원 계약서 API (/api/managed/contracts).

상태(varchar): 1 작성중 / 2 검토대기 / 3 발송 / 4 서명완료(갑) / 5 취소 / 6 쌍방서명완료. 상태 머신:
- 수정은 1·2, 발송은 1·2(토큰 재발급), 재발송은 3(토큰 유지·24시간 연장), 을 서명은 4 에서 1회.
- 수동 변경: 1↔2, 1~4 → 5(취소). 서명된(4·6) 계약서는 삭제 불가. 6 의 취소는 계약 철회(전환 회수)로만.
- 견적 기반으로 만들 때 company 를 견적 업체로 채운다(cms 는 비워 고객 링크가 안 나갔다).
"""
import secrets
from datetime import date, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.endpoints.managed.common import page_response, require_write, verify_step_up, write_enabled
from app.api.endpoints.managed.estimates import amounts
from app.core.deps import get_current_staff
from app.db.session import get_db
from app.models.company import Company
from app.models.customer import CustomAuthUser, Estimate, EstimateContract, EstimateContractHistory
from app.models.manager import Manager
from app.services import contracts as svc
from app.services import staff_auth
from app.services.email import send_contract_mail
from app.services.staff_auth import client_ip

router = APIRouter(prefix="/contracts", tags=["managed-contracts"])
WRITE = require_write("contracts")

EDITABLE = {"1", "2"}
FIELDS = ("contract_title", "party_a_name", "party_a_ceo", "party_a_business_number", "party_a_address", "party_a_email",
          "party_b_name", "party_b_ceo", "party_b_business_number", "party_b_address", "party_b_email",
          "contract_amount", "contract_period", "project_description", "service_scope", "payment_terms",
          "special_terms", "maintenance_point", "free_maint_months", "free_maint_scope", "project_type")
DATE_FIELDS = ("contract_date", "contract_start_date", "contract_end_date")


def _iso(v):
    return v.isoformat() if v else None


def _get(db: Session, seq: int, lock: bool = False) -> EstimateContract:
    q = db.query(EstimateContract).filter(EstimateContract.seq == seq)
    if lock:
        q = q.with_for_update()
    c = q.first()
    if c is None:
        raise HTTPException(status_code=404, detail="계약서를 찾을 수 없습니다.")
    return c


def _company_id(db: Session, c: EstimateContract) -> int | None:
    if c.company_id:
        return c.company_id
    e = db.query(Estimate.company_id).filter(Estimate.seq == c.estimate_id).first() if c.estimate_id else None
    return e[0] if e else None


@router.get("")
def list_contracts(
    q: str | None = None,
    status: str | None = None,
    company_id: int | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(EstimateContract).outerjoin(Estimate, EstimateContract.estimate_id == Estimate.seq)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(EstimateContract.contract_number.like(like), EstimateContract.contract_title.like(like),
                                 EstimateContract.party_a_name.like(like)))
    if status:
        query = query.filter(EstimateContract.status == status)
    if company_id:  # 직접 등록 계약(company_id)과 견적 기반 계약(견적 업체) 모두
        query = query.filter(or_(EstimateContract.company_id == company_id, Estimate.company_id == company_id))
    total = query.count()
    rows = query.order_by(EstimateContract.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    counts: dict[str, int] = {}
    for (s,) in db.query(EstimateContract.status):
        counts[str(s)] = counts.get(str(s), 0) + 1
    items = [{
        "seq": c.seq, "contract_number": c.contract_number, "contract_title": c.contract_title, "party_a_name": c.party_a_name,
        "contract_amount": c.contract_amount, "status": svc.status_of(c), "status_label": svc.STATUS_LABELS.get(svc.status_of(c), "-"),
        "estimate_id": c.estimate_id, "sent_at": _iso(c.sent_at), "customer_signed_at": _iso(c.customer_signed_at),
        "created_at": _iso(c.created_at),
    } for c in rows]
    return page_response(items, total, page, per_page) | {
        "stats": [{"status": k, "label": v, "count": counts.get(k, 0)} for k, v in svc.STATUS_LABELS.items()],
        "write_enabled": write_enabled("contracts"),
    }


@router.get("/prefill")
def prefill(estimate_id: int, db: Session = Depends(get_db)):
    """견적 기반 계약서 기본값(cms contract_create GET 과 같은 규칙)."""
    import json

    e = db.query(Estimate).filter(Estimate.seq == estimate_id).first()
    if e is None:
        raise HTTPException(status_code=404, detail="견적서를 찾을 수 없습니다.")
    company = db.query(Company).filter(Company.seq == e.company_id).first() if e.company_id else None
    manager = db.query(Manager).filter(Manager.company_id == e.company_id, Manager.email.isnot(None)).first() if e.company_id else None
    payment_terms = e.payment_terms or ""
    if not payment_terms:
        parts = []
        for label, pct, due in (("착수금", e.deposit_pct, e.deposit_due_date), ("중도금", e.progress_pct, e.progress_due_date),
                                ("잔금", e.balance_pct, e.balance_due_date)):
            if pct:
                parts.append(f"{label} {pct}%" + (f" (납부예정일: {due:%Y-%m-%d})" if due else ""))
        payment_terms = ", ".join(parts)
    try:
        ai = json.loads(e.ai_contract_data) if e.ai_contract_data else {}
        ai = ai if isinstance(ai, dict) else {}
    except ValueError:
        ai = {}
    address = " ".join(p for p in ((company.address if company else None), (company.address_de if company else None)) if p)
    return {
        "estimate_id": e.seq,
        "contract_title": e.estimate_title,
        "party_a_name": company.name if company else "",
        "party_a_ceo": company.ceoname if company else "",
        "party_a_business_number": company.business_number if company else "",
        "party_a_address": address,
        "party_a_email": (manager.email if manager else None) or (company.ceo_email if company else "") or "",
        **svc.party_b_defaults(),
        "contract_amount": amounts(e)["total"],
        "contract_date": date.today().isoformat(),
        "contract_start_date": _iso(e.contract_date.date() if e.contract_date else None),
        "contract_end_date": _iso(e.contract_termination_date.date() if e.contract_termination_date else None),
        "contract_period": e.contract_period_range or "",
        "maintenance_point": e.point,
        "free_maint_months": e.free_maint_months,
        "free_maint_scope": e.free_maint_scope or "",
        "project_type": e.project_type,
        "project_description": ai.get("project_description") or "",
        "service_scope": ai.get("service_scope") or "",
        "payment_terms": ai.get("payment_terms") or payment_terms,
        "special_terms": ai.get("special_terms") or "",
    }


@router.get("/{seq}")
def get_contract(seq: int, db: Session = Depends(get_db)):
    c = _get(db, seq)
    staff = {u.id: (u.name or u.username) for u in db.query(CustomAuthUser)}
    hist = db.query(EstimateContractHistory).filter(EstimateContractHistory.contract_id == seq).order_by(EstimateContractHistory.created_at.desc()).all()
    company_id = _company_id(db, c)
    recipients = db.query(Manager).filter(Manager.company_id == company_id, Manager.email.isnot(None), Manager.email != "").all() if company_id else []
    estimate = db.query(Estimate).filter(Estimate.seq == c.estimate_id).first() if c.estimate_id else None
    return {
        "seq": c.seq,
        **{f: getattr(c, f) for f in FIELDS},
        **{f: _iso(getattr(c, f)) for f in DATE_FIELDS},
        "contract_number": c.contract_number,
        "status": svc.status_of(c),
        "status_label": svc.STATUS_LABELS.get(svc.status_of(c), "-"),
        "estimate": {"seq": estimate.seq, "number": estimate.estimate_number, "status": str(estimate.estimate_status),
                     "converted_project_id": estimate.converted_project_id} if estimate else None,
        "company_id": company_id,
        "sent_at": _iso(c.sent_at), "sent_to_email": c.sent_to_email, "token_valid": svc.token_valid(c),
        "customer_signed_at": _iso(c.customer_signed_at), "customer_signed_name": c.customer_signed_name,
        "customer_signed_hash": c.customer_signed_hash,
        "manager_signed_at": _iso(c.manager_signed_at), "manager_signed_name": c.manager_signed_name,
        "manager_signed_hash": c.manager_signed_hash,
        "has_signed_pdf": bool(c.contract_file),
        "created_by": staff.get(c.created_by_id),
        "recipients": [{"seq": m.seq, "name": m.name, "email": m.email} for m in recipients],
        "histories": [{"action": h.action, "by": h.action_by_name or staff.get(h.action_by_id), "description": h.description,
                       "ip": h.ip_address, "created_at": _iso(h.created_at)} for h in hist],
        "write_enabled": write_enabled("contracts"),
    }


@router.get("/{seq}/pdf")
def contract_pdf(seq: int, signed: bool = False, db: Session = Depends(get_db)):
    """현재 내용으로 렌더링한 PDF. signed=true 면 서명 시점에 보관한 스냅샷."""
    c = _get(db, seq)
    if signed:
        from app.utils.media import file_download_response

        return file_download_response(c.contract_file, f"{c.contract_number}_signed.pdf")
    return Response(content=svc.render_pdf(db, c), media_type="application/pdf",
                    headers={"Content-Disposition": f"inline; filename=contract_{seq}.pdf"})


class ContractBody(BaseModel):
    estimate_id: int | None = None
    company_id: int | None = None
    contract_title: str | None = None
    party_a_name: str | None = None
    party_a_ceo: str | None = None
    party_a_business_number: str | None = None
    party_a_address: str | None = None
    party_a_email: str | None = None
    party_b_name: str | None = None
    party_b_ceo: str | None = None
    party_b_business_number: str | None = None
    party_b_address: str | None = None
    party_b_email: str | None = None
    contract_amount: int | None = None
    contract_date: date | None = None
    contract_start_date: date | None = None
    contract_end_date: date | None = None
    contract_period: str | None = None
    project_description: str | None = None
    service_scope: str | None = None
    payment_terms: str | None = None
    special_terms: str | None = None
    maintenance_point: int | None = None
    free_maint_months: int | None = None
    free_maint_scope: str | None = None
    project_type: str | None = None
    review: bool = False


def _apply(c: EstimateContract, data: dict) -> None:
    for key in FIELDS + DATE_FIELDS:
        if key in data:
            value = data[key]
            if isinstance(value, str):
                value = value.strip()
            if key.startswith("party_b_") and not value:
                continue  # 을 정보는 NOT NULL — 비우면 기본값 유지
            setattr(c, key, value)
    c.updated_at = datetime.now()


@router.post("", dependencies=[WRITE])
def create_contract(body: ContractBody, request: Request, staff: CustomAuthUser = Depends(get_current_staff),
                    db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    if not (data.get("contract_title") or "").strip():
        raise HTTPException(status_code=400, detail="계약서 제목을 입력하세요.")
    company_id = data.get("company_id")
    if body.estimate_id:
        e = db.query(Estimate).filter(Estimate.seq == body.estimate_id).first()
        if e is None:
            raise HTTPException(status_code=404, detail="견적서를 찾을 수 없습니다.")
        company_id = e.company_id
    if not company_id:
        raise HTTPException(status_code=400, detail="업체를 지정하세요.")
    now = datetime.now()
    c = EstimateContract(estimate_id=body.estimate_id, company_id=company_id, contract_number=svc.next_contract_number(db),
                         status="2" if body.review else "1", created_by_id=staff.id, created_at=now, **svc.party_b_defaults())
    _apply(c, data)
    db.add(c)
    db.flush()
    svc.history(db, c, "created", "계약서 생성", request, staff.id, staff.name or staff.username)
    db.commit()
    return {"seq": c.seq}


@router.patch("/{seq}", dependencies=[WRITE])
def update_contract(seq: int, body: ContractBody, request: Request, staff: CustomAuthUser = Depends(get_current_staff),
                    db: Session = Depends(get_db)):
    c = _get(db, seq, lock=True)
    if svc.status_of(c) not in EDITABLE:
        raise HTTPException(status_code=400, detail="작성중·검토대기 상태에서만 수정할 수 있습니다.")
    data = body.model_dump(exclude_unset=True)
    _apply(c, data)
    if "review" in data:
        c.status = "2" if body.review else "1"
    svc.history(db, c, "updated", "계약서 수정", request, staff.id, staff.name or staff.username)
    db.commit()
    return {"ok": True}


class SendBody(BaseModel):
    email: str


@router.post("/{seq}/send", dependencies=[WRITE])
def send_contract(seq: int, body: SendBody, request: Request, background: BackgroundTasks,
                  staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    c = _get(db, seq, lock=True)
    if svc.status_of(c) not in EDITABLE:
        raise HTTPException(status_code=400, detail="작성중·검토대기 계약서만 발송할 수 있습니다(발송 후에는 재발송).")
    email = body.email.strip()
    if "@" not in email:
        raise HTTPException(status_code=400, detail="이메일을 확인하세요.")
    c.customer_signature_token = secrets.token_urlsafe(32)
    c.sent_at = datetime.now()
    c.sent_to_email = email
    c.sent_by_id = staff.id
    c.status = "3"
    if not c.company_id:
        c.company_id = _company_id(db, c)
    svc.history(db, c, "sent", f"계약서 발송: {email}", request, staff.id, staff.name or staff.username)
    db.commit()
    background.add_task(send_contract_mail, email, c.contract_title, c.contract_number, c.customer_signature_token)
    return {"ok": True}


@router.post("/{seq}/resend", dependencies=[WRITE])
def resend_contract(seq: int, body: SendBody, request: Request, background: BackgroundTasks,
                    staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """재발송 — 토큰은 유지하고 유효 24시간을 새로 연다(cms 와 같음)."""
    c = _get(db, seq, lock=True)
    if svc.status_of(c) != "3" or not c.customer_signature_token:
        raise HTTPException(status_code=400, detail="발송 상태(서명 전) 계약서만 재발송할 수 있습니다.")
    email = body.email.strip() or c.sent_to_email
    c.sent_at = datetime.now()
    c.sent_to_email = email
    svc.history(db, c, "resent", f"계약서 재발송: {email}", request, staff.id, staff.name or staff.username)
    db.commit()
    background.add_task(send_contract_mail, email, c.contract_title, c.contract_number, c.customer_signature_token)
    return {"ok": True}


@router.post("/{seq}/manager-sign", dependencies=[WRITE])
def manager_sign(seq: int, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    c = _get(db, seq, lock=True)
    if svc.status_of(c) != "4":
        raise HTTPException(status_code=400, detail="고객 서명이 완료된 계약서만 을 서명할 수 있습니다.")
    if c.manager_signed_hash:
        raise HTTPException(status_code=400, detail="이미 을 서명이 완료된 계약서입니다.")
    now = datetime.now()
    name = staff.name or staff.username
    ip = client_ip(request)
    c.manager_signed_at = now
    c.manager_signed_name = name
    c.manager_signed_ip = ip
    c.manager_signed_user_agent = request.headers.get("user-agent", "")
    c.manager_signed_hash = svc.sign_hash(c, name, now, ip, "|manager")
    c.manager_signed_by_id = staff.id
    c.status = "6"
    svc.archive_pdf(db, c)
    svc.history(db, c, "manager_signed", f"을 서명 완료: {name} (타임스탬프 인증: {c.manager_signed_hash[:16]}...)",
                request, staff.id, name)
    db.commit()
    return {"ok": True}


class StatusBody(BaseModel):
    status: str
    reason: str | None = None


@router.post("/{seq}/status", dependencies=[WRITE])
def change_status(seq: int, body: StatusBody, request: Request, staff: CustomAuthUser = Depends(get_current_staff),
                  db: Session = Depends(get_db)):
    c = _get(db, seq, lock=True)
    cur, new = svc.status_of(c), body.status
    allowed = (cur in EDITABLE and new in EDITABLE) or (cur in {"1", "2", "3", "4"} and new == "5")
    if not allowed:
        raise HTTPException(status_code=400, detail="허용되지 않는 상태 변경입니다(쌍방서명 계약 취소는 계약 철회로).")
    c.status = new
    c.updated_at = datetime.now()
    if new == "5":
        svc.history(db, c, "cancelled", f"계약 취소: {(body.reason or '').strip()}", request, staff.id, staff.name or staff.username)
    db.commit()
    return {"ok": True}


class StepUp(BaseModel):
    password: str


@router.post("/{seq}/delete", dependencies=[WRITE])
def delete_contract(seq: int, body: StepUp, request: Request, staff: CustomAuthUser = Depends(get_current_staff),
                    db: Session = Depends(get_db)):
    verify_step_up(staff, body.password)
    c = _get(db, seq, lock=True)
    if svc.status_of(c) in ("4", "6"):
        raise HTTPException(status_code=400, detail="서명된 계약서는 삭제할 수 없습니다.")
    db.query(EstimateContractHistory).filter(EstimateContractHistory.contract_id == seq).delete(synchronize_session=False)
    staff_auth.audit(db, request, "contract_delete", user_id=staff.id, target=f"contract:{seq}", detail=c.contract_number)
    db.delete(c)
    db.commit()
    return {"ok": True}
