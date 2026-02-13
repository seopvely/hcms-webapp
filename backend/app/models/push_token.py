from datetime import datetime

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.db.session import Base


class PushToken(Base):
    __tablename__ = "push_token"

    id = Column(Integer, primary_key=True, autoincrement=True)
    manager_seq = Column(Integer, ForeignKey("manager.seq"), nullable=False, index=True)
    token = Column(String(512), nullable=False, unique=True)
    platform = Column(String(10), nullable=False)  # "ios" | "android"
    device_id = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.now, nullable=False)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now, nullable=False)

    manager = relationship("Manager", backref="push_tokens")
