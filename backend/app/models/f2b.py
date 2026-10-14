# backend/app/models/f2b.py
"""web1 Fail2Ban 차단 원인 분석 (HCMS 소유 테이블, incident-hub spec 2026-10-15-f2b-ban-analysis §4).

f2b_ban 은 web1 수집기(collect_bans.py)가 /api/internal/f2b/bans 로 넣는다. 화면에서는 읽기만 한다.
"""
from datetime import datetime

from sqlalchemy import JSON, BigInteger, Column, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint

from app.db.session import Base


class F2bBan(Base):
    __tablename__ = "f2b_ban"
    __table_args__ = (
        UniqueConstraint("jail", "ip", "banned_at", name="uq_f2b_ban"),
        Index("ix_f2b_ban_banned_at", "banned_at"),
        Index("ix_f2b_ban_reason_time", "reason", "banned_at"),
        Index("ix_f2b_ban_jail_time", "jail", "banned_at"),
        Index("ix_f2b_ban_ip", "ip"),
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    banned_at = Column(DateTime, nullable=False)
    unbanned_at = Column(DateTime, nullable=True)
    jail = Column(String(40), nullable=False)
    ip = Column(String(45), nullable=False)
    reason = Column(String(40), nullable=False, default="unknown")
    reason_detail = Column(String(255), nullable=False, default="")
    site = Column(String(255), nullable=True)
    request_count = Column(Integer, nullable=False, default=0)
    status_summary = Column(JSON, nullable=True)
    user_agent = Column(String(500), nullable=True)
    country = Column(String(2), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.now)
    updated_at = Column(DateTime, nullable=False, default=datetime.now, onupdate=datetime.now)


class F2bBanEvidence(Base):
    __tablename__ = "f2b_ban_evidence"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    ban_id = Column(BigInteger, ForeignKey("f2b_ban.id", ondelete="CASCADE"), nullable=False, index=True)
    logged_at = Column(DateTime, nullable=False)
    source_file = Column(String(255), nullable=False, default="")
    line = Column(Text, nullable=False)


class F2bAiReview(Base):
    __tablename__ = "f2b_ai_review"
    __table_args__ = (Index("ix_f2b_ai_review_kind_period", "kind", "period_from"),)

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    kind = Column(String(10), nullable=False)  # daily / search
    period_from = Column(DateTime, nullable=False)
    period_to = Column(DateTime, nullable=False)
    filters_json = Column(Text, nullable=False, default="{}")
    filters_hash = Column(String(64), nullable=False, index=True)
    result_md = Column(Text, nullable=True)
    model = Column(String(20), nullable=False, default="sonnet")
    status = Column(String(10), nullable=False, default="ok")  # ok / error
    error = Column(Text, nullable=True)
    attempts = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=datetime.now)
    created_by = Column(Integer, nullable=True)
