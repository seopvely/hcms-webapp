from datetime import datetime, timedelta

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# 고객 JWT 의 typ 클레임. 직원은 JWT 가 아니라 httpOnly 쿠키 세션(staff_session)을 쓴다.
CUSTOMER_TOKEN_TYPE = "customer"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "typ": CUSTOMER_TOKEN_TYPE, "token_use": "access"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "typ": CUSTOMER_TOKEN_TYPE, "token_use": "refresh"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_customer_token(token: str, token_use: str) -> dict | None:
    """고객 토큰을 검증해 payload 를 돌려준다. 형식(typ·token_use·sub)이 맞지 않으면 None."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except Exception:
        return None
    if payload.get("typ") != CUSTOMER_TOKEN_TYPE or payload.get("token_use") != token_use:
        return None
    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub.isdigit():
        return None
    return payload


DOCUMENT_TOKEN_HOURS = 24


def create_document_token(manager_seq: int, estimate_id: int) -> str:
    """메일 링크용 문서 토큰 — 견적 1건(과 그 계약서)만 보고 응답할 수 있다. refresh 없음."""
    expire = datetime.utcnow() + timedelta(hours=DOCUMENT_TOKEN_HOURS)
    to_encode = {"sub": str(manager_seq), "doc_estimate": estimate_id, "exp": expire,
                 "typ": CUSTOMER_TOKEN_TYPE, "token_use": "doc"}
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
