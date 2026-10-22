"""데스크탑 알림함 저장 — 모바일 푸시를 보내는 곳과 직원 알림 이벤트(notify.emit)에서 같은 내용을 받는 사람별로 남긴다.

기기 토큰이 없어도 저장한다(웹·데스크탑에서는 토큰 등록이 없다). 조회는 api/endpoints/notifications.py.
"""
import logging
import re
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models.customer import CustomAuthUser
from app.models.desktop_notification import DesktopNotification
from app.models.manager import Manager

logger = logging.getLogger(__name__)

CUSTOMER, STAFF = "customer", "staff"
RETENTION_DAYS = 30

# 직원 알림 이벤트(notify.emit) → 데스크탑 알림 제목
STAFF_EVENT_TITLES = {
    "alarm.sent": "알람",
    "meeting.alarm": "미팅약속 알람",
    "estimate.approved": "견적 승인",
    "estimate.rejected": "견적 거절",
    "estimate.revision_requested": "견적 수정요청",
    "contract.signed_by_customer": "계약 서명",
}


def company_manager_seqs(db: Session, company_id: int | None) -> list[int]:
    """회사의 로그인 허용 고객 담당자(푸시 대상과 같은 규칙)."""
    if not company_id:
        return []
    return [m.seq for m in db.query(Manager.seq).filter(Manager.company_id == company_id, Manager.login_permit_tf == "1")]


def _rows(recipient_type: str, ids, title: str, body: str | None, route: str | None, category: str | None, group_key: str | None):
    now = datetime.now()
    for rid in dict.fromkeys(ids):
        yield DesktopNotification(recipient_type=recipient_type, recipient_id=rid, title=(title or "알림")[:100],
                                  body=(body or "")[:500] or None, route=route or None, category=category,
                                  group_key=(group_key or "")[:100] or None, created_at=now)


def add_for_customers(db: Session, manager_seqs, title: str, body: str | None, data: dict | None = None) -> None:
    """푸시 data(type·target_id·route)를 그대로 받아 고객 담당자별로 쌓는다. 커밋은 호출한 쪽."""
    data = data or {}
    category, target = data.get("type") or None, data.get("target_id") or ""
    db.add_all(_rows(CUSTOMER, manager_seqs, title, body, data.get("route"), category,
                     f"{category}:{target}" if category and target else None))


def save_for_customers(db: Session, manager_seqs, title: str, body: str | None, data: dict | None = None) -> None:
    """add_for_customers + 커밋. 실패해도 푸시는 보내도록 삼킨다(푸시 전용 세션에서 부른다)."""
    if not manager_seqs:
        return
    try:
        add_for_customers(db, manager_seqs, title, body, data)
        db.commit()
    except Exception as e:  # noqa: BLE001
        db.rollback()
        logger.error(f"desktop inbox save failed ({title}): {e}")


def add_for_staff(db: Session, event_type: str, message: str, route: str | None, group_key: str | None) -> None:
    """직원 알림 이벤트를 활성 직원 전원에게 쌓는다(호출한 쪽 트랜잭션에 함께 커밋)."""
    title = STAFF_EVENT_TITLES.get(event_type, "알림")
    if (message or "").startswith("[미팅약속-expired]"):
        title += "(24시간 지난 알람)"
    body = re.sub(r"^\[[^\]]*\]\s*", "", message or "")  # '[견적 승인] …' 머리말은 제목과 겹친다
    staff_ids = [u.id for u in db.query(CustomAuthUser.id).filter(CustomAuthUser.is_active == True)]  # noqa: E712
    db.add_all(_rows(STAFF, staff_ids, title, body, route, event_type, group_key))


def purge_old(db: Session, now: datetime) -> int:
    """보관 기간이 지난 알림 삭제(커밋은 호출한 쪽)."""
    return db.query(DesktopNotification).filter(
        DesktopNotification.created_at < now - timedelta(days=RETENTION_DAYS)).delete(synchronize_session=False)
