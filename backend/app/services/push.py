import logging

from datetime import datetime

from sqlalchemy.orm import Session

from app.models.push_token import PushToken
from app.core.firebase import send_push

logger = logging.getLogger(__name__)


def register_token(db: Session, manager_seq: int, token: str, platform: str, device_id: str | None = None) -> PushToken:
    """토큰 등록 (upsert). 이미 존재하면 갱신."""
    existing = db.query(PushToken).filter(PushToken.token == token).first()

    if existing:
        existing.manager_seq = manager_seq
        existing.platform = platform
        existing.device_id = device_id
        existing.is_active = True
        existing.updated_at = datetime.now()
        db.commit()
        db.refresh(existing)
        return existing

    new_token = PushToken(
        manager_seq=manager_seq,
        token=token,
        platform=platform,
        device_id=device_id,
        is_active=True,
    )
    db.add(new_token)
    db.commit()
    db.refresh(new_token)
    return new_token


def unregister_token(db: Session, token: str) -> bool:
    """토큰 비활성화."""
    existing = db.query(PushToken).filter(PushToken.token == token).first()
    if not existing:
        return False

    existing.is_active = False
    existing.updated_at = datetime.now()
    db.commit()
    return True


def get_active_tokens(db: Session, manager_seq: int) -> list[PushToken]:
    """유저별 활성 토큰 조회."""
    return (
        db.query(PushToken)
        .filter(PushToken.manager_seq == manager_seq, PushToken.is_active == True)
        .all()
    )


def send_push_notification(title: str, body: str, tokens: list[str], data: dict | None = None) -> int:
    """Firebase를 통해 푸시 발송."""
    return send_push(tokens, title, body, data)


def send_push_to_user(db: Session, manager_seq: int, title: str, body: str, data: dict | None = None) -> int:
    """특정 유저에게 푸시 발송."""
    push_tokens = get_active_tokens(db, manager_seq)
    if not push_tokens:
        return 0

    token_strings = [pt.token for pt in push_tokens]
    return send_push_notification(title, body, token_strings, data)


def send_push_to_all(db: Session, title: str, body: str, data: dict | None = None) -> int:
    """전체 활성 토큰에 푸시 발송."""
    all_tokens = db.query(PushToken).filter(PushToken.is_active == True).all()
    if not all_tokens:
        return 0

    token_strings = [pt.token for pt in all_tokens]
    return send_push_notification(title, body, token_strings, data)
