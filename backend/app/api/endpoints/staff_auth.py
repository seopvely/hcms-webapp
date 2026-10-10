"""직원 로그인 2단계·로그아웃. 1단계(비밀번호)는 통합 로그인 POST /api/auth/login 에서 들어온다."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import (
    STAFF_CSRF_COOKIE,
    STAFF_PENDING_COOKIE,
    STAFF_SESSION_COOKIE,
)
from app.db.session import get_db
from app.models.customer import CustomAuthUser
from app.services import staff_auth

router = APIRouter(prefix="/auth/staff", tags=["staff-auth"])

PENDING_COOKIE_PATH = "/api/auth/staff"


def _set_cookie(response: Response, key: str, value: str, max_age: int, path: str, httponly: bool = True) -> None:
    response.set_cookie(
        key, value, max_age=max_age, path=path, httponly=httponly,
        secure=settings.STAFF_COOKIE_SECURE, samesite="lax",
    )


def _clear_cookie(response: Response, key: str, path: str, httponly: bool = True) -> None:
    response.delete_cookie(key, path=path, httponly=httponly, secure=settings.STAFF_COOKIE_SECURE, samesite="lax")


def _start_active_session(db: Session, request: Request, response: Response, user: CustomAuthUser) -> None:
    token, csrf, _ = staff_auth.create_session(db, request, user.id, staff_auth.STAGE_ACTIVE)
    user.last_login = datetime.now()
    staff_auth.audit(db, request, "login_success", user_id=user.id, target=(user.email or "").lower())
    db.commit()
    max_age = settings.STAFF_SESSION_HOURS * 3600
    _set_cookie(response, STAFF_SESSION_COOKIE, token, max_age, "/api")
    # CSRF 토큰은 화면 JS 가 읽어 X-CSRF-Token 헤더로 보낸다(double submit)
    _set_cookie(response, STAFF_CSRF_COOKIE, csrf, max_age, "/", httponly=False)


def login_staff(db: Session, request: Request, response: Response, login_id: str, password: str) -> dict:
    email = login_id.strip().lower()
    if staff_auth.is_login_locked(db, email):
        raise HTTPException(status_code=429, detail="로그인 실패가 많아 잠시 잠겼습니다. 15분 후 다시 시도해주세요.")

    user = staff_auth.authenticate_staff(db, email, password)
    if user is None:
        staff_auth.audit(db, request, "login_fail", target=email)
        db.commit()
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 일치하지 않습니다.")

    if user.two_factor_enabled:
        token, _, _ = staff_auth.create_session(db, request, user.id, staff_auth.STAGE_PENDING)
        staff_auth.audit(db, request, "login_password_ok", user_id=user.id, target=email)
        db.commit()
        _set_cookie(response, STAFF_PENDING_COOKIE, token, settings.STAFF_PENDING_MINUTES * 60, PENDING_COOKIE_PATH)
        return {
            "kind": "staff",
            "mfa_required": True,
            "mfa_setup_required": not (user.totp_secret and user.totp_confirmed_at),
        }

    _start_active_session(db, request, response, user)
    return {"kind": "staff", "mfa_required": False}


def _pending(db: Session, request: Request) -> tuple:
    row = staff_auth.find_session(db, request.cookies.get(STAFF_PENDING_COOKIE), staff_auth.STAGE_PENDING)
    user = db.query(CustomAuthUser).filter(CustomAuthUser.id == row.user_id).first() if row else None
    if row is None or user is None or not user.is_active or not user.two_factor_enabled:
        raise HTTPException(status_code=401, detail="2단계 인증 시간이 지났습니다. 다시 로그인해주세요.")
    return row, user


@router.get("/mfa")
def mfa_status(request: Request, db: Session = Depends(get_db)):
    """2단계 화면 정보. 인증앱 미등록이면 등록용 QR 을 함께 준다."""
    row, user = _pending(db, request)
    if user.totp_secret and user.totp_confirmed_at:
        return {"setup_required": False, "username": user.username}
    if not row.pending_totp_secret:
        row.pending_totp_secret = staff_auth.new_totp_secret()
        db.commit()
    return {
        "setup_required": True,
        "username": user.username,
        "qr_svg": staff_auth.totp_qr_svg(row.pending_totp_secret, user.username),
        "secret": row.pending_totp_secret,
    }


class MfaVerifyRequest(BaseModel):
    code: str


@router.post("/mfa/verify")
def mfa_verify(body: MfaVerifyRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    row, user = _pending(db, request)
    setup = not (user.totp_secret and user.totp_confirmed_at)
    secret = row.pending_totp_secret if setup else user.totp_secret
    step = staff_auth.verify_totp(secret, body.code, None if setup else user.totp_last_step)
    if step is not None and not setup and not staff_auth.claim_totp_step(db, user.id, step):
        step = None  # 같은 코드가 방금 다른 곳(cms 포함)에서 쓰였다

    if step is None:
        row.attempts = (row.attempts or 0) + 1
        staff_auth.audit(db, request, "mfa_fail", user_id=user.id, target=(user.email or "").lower())
        if row.attempts >= staff_auth.MFA_MAX_ATTEMPTS:
            staff_auth.revoke(row)
            db.commit()
            _clear_cookie(response, STAFF_PENDING_COOKIE, PENDING_COOKIE_PATH)
            raise HTTPException(status_code=401, detail="시도 횟수를 초과했습니다. 다시 로그인해주세요.")
        db.commit()
        remain = staff_auth.MFA_MAX_ATTEMPTS - row.attempts
        raise HTTPException(status_code=400, detail=f"인증 코드가 올바르지 않습니다. (남은 시도 {remain}회)")

    if setup:
        user.totp_secret = secret
        user.totp_confirmed_at = datetime.now()
        user.totp_last_step = step
        staff_auth.audit(db, request, "mfa_setup", user_id=user.id, target=(user.email or "").lower())
    staff_auth.revoke(row)
    _clear_cookie(response, STAFF_PENDING_COOKIE, PENDING_COOKIE_PATH)
    _start_active_session(db, request, response, user)
    return {"ok": True}


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    row = staff_auth.find_session(db, request.cookies.get(STAFF_SESSION_COOKIE), staff_auth.STAGE_ACTIVE)
    if row is not None:
        staff_auth.revoke(row)
        staff_auth.audit(db, request, "logout", user_id=row.user_id)
        db.commit()
    _clear_cookie(response, STAFF_SESSION_COOKIE, "/api")
    _clear_cookie(response, STAFF_CSRF_COOKIE, "/", httponly=False)
    return {"ok": True}
