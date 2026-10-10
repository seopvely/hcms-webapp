from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_customer_token
from app.db.session import get_db
from app.models.customer import CustomAuthUser
from app.models.manager import Manager
from app.services import staff_auth

security = HTTPBearer()

STAFF_SESSION_COOKIE = "hcms_staff_session"
STAFF_PENDING_COOKIE = "hcms_staff_pending"
STAFF_CSRF_COOKIE = "hcms_staff_csrf"
CSRF_HEADER = "x-csrf-token"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> Manager:
    """고객 access 토큰만 받는다(refresh 토큰·형식이 다른 토큰은 거부)."""
    payload = decode_customer_token(credentials.credentials, "access")
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    user = db.query(Manager).filter(Manager.seq == int(payload["sub"])).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user


def get_current_staff(request: Request, db: Session = Depends(get_db)) -> CustomAuthUser:
    """직원 세션 쿠키를 확인한다. 상태를 바꾸는 요청은 CSRF 헤더와 Origin 도 확인한다."""
    row = staff_auth.find_session(db, request.cookies.get(STAFF_SESSION_COOKIE), staff_auth.STAGE_ACTIVE)
    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="직원 로그인이 필요합니다.")

    if request.method not in SAFE_METHODS:
        origin = request.headers.get("origin")
        if origin and origin not in settings.cors_origins:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="허용되지 않은 출처입니다.")
        if not staff_auth.csrf_matches(row, request.headers.get(CSRF_HEADER)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF 검증에 실패했습니다.")

    user = db.query(CustomAuthUser).filter(CustomAuthUser.id == row.user_id).first()
    if user is None or not user.is_active:
        staff_auth.revoke(row)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="비활성화된 계정입니다.")

    now = datetime.now()
    if row.last_seen_at is None or now - row.last_seen_at > timedelta(minutes=5):
        row.last_seen_at = now
        db.commit()
    return user
