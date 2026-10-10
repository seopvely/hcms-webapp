"""알림 outbox — 문자(iMessage) 전달 대상 이벤트를 notification_event 에 같은 트랜잭션으로 쓴다(SPEC 07 §5.3 R8)."""
import json
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.jobs import NotificationEvent


def emit(db: Session, event_type: str, message: str, ref_table: str | None = None, ref_id: int | None = None, **payload) -> None:
    db.add(NotificationEvent(event_type=event_type, ref_table=ref_table, ref_id=ref_id, message=(message or "")[:500],
                             payload=json.dumps(payload, ensure_ascii=False, default=str) if payload else None, created_at=datetime.now()))
