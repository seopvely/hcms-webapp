from datetime import datetime

from sqlalchemy import BigInteger, Column, DateTime, Index, Integer, String, Text

from app.db.session import Base


class StaffSession(Base):
    """직원 로그인 세션 (HCMS 소유 테이블).

    쿠키에는 무작위 토큰만 두고 DB 에는 sha256 해시만 저장한다.
    stage: pending(비밀번호 통과, TOTP 대기) | active(로그인 완료)
    """
    __tablename__ = "staff_session"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_hash = Column(String(64), nullable=False, unique=True)
    user_id = Column(BigInteger, nullable=False, index=True)  # pacms_customauthuser.id
    stage = Column(String(10), nullable=False)
    csrf_hash = Column(String(64), nullable=True)
    pending_totp_secret = Column(String(64), nullable=True)  # 인증앱 등록 중인 비밀키(확인 전까지만)
    attempts = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=datetime.now)
    expires_at = Column(DateTime, nullable=False)
    last_seen_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    ip = Column(String(64), nullable=True)
    user_agent = Column(String(255), nullable=True)


class StaffAuditLog(Base):
    """직원 인증·관리 행위 감사 로그 (HCMS 소유 테이블). 로그인 실패 잠금 판정에도 쓴다."""
    __tablename__ = "staff_audit_log"
    __table_args__ = (Index("ix_staff_audit_action_target_created", "action", "target", "created_at"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, nullable=True, index=True)
    action = Column(String(50), nullable=False)
    target = Column(String(254), nullable=True)
    detail = Column(Text, nullable=True)
    ip = Column(String(64), nullable=True)
    user_agent = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.now)
