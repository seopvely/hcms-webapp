"""직원(에이전트) 인증 — 비밀번호 → (TOTP) → httpOnly 쿠키 세션.

TOTP 파라미터·컬럼은 cms(member/twofactor.py)와 같다: SHA1·6자리·30초·±1 step,
pacms_customauthuser.totp_secret / totp_confirmed_at / totp_last_step 공유.
그래서 cms 에서 등록한 인증앱이 그대로 동작하고, 한쪽에서 쓴 코드는 다른 쪽에서도 재사용되지 않는다.
"""
import hashlib
import hmac
import io
import secrets
import time
from datetime import datetime, timedelta

import pyotp
import qrcode
import qrcode.image.svg
from fastapi import Request
from passlib.hash import django_pbkdf2_sha256
from sqlalchemy import func, or_, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.customer import CustomAuthUser
from app.models.staff_auth import StaffAuditLog, StaffSession

TOTP_ISSUER = "cms.hankyeul.com"  # 기존 등록 앱과 같은 issuer 유지
TOTP_STEP_SECONDS = 30
TOTP_VALID_WINDOW = 1
MFA_MAX_ATTEMPTS = 5
LOGIN_FAIL_LIMIT = 5
LOGIN_FAIL_WINDOW = timedelta(minutes=15)

STAGE_PENDING = "pending"
STAGE_ACTIVE = "active"

# 존재하지 않는 계정에도 같은 시간만큼 해시 검증을 해 계정 존재 여부가 드러나지 않게 한다
_DUMMY_HASH = django_pbkdf2_sha256.using(rounds=870000).hash(secrets.token_hex(16))


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def client_ip(request: Request) -> str | None:
    return request.headers.get("x-real-ip") or (request.client.host if request.client else None)


def audit(db: Session, request: Request | None, action: str, user_id: int | None = None,
          target: str | None = None, detail: str | None = None) -> None:
    db.add(StaffAuditLog(
        user_id=user_id,
        action=action,
        target=target,
        detail=detail,
        ip=client_ip(request) if request else None,
        user_agent=(request.headers.get("user-agent") or "")[:255] if request else None,
        created_at=datetime.now(),
    ))


def is_login_locked(db: Session, email: str) -> bool:
    since = datetime.now() - LOGIN_FAIL_WINDOW
    fails = (
        db.query(func.count(StaffAuditLog.id))
        .filter(StaffAuditLog.action == "login_fail", StaffAuditLog.target == email, StaffAuditLog.created_at >= since)
        .scalar()
    )
    return fails >= LOGIN_FAIL_LIMIT


def authenticate_staff(db: Session, email: str, password: str) -> CustomAuthUser | None:
    """이메일(대소문자 무시)+비밀번호로 활성 직원 계정을 찾는다. 실패하면 None."""
    user = (
        db.query(CustomAuthUser)
        .filter(func.lower(CustomAuthUser.email) == email)
        .first()
    )
    if user is None or not user.password:
        django_pbkdf2_sha256.verify(password, _DUMMY_HASH)
        return None
    try:
        ok = django_pbkdf2_sha256.verify(password, user.password)
    except ValueError:
        ok = False
    if not ok:
        return None
    if not user.is_active or not (user.group == "agent" or user.is_superuser):
        return None
    return user


# ── 세션 ────────────────────────────────────────────────────────────────

def create_session(db: Session, request: Request, user_id: int, stage: str) -> tuple[str, str | None, StaffSession]:
    """세션 행을 만들고 (세션 토큰, CSRF 토큰, 행) 을 돌려준다. 토큰 원문은 저장하지 않는다."""
    token = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(32) if stage == STAGE_ACTIVE else None
    now = datetime.now()
    ttl = (timedelta(hours=settings.STAFF_SESSION_HOURS) if stage == STAGE_ACTIVE
           else timedelta(minutes=settings.STAFF_PENDING_MINUTES))
    row = StaffSession(
        token_hash=_hash(token),
        user_id=user_id,
        stage=stage,
        csrf_hash=_hash(csrf) if csrf else None,
        attempts=0,
        created_at=now,
        expires_at=now + ttl,
        last_seen_at=now,
        ip=client_ip(request),
        user_agent=(request.headers.get("user-agent") or "")[:255],
    )
    db.add(row)
    return token, csrf, row


def find_session(db: Session, token: str | None, stage: str) -> StaffSession | None:
    if not token:
        return None
    row = db.query(StaffSession).filter(StaffSession.token_hash == _hash(token)).first()
    if row is None or row.stage != stage or row.revoked_at is not None or row.expires_at <= datetime.now():
        return None
    return row


def csrf_matches(row: StaffSession, csrf: str | None) -> bool:
    return bool(csrf and row.csrf_hash and hmac.compare_digest(_hash(csrf), row.csrf_hash))


def revoke(row: StaffSession) -> None:
    row.revoked_at = datetime.now()


# ── TOTP ────────────────────────────────────────────────────────────────

def verify_totp(secret: str, code: str | None, last_step: int | None = None) -> int | None:
    """맞으면 통과한 time step 을, 아니면 None. last_step 이하(이미 쓴 코드)는 거부."""
    code = "".join(ch for ch in str(code or "") if ch.isdigit())
    if not secret or len(code) != 6:
        return None
    totp = pyotp.TOTP(secret)
    now = int(time.time())
    for offset in range(-TOTP_VALID_WINDOW, TOTP_VALID_WINDOW + 1):
        t = now + offset * TOTP_STEP_SECONDS
        if hmac.compare_digest(totp.at(t), code):
            step = t // TOTP_STEP_SECONDS
            if last_step is not None and step <= int(last_step):
                return None
            return step
    return None


def claim_totp_step(db: Session, user_id: int, step: int) -> bool:
    """totp_last_step 을 원자적으로 올린다. cms 와 동시에 같은 코드를 쓰면 한쪽만 성공한다."""
    result = db.execute(
        update(CustomAuthUser)
        .where(CustomAuthUser.id == user_id)
        .where(or_(CustomAuthUser.totp_last_step.is_(None), CustomAuthUser.totp_last_step < step))
        .values(totp_last_step=step)
    )
    return result.rowcount == 1


def new_totp_secret() -> str:
    return pyotp.random_base32()


def totp_qr_svg(secret: str, account_name: str) -> str:
    uri = pyotp.TOTP(secret).provisioning_uri(name=account_name, issuer_name=TOTP_ISSUER)
    img = qrcode.make(uri, image_factory=qrcode.image.svg.SvgPathImage, box_size=6, border=2)
    buf = io.BytesIO()
    img.save(buf)
    return buf.getvalue().decode()
