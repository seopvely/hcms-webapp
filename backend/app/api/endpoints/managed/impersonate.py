"""대리 로그인 — 직원이 고객 화면을 고객 계정으로 연다 (cms '고객사 이동' 대체).

짧은 고객 access 토큰(refresh 없음)에 act 클레임(직원)을 넣어 발급하고 감사 로그를 남긴다.
"""
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.deps import get_current_staff, require_staff_admin
from app.core.security import create_access_token
from app.db.session import get_db
from app.models.company import Company
from app.models.customer import CustomAuthUser
from app.models.manager import Manager
from app.services import staff_auth

router = APIRouter(tags=["managed-impersonate"])


@router.get("/customers")
def list_customer_accounts(
    q: str | None = Query(None, description="회사명·담당자명·아이디 검색"),
    _: CustomAuthUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
):
    """고객 계정 목록(회사별). 대리 로그인 대상 선택용."""
    query = db.query(Manager).options(joinedload(Manager.company)).outerjoin(Company, Manager.company_id == Company.seq)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(Company.name.like(like), Manager.name.like(like), Manager.login_id.like(like)))
    managers = query.order_by(Company.name, Manager.seq).all()
    return {
        "items": [
            {
                "seq": m.seq,
                "login_id": m.login_id,
                "name": m.name,
                "company_id": m.company_id,
                "company_name": m.company.name if m.company else None,
                "login_permit_tf": m.login_permit_tf,
                "last_login": m.last_login.isoformat() if m.last_login else None,
            }
            for m in managers
        ],
        "total": len(managers),
    }


class ImpersonateRequest(BaseModel):
    manager_seq: int


@router.post("/impersonate")
def impersonate(
    body: ImpersonateRequest,
    request: Request,
    staff: CustomAuthUser = Depends(require_staff_admin),
    db: Session = Depends(get_db),
):
    manager = db.query(Manager).options(joinedload(Manager.company)).filter(Manager.seq == body.manager_seq).first()
    if manager is None:
        raise HTTPException(status_code=404, detail="고객 계정을 찾을 수 없습니다.")

    minutes = settings.IMPERSONATION_MINUTES
    token = create_access_token(
        {
            "sub": str(manager.seq),
            "login_id": manager.login_id,
            "act": {"sub": str(staff.id), "typ": "staff", "name": staff.name or staff.username},
        },
        expires_delta=timedelta(minutes=minutes),
    )
    staff_auth.audit(
        db, request, "impersonate", user_id=staff.id, target=f"manager:{manager.seq}",
        detail=f"company={manager.company_id} login_id={manager.login_id}",
    )
    db.commit()
    return {
        "access_token": token,
        "expires_in": minutes * 60,
        "user": {
            "seq": manager.seq,
            "login_id": manager.login_id,
            "name": manager.name,
            "email": manager.email,
            "company_name": manager.company.name if manager.company else None,
            "company_id": manager.company_id,
        },
    }
