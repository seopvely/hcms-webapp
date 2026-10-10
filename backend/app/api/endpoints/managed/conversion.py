"""계약전환·철회 (/api/managed/estimates/{id}/convert, /api/managed/contracts/{id}/withdraw*).
쓰기 영역 'conversion' — cms 의 전환·철회 버튼을 막는 시점에 켠다(두 구현이 동시에 살아 있지 않게)."""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.endpoints.managed.common import require_write, verify_step_up
from app.core.deps import get_current_staff
from app.db.session import get_db
from app.models.customer import CustomAuthUser, EstimateContract, SalesLead
from app.services import contracts as contract_svc
from app.services import conversion as svc
from app.services import staff_auth

router = APIRouter(tags=["managed-conversion"])
WRITE = require_write("conversion")


@router.get("/estimates/{seq}/convert-options")
def convert_options(seq: int, db: Session = Depends(get_db)):
    """전환 때 연결할 영업접수 후보(같은 견적에 연결된 리드 우선)."""
    leads = db.query(SalesLead).filter(SalesLead.is_draft == False, SalesLead.status.notin_(["lost"])).order_by(  # noqa: E712
        (SalesLead.estimate_id == seq).desc(), SalesLead.created_at.desc()).limit(50).all()
    return {"leads": [{"seq": l.seq, "title": l.title, "client_company": l.client_company, "status": l.status,
                       "linked": l.estimate_id == seq} for l in leads]}


class ConvertBody(BaseModel):
    password: str
    sales_lead_id: int | None = None
    reason: str | None = None


@router.post("/estimates/{seq}/convert", dependencies=[WRITE])
def convert(seq: int, body: ConvertBody, request: Request, staff: CustomAuthUser = Depends(get_current_staff),
            db: Session = Depends(get_db)):
    verify_step_up(staff, body.password)
    project = svc.convert(db, staff, seq, body.sales_lead_id, (body.reason or "").strip())
    staff_auth.audit(db, request, "estimate_convert", user_id=staff.id, target=f"estimate:{seq}", detail=f"project:{project.seq}")
    db.commit()
    return {"project_id": project.seq, "project_title": project.title}


@router.get("/contracts/{seq}/withdraw-info")
def withdraw_info(seq: int, db: Session = Depends(get_db)):
    c = db.query(EstimateContract).filter(EstimateContract.seq == seq).first()
    if c is None:
        raise HTTPException(status_code=404, detail="계약서를 찾을 수 없습니다.")
    return svc.withdraw_context(db, c) or {"project_id": None}


class WithdrawBody(BaseModel):
    password: str
    reason: str | None = None
    project_action: str = "stop"  # stop | delete


@router.post("/contracts/{seq}/withdraw", dependencies=[WRITE])
def withdraw(seq: int, body: WithdrawBody, request: Request, staff: CustomAuthUser = Depends(get_current_staff),
             db: Session = Depends(get_db)):
    verify_step_up(staff, body.password)
    if body.project_action not in ("stop", "delete"):
        raise HTTPException(status_code=400, detail="프로젝트 처리 방식이 올바르지 않습니다.")
    c = db.query(EstimateContract).filter(EstimateContract.seq == seq).with_for_update().first()
    if c is None:
        raise HTTPException(status_code=404, detail="계약서를 찾을 수 없습니다.")
    result = svc.withdraw(db, staff, c, (body.reason or "").strip(), body.project_action)
    contract_svc.history(db, c, "cancelled", result["description"], request, staff.id, staff.name or staff.username)
    staff_auth.audit(db, request, "contract_withdraw", user_id=staff.id, target=f"contract:{seq}", detail=", ".join(result["done"])[:500])
    db.commit()
    return result
