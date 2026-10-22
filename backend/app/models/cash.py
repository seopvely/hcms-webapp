"""자금 기준잔액 (HCMS 소유 테이블). 월별 손익·자금흐름 화면의 추정 잔액 출발점.

as_of_date 당일 영업 시작 시점의 실제 잔액이다. 연초 기초잔액은 1월 1일 행 하나이고,
중간에 실제 통장 잔액을 넣으면 그 날짜부터 추정 잔액이 다시 맞춰진다.
"""
from datetime import datetime

from sqlalchemy import BigInteger, Column, Date, DateTime, Integer, String

from app.db.session import Base


class CashBalanceSnapshot(Base):
    __tablename__ = "cash_balance_snapshot"

    id = Column(Integer, primary_key=True, autoincrement=True)
    as_of_date = Column(Date, nullable=False, unique=True)
    amount = Column(BigInteger, nullable=False)
    memo = Column(String(200), nullable=True)
    created_by_id = Column(Integer, nullable=True)
    updated_by_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.now)
    updated_at = Column(DateTime, nullable=False, default=datetime.now, onupdate=datetime.now)
