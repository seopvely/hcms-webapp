"""서버간 내부 API (/api/internal) — 맥미니 iMessage 전달기가 SSH+pacms ORM 대신 이 API 로 outbox 를 읽는다(SPEC 07 §5.5).

인증: X-Internal-Key == INTERNAL_API_KEY(.env). 키가 비어 있으면 503(비활성).
커서는 notification_event.id(삽입 순) — seq 순서 ≠ 발송 순서 문제(§5.2-1)가 없다.
"""
import hmac
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.jobs import NotificationEvent

router = APIRouter(prefix="/internal", tags=["internal"])


def _auth(x_internal_key: str | None = Header(None)) -> None:
    if not settings.INTERNAL_API_KEY:
        raise HTTPException(503, "internal API disabled")
    if not x_internal_key or not hmac.compare_digest(x_internal_key, settings.INTERNAL_API_KEY):
        raise HTTPException(401, "invalid key")


@router.get("/notification-events", dependencies=[Depends(_auth)])
def events(after: int = 0, limit: int = Query(20, le=100), db: Session = Depends(get_db)):
    rows = db.query(NotificationEvent).filter(NotificationEvent.id > after).order_by(NotificationEvent.id).limit(limit).all()
    return [{"id": r.id, "event_type": r.event_type, "message": r.message, "ref_table": r.ref_table, "ref_id": r.ref_id,
             "created_at": r.created_at.isoformat(), "delivered_imessage_at": r.delivered_imessage_at.isoformat() if r.delivered_imessage_at else None} for r in rows]


class Ack(BaseModel):
    ids: list[int]


@router.post("/notification-events/ack", dependencies=[Depends(_auth)])
def ack(body: Ack, db: Session = Depends(get_db)):
    n = db.query(NotificationEvent).filter(NotificationEvent.id.in_(body.ids or [0]), NotificationEvent.delivered_imessage_at.is_(None)).update(
        {NotificationEvent.delivered_imessage_at: datetime.now()}, synchronize_session=False)
    db.commit()
    return {"acked": n}
