from datetime import datetime

from sqlalchemy import Column, Integer, String, Date, DateTime, UniqueConstraint

from app.db.session import Base


class FreeMaintAlertLog(Base):
    """무상 유지보수 알림 발송 이력 (HCMS 소유 테이블) — 같은 알림 중복 발송 방지"""
    __tablename__ = "free_maint_alert_log"
    __table_args__ = (UniqueConstraint("project_id", "kind", "target_date", name="uq_free_maint_alert"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, nullable=False, index=True)
    kind = Column(String(20), nullable=False)  # started | d30 | d7 | ended
    target_date = Column(Date, nullable=False)  # 기준 무상 종료일 (연장으로 기간이 바뀌면 다시 발송)
    push_sent = Column(Integer, nullable=False, default=0)
    sent_at = Column(DateTime, default=datetime.now, nullable=False)
