"""고객 계정 초대 — 평문 비밀번호 메일 대신 1회용 링크로 고객이 비밀번호를 직접 설정한다(SPEC D6·D7)."""
import hashlib
import secrets
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models.customer_invite import CustomerInvite

INVITE_TTL = timedelta(hours=72)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def issue(db: Session, manager_seq: int, staff_id: int | None) -> str:
    """새 초대 토큰을 발급하고 같은 계정의 이전 미사용 초대는 무효화한다."""
    now = datetime.now()
    db.query(CustomerInvite).filter(CustomerInvite.manager_seq == manager_seq, CustomerInvite.used_at.is_(None)).update(
        {CustomerInvite.used_at: now}, synchronize_session=False)
    token = secrets.token_urlsafe(32)
    db.add(CustomerInvite(token_hash=_hash(token), manager_seq=manager_seq, created_by=staff_id,
                          created_at=now, expires_at=now + INVITE_TTL))
    return token


def find_valid(db: Session, token: str | None, lock: bool = False) -> CustomerInvite | None:
    if not token:
        return None
    query = db.query(CustomerInvite).filter(CustomerInvite.token_hash == _hash(token))
    if lock:
        query = query.with_for_update()
    row = query.first()
    if row is None or row.used_at is not None or row.expires_at <= datetime.now():
        return None
    return row
