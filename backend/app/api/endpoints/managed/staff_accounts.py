"""직원(에이전트) 계정 관리 — 관리자 전용.

수정 가능 필드는 화이트리스트로 제한한다(is_superuser·group 등은 바꾸지 않는다).
삭제는 없다(비활성화만) — 장부·댓글 등 직원 FK 가 CASCADE 로 지워지지 않게.
"""
import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from passlib.hash import django_pbkdf2_sha256
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import require_staff_admin
from app.db.session import get_db
from app.models.customer import CustomAuthUser
from app.services import staff_auth

router = APIRouter(prefix="/staff", tags=["managed-staff"], dependencies=[Depends(require_staff_admin)])

PASSWORD_RE = re.compile(r"^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{10,}$")


def _serialize(u: CustomAuthUser) -> dict:
    return {
        "id": u.id,
        "username": u.username,
        "name": u.name,
        "email": u.email,
        "phone_number": u.phone_number,
        "department": u.department,
        "position": u.position,
        "previlege": u.previlege,
        "is_superuser": bool(u.is_superuser),
        "is_admin": staff_auth.is_admin(u),
        "is_active": bool(u.is_active),
        "two_factor_enabled": bool(u.two_factor_enabled),
        "totp_registered": bool(u.totp_secret and u.totp_confirmed_at),
        "last_login": u.last_login.isoformat() if u.last_login else None,
    }


def _get(db: Session, staff_id: int) -> CustomAuthUser:
    user = db.query(CustomAuthUser).filter(CustomAuthUser.id == staff_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="직원을 찾을 수 없습니다.")
    return user


@router.get("")
def list_staff(db: Session = Depends(get_db)):
    users = db.query(CustomAuthUser).order_by(CustomAuthUser.id).all()
    return {"items": [_serialize(u) for u in users], "total": len(users)}


class StaffUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    phone_number: str | None = None
    department: str | None = None
    position: str | None = None
    previlege: str | None = None  # '1' 관리자 / '2' 사용자
    is_active: bool | None = None
    two_factor_enabled: bool | None = None


@router.patch("/{staff_id}")
def update_staff(
    staff_id: int,
    body: StaffUpdate,
    request: Request,
    admin: CustomAuthUser = Depends(require_staff_admin),
    db: Session = Depends(get_db),
):
    user = _get(db, staff_id)
    changes = body.model_dump(exclude_unset=True)

    if user.id == admin.id and (changes.get("is_active") is False or changes.get("previlege") == "2"):
        raise HTTPException(status_code=400, detail="자기 계정을 비활성화하거나 관리자 권한을 내릴 수 없습니다.")
    if "previlege" in changes and changes["previlege"] not in ("1", "2"):
        raise HTTPException(status_code=400, detail="등급은 1(관리자) 또는 2(사용자)입니다.")
    if "email" in changes:
        email = (changes["email"] or "").strip().lower()
        if "@" not in email:
            raise HTTPException(status_code=400, detail="이메일 형식이 올바르지 않습니다.")
        dup = (
            db.query(CustomAuthUser)
            .filter(func.lower(CustomAuthUser.email) == email, CustomAuthUser.id != user.id)
            .first()
        )
        if dup:
            raise HTTPException(status_code=400, detail="이미 사용 중인 이메일입니다.")
        changes["email"] = email

    for field, value in changes.items():
        if field == "is_active":
            value = 1 if value else 0
        setattr(user, field, value)

    if changes.get("is_active") is False:
        staff_auth.revoke_user_sessions(db, user.id)
    staff_auth.audit(db, request, "staff_update", user_id=admin.id, target=f"staff:{user.id}",
                     detail=",".join(sorted(changes)))
    db.commit()
    return _serialize(user)


@router.post("/{staff_id}/totp-reset")
def reset_totp(
    staff_id: int,
    request: Request,
    admin: CustomAuthUser = Depends(require_staff_admin),
    db: Session = Depends(get_db),
):
    """인증앱 등록 초기화(휴대폰 분실 등). 2단계 인증 사용 여부는 그대로 — 다음 로그인 때 QR 재등록."""
    user = _get(db, staff_id)
    user.totp_secret = None
    user.totp_confirmed_at = None
    user.totp_last_step = None
    staff_auth.revoke_user_sessions(db, user.id)
    staff_auth.audit(db, request, "staff_totp_reset", user_id=admin.id, target=f"staff:{user.id}")
    db.commit()
    return _serialize(user)


class PasswordSet(BaseModel):
    password: str


@router.post("/{staff_id}/password")
def set_password(
    staff_id: int,
    body: PasswordSet,
    request: Request,
    admin: CustomAuthUser = Depends(require_staff_admin),
    db: Session = Depends(get_db),
):
    if not PASSWORD_RE.match(body.password):
        raise HTTPException(status_code=400, detail="비밀번호는 10자 이상이며 영문자·숫자·특수문자를 포함해야 합니다.")
    user = _get(db, staff_id)
    # Django 기본(870000회)과 같은 강도로 저장 — cms 로그인에서도 그대로 검증된다
    user.password = django_pbkdf2_sha256.using(rounds=870000).hash(body.password)
    staff_auth.revoke_user_sessions(db, user.id)
    staff_auth.audit(db, request, "staff_password_set", user_id=admin.id, target=f"staff:{user.id}")
    db.commit()
    return {"ok": True, "updated_at": datetime.now().isoformat()}
