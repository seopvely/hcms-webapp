from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, BigInteger

from app.db.session import Base


class CustomerInvite(Base):
    """고객 계정 초대(비밀번호 직접 설정) 토큰 (HCMS 소유 테이블). 토큰 원문은 저장하지 않는다."""
    __tablename__ = "customer_invite"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_hash = Column(String(64), nullable=False, unique=True)
    manager_seq = Column(Integer, nullable=False, index=True)
    created_by = Column(BigInteger, nullable=True)  # 직원 id
    created_at = Column(DateTime, nullable=False, default=datetime.now)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
