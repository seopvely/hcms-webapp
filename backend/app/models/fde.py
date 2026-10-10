"""FDE 요금제 카탈로그·계약 (HCMS 소유 테이블, SPEC 05 §7.4).

금액 필드 *_supply 는 공급가(VAT 별도). 청구(Payment)는 포함액으로 따로 만든다.
"""
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, Column, Date, DateTime, Integer, String, Text

from app.db.session import Base


class ServicePlan(Base):
    __tablename__ = "service_plan"

    plan_id = Column(String(40), primary_key=True)
    product = Column(String(20), nullable=False, default="fde")
    kind = Column(String(10), nullable=False)  # plan / addon
    name_ko = Column(String(100), nullable=False)
    name_en = Column(String(100), nullable=True)
    billing_kind = Column(String(30), nullable=False)  # split_50_50 / monthly_prepaid / monthly / per_week / one_time / linked_subscription
    unit = Column(String(10), nullable=False)  # once / week / month / half_day
    list_price_supply = Column(BigInteger, nullable=True)
    price_is_from = Column(Boolean, nullable=False, default=False)
    price_status = Column(String(10), nullable=False, default="draft")  # draft / confirmed
    price_confirmed_at = Column(DateTime, nullable=True)
    confirmed_by_id = Column(BigInteger, nullable=True)
    deposit_ratio = Column(Integer, nullable=True)
    min_months = Column(Integer, nullable=True)
    notice_days = Column(Integer, nullable=True)
    applies_to = Column(String(200), nullable=True)  # 쉼표 구분 plan_id
    is_public = Column(Boolean, nullable=False, default=False)
    sort_order = Column(Integer, nullable=False, default=0)
    contact_type = Column(String(20), nullable=True)
    linked_dev_plan = Column(String(20), nullable=True)
    description = Column(Text, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.now)


class FdeEngagement(Base):
    __tablename__ = "fde_engagement"

    id = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(Integer, nullable=False, index=True)
    plan_id = Column(String(40), nullable=False)
    status = Column(String(12), nullable=False, default="consulting")  # consulting/quoted/active/completed/terminated
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    min_end_date = Column(Date, nullable=True)
    notice_received_at = Column(Date, nullable=True)
    contract_price_supply = Column(BigInteger, nullable=True)
    monthly_price_supply = Column(BigInteger, nullable=True)
    headcount = Column(Integer, nullable=False, default=1)
    engineer_ids = Column(String(200), nullable=True)  # 쉼표 구분 pacms_customauthuser.id
    predecessor_id = Column(Integer, nullable=True)
    diagnosis_credit_supply = Column(BigInteger, nullable=True)
    travel_expense_policy = Column(String(200), nullable=True)
    nda_signed_at = Column(Date, nullable=True)
    ip_transfer_on_full_payment = Column(Boolean, nullable=False, default=True)
    billing_day = Column(Integer, nullable=True)  # 상주 월 청구일(미결 D14-3 — 기본 시작일과 같은 날)
    source_estimate_id = Column(Integer, nullable=True)
    source_lead_id = Column(Integer, nullable=True)
    project_id = Column(Integer, nullable=True)
    hcms_portal_opened_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)  # 직원 전용 — 고객 API 비노출
    created_by_id = Column(BigInteger, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.now)
    updated_at = Column(DateTime, nullable=False, default=datetime.now)


class FdeEngagementAddon(Base):
    __tablename__ = "fde_engagement_addon"

    id = Column(Integer, primary_key=True, autoincrement=True)
    engagement_id = Column(Integer, nullable=False, index=True)
    plan_id = Column(String(40), nullable=False)
    qty = Column(Integer, nullable=False, default=1)
    unit_price_supply = Column(BigInteger, nullable=False, default=0)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    dev_subscription_id = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.now)
