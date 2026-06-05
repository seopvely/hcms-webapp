from sqlalchemy import Column, Integer, String, Boolean, Date, DateTime, Text, ForeignKey
from app.db.session import Base


class AIDevSubscription(Base):
    __tablename__ = "pacms_aidevsubscription"

    seq = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("company.seq"), nullable=False)
    plan_type = Column(String(10), nullable=False)
    status = Column(String(10), nullable=False, default="active")
    build_fee = Column(Integer, nullable=False, default=0)
    monthly_price = Column(Integer, nullable=False, default=0)
    start_date = Column(Date, nullable=False)
    next_charge_date = Column(Date, nullable=False)
    is_beta = Column(Boolean, nullable=False, default=False)
    source_estimate_id = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)
