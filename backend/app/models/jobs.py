"""스케줄러 실행 기록·발송 선점·알림 outbox (HCMS 소유 테이블, SPEC 07 §6.3·§8)."""
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, Column, DateTime, Integer, String, Text, UniqueConstraint

from app.db.session import Base


class JobRun(Base):
    __tablename__ = "job_run"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    job = Column(String(50), nullable=False, index=True)
    started_at = Column(DateTime, nullable=False, default=datetime.now)
    finished_at = Column(DateTime, nullable=True)
    status = Column(String(10), nullable=False, default="running")  # running / ok / failed / skipped
    dry_run = Column(Boolean, nullable=False, default=False)
    summary = Column(Text, nullable=True)
    error = Column(Text, nullable=True)


class JobClaim(Base):
    """발송 선점 — (job, claim_key) 를 먼저 INSERT 한 실행만 보낸다(중복 cron·재시도 방지)."""
    __tablename__ = "job_claim"
    __table_args__ = (UniqueConstraint("job", "claim_key", name="uq_job_claim"),)

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    job = Column(String(50), nullable=False)
    claim_key = Column(String(191), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.now)
    result = Column(String(20), nullable=True)


class NotificationEvent(Base):
    """알림 outbox — 메일·푸시·iMessage 대상 이벤트(맥미니 전달기는 이 표만 읽도록 교체, SPEC 07 §5.3 R8)."""
    __tablename__ = "notification_event"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    event_type = Column(String(50), nullable=False, index=True)
    ref_table = Column(String(50), nullable=True)
    ref_id = Column(Integer, nullable=True)
    payload = Column(Text, nullable=True)  # JSON
    message = Column(String(500), nullable=True)  # 문자로 보낼 한 줄 요약
    created_at = Column(DateTime, nullable=False, default=datetime.now)
    delivered_imessage_at = Column(DateTime, nullable=True)
