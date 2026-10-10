"""고객 계정 초대 수락(공개) — /api/auth/invite/*. 링크의 토큰으로 비밀번호를 설정한다."""
import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from passlib.hash import django_pbkdf2_sha256
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.company import Company
from app.models.manager import Manager
from app.services import customer_invite

router = APIRouter(prefix="/auth/invite", tags=["invite"])

PASSWORD_RE = re.compile(r"^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$")


class TokenBody(BaseModel):
    token: str


@router.post("/verify")
def verify(body: TokenBody, db: Session = Depends(get_db)):
    row = customer_invite.find_valid(db, body.token)
    manager = db.query(Manager).filter(Manager.seq == row.manager_seq).first() if row else None
    if manager is None:
        raise HTTPException(status_code=400, detail="유효하지 않거나 만료된 링크입니다. 담당자에게 다시 요청해주세요.")
    company = db.query(Company).filter(Company.seq == manager.company_id).first()
    return {"login_id": manager.login_id, "name": manager.name, "company_name": company.name if company else None}


class AcceptBody(BaseModel):
    token: str
    password: str
    confirm_password: str


@router.post("/accept")
def accept(body: AcceptBody, db: Session = Depends(get_db)):
    if body.password != body.confirm_password:
        raise HTTPException(status_code=400, detail="비밀번호와 확인 비밀번호가 일치하지 않습니다.")
    if not PASSWORD_RE.match(body.password):
        raise HTTPException(status_code=400, detail="비밀번호는 최소 8자 이상이며, 영문자, 숫자, 특수문자를 포함해야 합니다.")
    row = customer_invite.find_valid(db, body.token, lock=True)
    manager = db.query(Manager).filter(Manager.seq == row.manager_seq).first() if row else None
    if manager is None:
        raise HTTPException(status_code=400, detail="유효하지 않거나 만료된 링크입니다. 담당자에게 다시 요청해주세요.")
    manager.password = django_pbkdf2_sha256.using(rounds=870000).hash(body.password)
    manager.is_first_login = False
    manager.login_attempt_count = 0
    manager.login_permit_tf = "1"
    manager.updated_at = datetime.now()
    row.used_at = datetime.now()
    db.commit()
    return {"login_id": manager.login_id}
