"""알림 outbox — 문자(iMessage) 전달 대상 이벤트를 notification_event 에 같은 트랜잭션으로 쓴다(SPEC 07 §5.3 R8).

같은 이벤트를 활성 직원 전원의 데스크탑 알림함(services/inbox)에도 남긴다.
"""
import json
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.jobs import NotificationEvent
from app.services import inbox

# 데스크탑 알림을 누르면 열 직원 화면 — route 를 넘기지 않으면 ref_table·ref_id 로 정한다
_REF_ROUTES = {"Estimate": "/managed/estimates/{}", "estimate_contract": "/managed/contracts/{}"}


def emit(db: Session, event_type: str, message: str, ref_table: str | None = None, ref_id: int | None = None,
         route: str | None = None, **payload) -> None:
    db.add(NotificationEvent(event_type=event_type, ref_table=ref_table, ref_id=ref_id, message=(message or "")[:500],
                             payload=json.dumps(payload, ensure_ascii=False, default=str) if payload else None, created_at=datetime.now()))
    if route is None and ref_table in _REF_ROUTES and ref_id:
        route = _REF_ROUTES[ref_table].format(ref_id)
    inbox.add_for_staff(db, event_type, message, route, route)
