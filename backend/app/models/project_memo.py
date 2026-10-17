"""프로젝트 메모 (HCMS 소유 테이블). 직원이 프로젝트에 수동으로 연결해 두는 메모·자격증명·첨부.

pacms project 와는 DB FK 를 두지 않는다(cms 에서 프로젝트 삭제를 막지 않도록) — project_id 는 값만 저장한다.
"""
from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint

from app.db.session import Base


class ProjectMemo(Base):
    __tablename__ = "project_memo"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    memo_type = Column(String(20), nullable=False, index=True)
    title = Column(String(200), nullable=False)  # AI(haiku)가 본문에서 뽑는다 — 직원이 직접 쓰지 않음
    title_status = Column(String(10), nullable=False, default="pending", server_default="ai")  # pending / ai / auto(규칙)
    content = Column(Text, nullable=True)
    memo_date = Column(Date, nullable=True)  # 날짜·결제일 유형, 해야할일의 마감일
    done_at = Column(DateTime, nullable=True)  # 해야할일 완료 체크(None = 미완료)
    done_by_id = Column(Integer, nullable=True)
    created_by_id = Column(Integer, nullable=True)
    updated_by_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.now)
    updated_at = Column(DateTime, nullable=False, default=datetime.now, onupdate=datetime.now)


class ProjectMemoProject(Base):
    __tablename__ = "project_memo_project"
    __table_args__ = (UniqueConstraint("memo_id", "project_id", name="uq_project_memo_project"),)

    seq = Column(Integer, primary_key=True, autoincrement=True)
    memo_id = Column(Integer, ForeignKey("project_memo.seq", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(Integer, nullable=False, index=True)


class ProjectMemoAttachment(Base):
    __tablename__ = "project_memo_attachment"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    memo_id = Column(Integer, ForeignKey("project_memo.seq", ondelete="CASCADE"), nullable=False, index=True)
    file_path = Column(String(500), nullable=False)
    filename = Column(String(255), nullable=False)
    # 이미지 첨부 AI 분석(haiku): 글자가 주된 이미지면 extracted_text 에 글자 그대로, extract_summary 에 한두 문장 설명.
    # extract_status: None(이미지 아님) / pending / done / edited(직원이 고침 — AI 다시 분석이 덮지 않음) / failed / skipped(credential)
    extracted_text = Column(Text, nullable=True)
    extract_summary = Column(String(500), nullable=True)
    extract_status = Column(String(10), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.now)
