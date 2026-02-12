from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.db.session import Base


class Manager(Base):
    __tablename__ = "manager"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    password = Column(String(100), nullable=True)
    login_id = Column(String(100), nullable=True)
    login_permit_tf = Column(String(1), nullable=True)
    login_attempt_count = Column(Integer, nullable=True, default=0)
    is_first_login = Column(Boolean, default=True)
    name = Column(String(100), nullable=True)
    phone_number = Column(String(14), nullable=True)
    email = Column(String(254), nullable=True)
    mobile_number = Column(String(14), nullable=True)
    join_date = Column(DateTime, nullable=True)
    leave_date = Column(DateTime, nullable=True)
    last_login = Column(DateTime, nullable=True)
    remarks = Column(Text, nullable=True)
    position = Column(String(100), nullable=True)
    department = Column(String(100), nullable=True)
    previlege = Column(String(1), nullable=True)
    protrait = Column(String(100), nullable=True)
    company_id = Column(Integer, ForeignKey("company.seq"), nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)
    customer_key = Column(String(100), nullable=True)

    company = relationship("Company")
