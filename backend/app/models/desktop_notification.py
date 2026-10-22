"""데스크탑 알림함 (HCMS 소유 테이블). 모바일 푸시·직원 알림 이벤트를 받는 사람별로 한 줄씩 남긴다.

데스크탑 앱(macOS)이 GET /api/notifications/desktop 으로 id 커서를 따라 끌어간다. 받는 사람은
고객 담당자(manager.seq) 또는 직원(pacms_customauthuser.id) — pacmsDB FK 는 RESTRICT 라 FK 를 걸지 않는다.
"""
from datetime import datetime

from sqlalchemy import BigInteger, Column, DateTime, Index, Integer, String

from app.db.session import Base


class DesktopNotification(Base):
    __tablename__ = "desktop_notification"
    __table_args__ = (Index("ix_desktop_notification_recipient", "recipient_type", "recipient_id", "id"),)

    id = Column(BigInteger, primary_key=True, autoincrement=True)  # = 커서
    recipient_type = Column(String(10), nullable=False)  # customer / staff
    recipient_id = Column(Integer, nullable=False)
    title = Column(String(100), nullable=False)
    body = Column(String(500), nullable=True)
    route = Column(String(500), nullable=True)
    category = Column(String(50), nullable=True)
    group_key = Column(String(100), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.now, index=True)
    read_at = Column(DateTime, nullable=True)
