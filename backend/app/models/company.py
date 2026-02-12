from sqlalchemy import Column, Integer, String, DateTime
from app.db.session import Base


class Company(Base):
    __tablename__ = "company"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=True)
    site_key = Column(String(64), unique=True, nullable=True)
    ceoname = Column(String(100), nullable=True)
    business_number = Column(String(100), nullable=True)
    business_file = Column(String(100), nullable=True)
    business_file_name = Column(String(100), nullable=True)
    phone_number = Column(String(13), nullable=True)
    ceo_phone_number = Column(String(13), nullable=True)
    fax_number = Column(String(13), nullable=True)
    ceo_email = Column(String(254), nullable=False)
    montly_point = Column(Integer, nullable=True)
    autopayment_id = Column(String(100), nullable=True)
    address = Column(String(100), nullable=True)
    address_de = Column(String(100), nullable=True)
    post_number = Column(String(10), nullable=True)
    criteria = Column(String(100), nullable=True)
    tax_email = Column(String(254), nullable=True)
    bank_name = Column(String(50), nullable=True)
    bank_account = Column(String(100), nullable=True)
    account_holder = Column(String(100), nullable=True)
    bank_file = Column(String(100), nullable=True)
    bank_file_name = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)
