"""레퍼런스 사이트·웹훅 설정 (Django 소유 테이블 — 구조 변경 금지, SPEC 03 §9, 08 §2.4)."""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text

from app.db.session import Base


class ReferenceSiteCategory(Base):
    __tablename__ = "ReferenceSiteCategory"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(50), nullable=False, unique=True)


class ReferenceSite(Base):
    __tablename__ = "ReferenceSite"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    site_name = Column(String(100), nullable=False)
    url = Column(String(500), nullable=False)
    thumbnail = Column(String(100), nullable=True)  # MEDIA_ROOT 상대경로 reference_sites/...
    description = Column(Text, nullable=False, default="")
    tech_stack = Column(String(255), nullable=False, default="")  # 쉼표 구분
    category_id = Column(Integer, ForeignKey("ReferenceSiteCategory.seq"), nullable=True)
    production_year = Column(Integer, nullable=True)
    display_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)

    def tech_stack_list(self) -> list[str]:
        return [t.strip() for t in (self.tech_stack or "").split(",") if t.strip()]


class WebhookConfig(Base):
    """cms → 외부(현재 hcms 푸시 1건) 웹훅. api_key 는 화면에 그대로 내보내지 않는다."""
    __tablename__ = "webhook_config"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    target_url = Column(String(500), nullable=False)
    api_key = Column(String(255), nullable=True)
    event_type = Column(String(30), nullable=False, default="all")
    is_active = Column(Boolean, nullable=False, default=True)
    timeout = Column(Integer, nullable=False, default=10)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)


class WebhookEventLog(Base):
    __tablename__ = "webhook_event_log"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    webhook_id = Column(Integer, ForeignKey("webhook_config.seq"), nullable=False)
    event_type = Column(String(30), nullable=False)
    payload = Column(Text, nullable=False)
    status = Column(String(10), nullable=False)
    status_code = Column(Integer, nullable=True)
    response_body = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False)
