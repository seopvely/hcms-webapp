from sqlalchemy import (
    Column,
    Integer,
    BigInteger,
    String,
    Boolean,
    DateTime,
    Date,
    ForeignKey,
    Text,
    Table,
    Float,
    func,
)
from sqlalchemy.orm import relationship
from app.db.session import Base
from datetime import datetime


# Read-only mapping of Django's customauthuser table
class CustomAuthUser(Base):
    """직원(에이전트) 계정 — Django(pacms) 소유 테이블. 구조 변경은 Django 마이그레이션으로만."""
    __tablename__ = "pacms_customauthuser"

    id = Column(Integer, primary_key=True)
    username = Column(String(150), nullable=True)
    name = Column(String(100), nullable=True)
    email = Column(String(254), nullable=True)
    group = Column(String(100), nullable=True)
    type = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True)
    password = Column(String(128), nullable=False)
    is_superuser = Column(Integer, nullable=False, default=0)
    previlege = Column(String(1), nullable=True)
    phone_number = Column(String(13), nullable=True)
    department = Column(String(100), nullable=True)
    position = Column(String(100), nullable=True)
    last_login = Column(DateTime, nullable=True)
    # TOTP 2단계 인증 — cms(member/twofactor.py)와 같은 컬럼·알고리즘을 공유한다
    two_factor_enabled = Column(Boolean, nullable=False, default=False)
    totp_secret = Column(String(64), nullable=True)
    totp_confirmed_at = Column(DateTime, nullable=True)
    totp_last_step = Column(BigInteger, nullable=True)


# M2M junction table for News <-> Company
news_companies = Table(
    "News_companies",
    Base.metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("news_id", Integer, ForeignKey("News.seq"), nullable=False),
    Column("company_id", Integer, ForeignKey("company.seq"), nullable=False),
)


class Project(Base):
    __tablename__ = "project"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(Integer, ForeignKey("company.seq"), nullable=True)
    title = Column(String(200), nullable=True)
    category = Column(String(100), nullable=True)
    contract_deposit = Column(Integer, nullable=True)
    contract_date = Column(Date, nullable=True)
    contract_termination_date = Column(Date, nullable=True)
    contract_period_range = Column(String(200), nullable=True)
    project_type = Column(String(50), nullable=True)
    project_status = Column(String(50), nullable=True)
    sales_lead_id = Column(Integer, nullable=True)
    point = Column(Integer, nullable=True, default=0)
    maintenance_request_enabled = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)
    extension_count = Column(Integer, nullable=True, default=0)
    # 무상 유지보수 (PACMS 관리: 계약만료일 다음날부터 N개월, 기간 중 포인트 차감 없음)
    free_maint_months = Column(Integer, nullable=True)
    free_maint_scope = Column(Text, nullable=True)
    free_maint_start_date = Column(Date, nullable=True)
    free_maint_end_date = Column(Date, nullable=True)
    contract_remarks = Column(Text, nullable=True)
    requirements = Column(Text, nullable=True)
    manager_select_contract_seq_id = Column(BigInteger, nullable=True)
    is_opened = Column(Boolean, nullable=False, default=False)

    company = relationship("Company", backref="projects")


class Managelist(Base):
    __tablename__ = "Managelist"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(Integer, ForeignKey("company.seq"), nullable=True)
    project_id = Column(Integer, ForeignKey("project.seq"), nullable=True)
    title = Column(String(200), nullable=True)
    contents = Column(Text, nullable=True)
    writer_id = Column(Integer, ForeignKey("manager.seq"), nullable=True)
    request_date = Column(DateTime, nullable=True)
    completion_date = Column(DateTime, nullable=True)
    complete_date = Column(DateTime, nullable=True)
    status = Column(Integer, nullable=True, default=1)  # 1=접수,2=알림,3=처리중,4=완료
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)
    points_used = Column(Integer, nullable=True, default=0)
    is_free_maint = Column(Boolean, nullable=False, default=False)  # 무상 유지보수 기간 요청
    request_type = Column(String(10), nullable=True)  # maint / dev / NULL(미분류)
    request_file = Column(String(100), nullable=True)  # 구버전 단일 첨부
    dev_subscription_id = Column(Integer, ForeignKey("pacms_devsubscription.seq"), nullable=True)

    company = relationship("Company")
    project = relationship("Project", backref="managelists")
    writer = relationship("Manager")
    comments = relationship("ManagelistComment", back_populates="managelist", order_by="ManagelistComment.created_at")
    attachments = relationship("MaintenanceAttachment", back_populates="managelist")
    dev_subscription = relationship("DevSubscription", foreign_keys=[dev_subscription_id])


class ManagelistComment(Base):
    __tablename__ = "Managelist_comment"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    managelist_id = Column(Integer, ForeignKey("Managelist.seq"), nullable=True)
    writer_id = Column(Integer, ForeignKey("pacms_customauthuser.id"), nullable=True)
    parent_id = Column(Integer, ForeignKey("Managelist_comment.seq"), nullable=True)
    content = Column(Text, nullable=True)
    worker_type = Column(Integer, nullable=True)  # 1-6
    status = Column(Integer, nullable=True)  # 1-4
    point = Column(Integer, nullable=True, default=0)
    point_executed = Column(Boolean, nullable=True, default=False)
    completion_date = Column(DateTime, nullable=True)
    attachment = Column(String(500), nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)

    managelist = relationship("Managelist", back_populates="comments")
    writer = relationship("CustomAuthUser", foreign_keys=[writer_id])
    parent = relationship("ManagelistComment", remote_side=[seq], backref="replies")
    comment_attachments = relationship("CommentAttachment", back_populates="comment")


class MaintenanceAttachment(Base):
    __tablename__ = "maintenance_attachment"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    managelist_id = Column(Integer, ForeignKey("Managelist.seq"), nullable=True)
    file = Column(String(500), nullable=True)
    filename = Column(String(255), nullable=True)
    uploaded_at = Column(DateTime, nullable=True)

    managelist = relationship("Managelist", back_populates="attachments")


class CommentAttachment(Base):
    __tablename__ = "comment_attachment"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    comment_id = Column(Integer, ForeignKey("Managelist_comment.seq"), nullable=True)
    file = Column(String(500), nullable=True)
    filename = Column(String(255), nullable=True)
    uploaded_at = Column(DateTime, nullable=True)

    comment = relationship("ManagelistComment", back_populates="comment_attachments")


class News(Base):
    __tablename__ = "News"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(200), nullable=True)
    content = Column(Text, nullable=True)
    category = Column(String(50), nullable=True)
    writer_id = Column(Integer, ForeignKey("pacms_customauthuser.id"), nullable=True)
    is_published = Column(Boolean, default=False)
    views = Column(Integer, default=0)
    attachment = Column(String(500), nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)

    writer = relationship("CustomAuthUser", foreign_keys=[writer_id])
    companies = relationship("Company", secondary=news_companies, backref="news_items")


class Inditask(Base):
    __tablename__ = "Inditask"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(200), nullable=True)
    company_id = Column(Integer, ForeignKey("company.seq"), nullable=True)
    project_id = Column(Integer, ForeignKey("project.seq"), nullable=True)
    content = Column(Text, nullable=True)
    writer_id = Column(Integer, ForeignKey("manager.seq"), nullable=True)
    worker_id = Column(Integer, ForeignKey("pacms_customauthuser.id"), nullable=True)
    requestDate = Column(DateTime, nullable=True)
    work_date = Column(DateTime, nullable=True)
    task_type = Column(Integer, nullable=True)
    deadline = Column(DateTime, nullable=True)
    task_status = Column(Integer, nullable=True, default=1)
    budget = Column(Integer, nullable=True, default=0)
    estimated_hours = Column(Float, nullable=True)
    actual_hours = Column(Float, nullable=True)
    work_started_at = Column(DateTime, nullable=True)
    inditask_file = Column(String(500), nullable=True)
    inditask_file_name = Column(String(500), nullable=True)
    inditask_comment = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)

    company = relationship("Company")
    project = relationship("Project")
    writer = relationship("Manager")
    worker = relationship("CustomAuthUser", foreign_keys=[worker_id])
    task_comments = relationship("InditaskComment", back_populates="inditask", order_by="InditaskComment.created_at")


class InditaskComment(Base):
    __tablename__ = "InditaskComment"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    inditask_id = Column(Integer, ForeignKey("Inditask.seq"), nullable=True)
    content = Column(Text, nullable=True)
    writer_id = Column(Integer, ForeignKey("pacms_customauthuser.id"), nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)

    inditask = relationship("Inditask", back_populates="task_comments")
    writer = relationship("CustomAuthUser", foreign_keys=[writer_id])


class Estimate(Base):
    __tablename__ = "Estimate"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(Integer, ForeignKey("company.seq"), nullable=True)
    project_id = Column(Integer, ForeignKey("project.seq"), nullable=True)
    estimate_title = Column(String(200), nullable=True)
    estimate_content = Column(Text, nullable=True)
    estimate_number = Column(String(100), nullable=True)
    estimate_type = Column(String(50), nullable=True)
    project_type = Column(String(2), nullable=True)   # PACMS 프로젝트 유형 코드 (계약서 조문 구성에 사용)
    estimate_date = Column(Date, nullable=True)
    estimate_amount = Column(Integer, nullable=True, default=0)
    estimate_status = Column(Integer, nullable=True, default=1)
    tax_rate = Column(Float, nullable=True)
    discount_type = Column(String(1), nullable=True)
    discount_rate = Column(Float, nullable=True)
    discount_amount = Column(Integer, nullable=True)
    discount_description = Column(String(200), nullable=True)
    approval_token = Column(String(64), nullable=True)
    approval_token_created_at = Column(DateTime, nullable=True)
    customer_email_sent = Column(String(254), nullable=True)
    validity_period = Column(DateTime, nullable=True)
    payment_terms = Column(Text, nullable=True)
    delivery_terms = Column(Text, nullable=True)
    estimate_manager_id = Column(Integer, nullable=True)
    written_date = Column(Date, nullable=True)
    deposit_pct = Column(Integer, nullable=True)
    deposit_due_date = Column(Date, nullable=True)
    progress_pct = Column(Integer, nullable=True)
    progress_due_date = Column(Date, nullable=True)
    balance_pct = Column(Integer, nullable=True)
    balance_due_date = Column(Date, nullable=True)
    contract_date = Column(DateTime, nullable=True)
    contract_termination_date = Column(DateTime, nullable=True)
    contract_period_range = Column(String(100), nullable=True)
    contract_deposit = Column(Integer, nullable=True)
    point = Column(Integer, nullable=True)
    converted_project_id = Column(Integer, nullable=True)
    dev_subscription_plan = Column(String(20), nullable=True)
    ai_dev_subscription_plan = Column(String(20), nullable=True)
    maint_subscription_plan = Column(String(20), nullable=True)
    free_maint_months = Column(Integer, nullable=True)
    free_maint_scope = Column(Text, nullable=True)
    requirements = Column(Text, nullable=True)
    ai_contract_data = Column(Text, nullable=True)
    folder_name = Column(String(200), nullable=True)
    maint_hosting_type = Column(String(1), nullable=True)
    maint_hosting_provider = Column(String(200), nullable=True)
    maint_hosting_start_date = Column(Date, nullable=True)
    maint_hosting_end_date = Column(Date, nullable=True)
    maint_domain_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)

    company = relationship("Company")
    project = relationship("Project")
    items = relationship("EstimateItem", back_populates="estimate", order_by="EstimateItem.item_order")


class EstimateItem(Base):
    __tablename__ = "estimate_item"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    estimate_id = Column(Integer, ForeignKey("Estimate.seq"), nullable=True)
    item_order = Column(Integer, nullable=True, default=0)
    category = Column(String(100), nullable=True)
    item_name = Column(String(200), nullable=True)
    specification = Column(Text, nullable=True)
    quantity = Column(Integer, nullable=True, default=0)
    unit = Column(String(50), nullable=True)
    unit_price = Column(Integer, nullable=True, default=0)
    is_separate = Column(Boolean, nullable=False, default=False)  # 금액 별도 표시 (합계 제외)
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)

    estimate = relationship("Estimate", back_populates="items")


class EstimateStatusHistory(Base):
    __tablename__ = "estimate_status_history"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    estimate_id = Column(Integer, ForeignKey("Estimate.seq"), nullable=True)
    previous_status = Column(String(1), nullable=True)
    new_status = Column(String(1), nullable=False)
    changed_by_id = Column(Integer, nullable=True)
    change_reason = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=True)


class EstimateRevisionRequest(Base):
    __tablename__ = "estimate_revision_request"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    estimate_id = Column(Integer, ForeignKey("Estimate.seq"), nullable=True)
    requester_email = Column(String(254), nullable=True)
    requester_name = Column(String(100), nullable=True)
    title = Column(String(200), nullable=True)
    content = Column(Text, nullable=True)
    is_resolved = Column(Boolean, default=False)
    resolved_by_id = Column(Integer, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    resolved_comment = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)


class Payment(Base):
    __tablename__ = "payment"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    project_type = Column(String(50), nullable=True)
    company_id = Column(Integer, ForeignKey("company.seq"), nullable=True)
    project_id = Column(Integer, ForeignKey("project.seq"), nullable=True)
    payment_date = Column(Date, nullable=True)
    payment_amount = Column(Integer, nullable=True, default=0)
    payment_type = Column(Integer, nullable=True)
    payment_method = Column(Integer, nullable=True)
    payment_status = Column(Integer, nullable=True, default=1)
    production_price = Column(Integer, nullable=True)
    history_remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)

    company = relationship("Company")
    project = relationship("Project")


class PointHistory(Base):
    __tablename__ = "point_history"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(Integer, ForeignKey("company.seq"), nullable=True)
    project_id = Column(Integer, ForeignKey("project.seq"), nullable=True)
    managelist_id = Column(Integer, ForeignKey("Managelist.seq"), nullable=True)
    comment_id = Column(Integer, ForeignKey("Managelist_comment.seq"), nullable=True)
    content = Column(String(500), nullable=True)
    point = Column(Integer, nullable=True, default=0)
    point_type = Column(Integer, nullable=True)  # 1=충전,2=사용,3=책정
    point_category = Column(String(1), nullable=True, default="1")  # '1'=유지보수,'2'=개발
    status = Column(Integer, nullable=True, default=1)  # 1=입력,2=실행
    worker_type = Column(Integer, nullable=True)
    service_type = Column(String(50), nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)
    writer_id = Column(BigInteger, nullable=True)  # pacms_customauthuser.id
    contract_date = Column(Date, nullable=True)
    contract_termination_date = Column(Date, nullable=True)
    edit_reason = Column(Text, nullable=True)
    edited_at = Column(DateTime, nullable=False, default=datetime.now)  # NOT NULL, DB 기본값 없음(Django auto_now)
    edited_by_id = Column(BigInteger, nullable=True)

    company = relationship("Company")
    project = relationship("Project")
    managelist = relationship("Managelist")
    comment = relationship("ManagelistComment")


class Inquiry(Base):
    __tablename__ = "inquiry"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(Integer, ForeignKey("company.seq"), nullable=True)
    writer_id = Column(Integer, ForeignKey("manager.seq"), nullable=True)
    title = Column(String(200), nullable=True)
    contents = Column(Text, nullable=True)
    inquiry_type = Column(Integer, nullable=True)
    status = Column(Integer, nullable=True, default=1)
    priority = Column(String(50), nullable=True)
    inquiry_file = Column(String(100), nullable=True)  # 구버전 단일 첨부
    answered_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)

    company = relationship("Company")
    writer = relationship("Manager")
    answers = relationship("InquiryAnswer", back_populates="inquiry", order_by="InquiryAnswer.created_at")
    inquiry_attachments = relationship("InquiryAttachment", back_populates="inquiry")


class InquiryAnswer(Base):
    __tablename__ = "inquiry_answer"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    inquiry_id = Column(Integer, ForeignKey("inquiry.seq"), nullable=True)
    content = Column(Text, nullable=True)
    writer_type = Column(Integer, nullable=True)
    admin_writer_id = Column(Integer, ForeignKey("pacms_customauthuser.id"), nullable=True)
    customer_writer_id = Column(Integer, ForeignKey("manager.seq"), nullable=True)
    parent_answer_id = Column(Integer, ForeignKey("inquiry_answer.seq"), nullable=True)
    answer_file = Column(String(100), nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)

    inquiry = relationship("Inquiry", back_populates="answers")
    admin_writer = relationship("CustomAuthUser", foreign_keys=[admin_writer_id])
    customer_writer = relationship("Manager", foreign_keys=[customer_writer_id])
    parent_answer = relationship("InquiryAnswer", remote_side=[seq])


class InquiryAttachment(Base):
    __tablename__ = "inquiry_attachment"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    inquiry_id = Column(Integer, ForeignKey("inquiry.seq"), nullable=True)
    file = Column(String(500), nullable=True)
    filename = Column(String(255), nullable=True)
    uploaded_at = Column(DateTime, nullable=True)

    inquiry = relationship("Inquiry", back_populates="inquiry_attachments")


class Notice(Base):
    __tablename__ = "Notice"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(200), nullable=True)
    notice_type = Column(Integer, nullable=True)
    company_id = Column(Integer, ForeignKey("company.seq"), nullable=True)
    content = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)

    company = relationship("Company")


# === 프로젝트구축진행 게시판 ===

class ProjectBoardCategory(Base):
    __tablename__ = "project_board_category"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column("project_id", Integer, ForeignKey("project.seq"), nullable=True)
    name = Column(String(100), nullable=True)
    description = Column(String(255), nullable=True)
    icon = Column(String(50), nullable=True)
    color = Column(String(20), nullable=True)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)

    project = relationship("Project", foreign_keys=[project_id])


project_board_categories = Table(
    "project_board_categories",
    Base.metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("projectboard_id", Integer, ForeignKey("project_board.seq")),
    Column("projectboardcategory_id", Integer, ForeignKey("project_board_category.seq")),
)


class ProjectBoard(Base):
    __tablename__ = "project_board"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column("company_id", Integer, ForeignKey("company.seq"), nullable=True)
    project_id = Column("project_id", Integer, ForeignKey("project.seq"), nullable=True)
    parent_id = Column(Integer, ForeignKey("project_board.seq"), nullable=True)
    title = Column(String(200), nullable=True)
    content = Column(Text, nullable=True)
    writer_id = Column("writer_id", Integer, ForeignKey("pacms_customauthuser.id"), nullable=True)
    customer_writer_id = Column("customer_writer_id", Integer, ForeignKey("manager.seq"), nullable=True)
    writer_type = Column(String(1), nullable=True)
    status = Column(String(1), nullable=True, default="1")
    views = Column(Integer, default=0)
    is_notice = Column(Boolean, default=False)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)

    company = relationship("Company", foreign_keys=[company_id])
    project = relationship("Project", foreign_keys=[project_id])
    categories = relationship("ProjectBoardCategory", secondary=project_board_categories)
    parent = relationship("ProjectBoard", remote_side=[seq], backref="replies")
    admin_writer = relationship("CustomAuthUser", foreign_keys=[writer_id])
    customer_writer = relationship("Manager", foreign_keys=[customer_writer_id])
    comments = relationship("ProjectBoardComment", back_populates="board", order_by="ProjectBoardComment.created_at")
    board_attachments = relationship("ProjectBoardAttachment", back_populates="board")


class ProjectBoardComment(Base):
    __tablename__ = "project_board_comment"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    board_id = Column("board_id", Integer, ForeignKey("project_board.seq"), nullable=True)
    parent_id = Column(Integer, ForeignKey("project_board_comment.seq"), nullable=True)
    content = Column(Text, nullable=True)
    writer_id = Column("writer_id", Integer, ForeignKey("pacms_customauthuser.id"), nullable=True)
    customer_writer_id = Column("customer_writer_id", Integer, ForeignKey("manager.seq"), nullable=True)
    writer_type = Column(String(1), nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)

    board = relationship("ProjectBoard", back_populates="comments")
    parent = relationship("ProjectBoardComment", remote_side=[seq], backref="child_comments")
    admin_writer = relationship("CustomAuthUser", foreign_keys=[writer_id])
    customer_writer = relationship("Manager", foreign_keys=[customer_writer_id])
    comment_attachments = relationship("ProjectBoardCommentAttachment", back_populates="comment")


class ProjectBoardAttachment(Base):
    __tablename__ = "project_board_attachment"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    board_id = Column("board_id", Integer, ForeignKey("project_board.seq"), nullable=True)
    file = Column(String(500), nullable=True)
    filename = Column(String(255), nullable=True)
    file_size = Column(Integer, default=0)
    uploaded_at = Column(DateTime, nullable=True)

    board = relationship("ProjectBoard", back_populates="board_attachments")


class ProjectBoardCommentAttachment(Base):
    __tablename__ = "project_board_comment_attachment"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    comment_id = Column("comment_id", Integer, ForeignKey("project_board_comment.seq"), nullable=True)
    file = Column(String(500), nullable=True)
    filename = Column(String(255), nullable=True)
    file_size = Column(Integer, default=0)
    uploaded_at = Column(DateTime, nullable=True)

    comment = relationship("ProjectBoardComment", back_populates="comment_attachments")


class EstimateContract(Base):
    __tablename__ = "estimate_contract"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    estimate_id = Column(Integer, ForeignKey("Estimate.seq"), nullable=True)
    company_id = Column(Integer, ForeignKey("company.seq"), nullable=True)
    contract_number = Column(String(50), nullable=True)
    contract_title = Column(String(200), nullable=True)
    project_type = Column(String(2), nullable=True)
    party_a_name = Column(String(100), nullable=True)
    party_a_ceo = Column(String(100), nullable=True)
    party_a_business_number = Column(String(50), nullable=True)
    party_a_address = Column(String(200), nullable=True)
    party_a_email = Column(String(254), nullable=True)
    party_b_name = Column(String(100), nullable=False, default="한결랩")
    party_b_ceo = Column(String(100), nullable=False, default="김경섭")
    party_b_business_number = Column(String(50), nullable=False, default="328-79-00578")
    party_b_address = Column(String(200), nullable=False, default="경기도 고양시 일산서구 고양대로 666 101-603")
    party_b_email = Column(String(254), nullable=False, default="kks@hankyeul.com")
    contract_amount = Column(Integer, nullable=True)
    contract_date = Column(Date, nullable=True)
    contract_start_date = Column(Date, nullable=True)
    contract_end_date = Column(Date, nullable=True)
    contract_period = Column(String(100), nullable=True)
    project_description = Column(Text, nullable=True)
    service_scope = Column(Text, nullable=True)
    payment_terms = Column(Text, nullable=True)
    special_terms = Column(Text, nullable=True)
    maintenance_point = Column(Integer, nullable=True)
    free_maint_months = Column(Integer, nullable=True)  # 무상 유지보수 기간(개월, 계약만료일 다음날부터)
    free_maint_scope = Column(Text, nullable=True)
    status = Column(String(1), nullable=False, default="1")
    sent_at = Column(DateTime, nullable=True)
    sent_to_email = Column(String(254), nullable=True)
    customer_signature_token = Column(String(64), nullable=True)
    customer_signed_at = Column(DateTime, nullable=True)
    customer_signed_name = Column(String(100), nullable=True)
    customer_signed_ip = Column(String(39), nullable=True)
    customer_signed_hash = Column(String(64), nullable=True)
    customer_signed_user_agent = Column(Text, nullable=True)
    manager_signed_at = Column(DateTime, nullable=True)
    manager_signed_name = Column(String(100), nullable=True)
    manager_signed_ip = Column(String(39), nullable=True)
    manager_signed_user_agent = Column(Text, nullable=True)
    manager_signed_hash = Column(String(64), nullable=True)
    manager_signed_by_id = Column(Integer, nullable=True)
    contract_file = Column(String(100), nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)
    created_by_id = Column(Integer, nullable=True)
    sent_by_id = Column(Integer, nullable=True)

    estimate = relationship("Estimate", backref="contracts")
    company = relationship("Company")


class DevSubscription(Base):
    __tablename__ = "pacms_devsubscription"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(Integer, ForeignKey("company.seq"), nullable=False)
    plan_type = Column(String(10), nullable=False)  # starter/growth/scale
    status = Column(String(10), default="active")   # active/inactive/beta
    start_date = Column(Date, nullable=False)
    next_charge_date = Column(Date, nullable=False)
    is_beta = Column(Boolean, default=False)
    maintenance_points_per_month = Column(Integer, default=0)
    dev_points_per_month = Column(Integer, default=0)
    monthly_price = Column(Integer, default=0)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    company = relationship("Company", back_populates="dev_subscriptions")


class MaintSubscription(Base):
    __tablename__ = "pacms_maintsubscription"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(Integer, ForeignKey("company.seq"), nullable=False)
    plan_type = Column(String(10), nullable=False)  # basic/growth/business
    status = Column(String(10), default="active")   # active/inactive/beta
    start_date = Column(Date, nullable=False)
    next_charge_date = Column(Date, nullable=False)
    is_beta = Column(Boolean, default=False)
    maintenance_points_per_month = Column(Integer, default=0)
    monthly_price = Column(Integer, default=0)
    source_estimate_id = Column(Integer, ForeignKey("Estimate.seq"), nullable=True)
    notes = Column(Text, nullable=True)
    # PACMS 0137 — 유지보수 전환 흐름에서 추가된 컬럼 (기존 구독은 모두 NULL)
    project_id = Column(Integer, ForeignKey("project.seq"), nullable=True)
    end_date = Column(Date, nullable=True)
    renewal_id = Column(Integer, ForeignKey("maint_renewal.seq"), nullable=True)
    hosting_type = Column(String(1), nullable=True)  # I(한결랩) / E(외부)
    hosting_provider = Column(String(200), nullable=True)
    domain_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    company = relationship("Company", back_populates="maint_subscriptions")
    services = relationship(
        "MaintSubscriptionService",
        order_by="(MaintSubscriptionService.order_no, MaintSubscriptionService.seq)",
    )


class MaintRenewal(Base):
    """PACMS maint_renewal — 프로젝트 만료 시 유지보수 의향 확인 건.
    HCMS는 고객 응답(status/chosen_plan/hosting/responded_at/memo append)만 UPDATE한다."""
    __tablename__ = "maint_renewal"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("project.seq"), nullable=False)
    company_id = Column(Integer, ForeignKey("company.seq"), nullable=True)
    due_date = Column(Date, nullable=False)
    status = Column(String(10), nullable=False)  # pending/contacted/accepted/declined/estimated/converted/ended/closed
    chosen_plan = Column(String(10), nullable=True)
    contract_months = Column(Integer, nullable=False)
    hosting_type = Column(String(1), nullable=True)
    hosting_provider = Column(String(200), nullable=True)
    external_hosting_end_date = Column(Date, nullable=True)
    domain_id = Column(Integer, nullable=True)
    estimate_id = Column(Integer, ForeignKey("Estimate.seq"), nullable=True)
    new_project_id = Column(Integer, ForeignKey("project.seq"), nullable=True)
    notified_at = Column(DateTime, nullable=True)
    contacted_at = Column(DateTime, nullable=True)
    responded_at = Column(DateTime, nullable=True)
    handled_by_id = Column(BigInteger, nullable=True)  # PACMS 직원 — HCMS는 건드리지 않음
    memo = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)

    project = relationship("Project", foreign_keys=[project_id])


class MaintSubscriptionService(Base):
    """PACMS maint_subscription_service — 구독별 실제 이용 서비스 (읽기 전용)"""
    __tablename__ = "maint_subscription_service"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    subscription_id = Column(Integer, ForeignKey("pacms_maintsubscription.seq"), nullable=False)
    service_code = Column(String(30), nullable=False)
    name = Column(String(100), nullable=False)
    spec = Column(String(200), nullable=True)
    status = Column(String(10), nullable=False)  # pending/active/inactive
    domain_id = Column(Integer, nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    memo = Column(Text, nullable=True)
    order_no = Column("order", Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)


class ManagelistDeleteLog(Base):
    """유지보수 요청 삭제 로그 (Django 소유)."""
    __tablename__ = "managelist_delete_log"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    original_seq = Column(Integer, nullable=False)
    company_name = Column(String(100), nullable=False)
    project_title = Column(String(200), nullable=True)
    title = Column(String(200), nullable=False)
    contents = Column(Text, nullable=True)
    writer_name = Column(String(100), nullable=True)
    status = Column(String(10), nullable=False)
    points_used = Column(Integer, nullable=False, default=0)
    deleted_by_id = Column(BigInteger, nullable=True)
    deleted_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, nullable=True)


class ManagelistCommentTemplate(Base):
    """처리내역 템플릿 (Django 소유)."""
    __tablename__ = "managelist_comment_template"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    content = Column(Text, nullable=False)
    worker_type = Column(String(1), nullable=True)
    usage_count = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    is_default = Column(Boolean, nullable=False, default=False)
    sort_order = Column(Integer, nullable=False, default=0)
    created_by_id = Column(BigInteger, nullable=True)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)


class RecentActivity(Base):
    """최근 활동(Django 소유) — cms 문의 답변 시 함께 기록된다."""
    __tablename__ = "recent_activity"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    activity = Column(String(255), nullable=False)
    company_id = Column(Integer, nullable=False)
    writer_id = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False)


class SalesLead(Base):
    """영업접수 (Django 소유). 문자열 NOT NULL 컬럼은 빈 문자열로 채운다."""
    __tablename__ = "sales_lead"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(200), nullable=False, default="")
    source = Column(String(20), nullable=False, default="other")
    status = Column(String(20), nullable=False, default="new")
    priority = Column(String(10), nullable=False, default="medium")
    company_id = Column(Integer, nullable=True)
    client_company = Column(String(200), nullable=False, default="")
    client_name = Column(String(100), nullable=False, default="")
    client_phone = Column(String(50), nullable=False, default="")
    client_email = Column(String(254), nullable=False, default="")
    client_position = Column(String(100), nullable=False, default="")
    description = Column(Text, nullable=False, default="")
    expected_amount = Column(Integer, nullable=False, default=0)
    expected_close_date = Column(Date, nullable=True)
    notes = Column(Text, nullable=False, default="")
    is_draft = Column(Boolean, nullable=False, default=False)
    estimate_id = Column(Integer, nullable=True)
    inquiry_id = Column(Integer, nullable=True)
    manager_id = Column(BigInteger, nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)


class SalesLeadActivity(Base):
    __tablename__ = "sales_lead_activity"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    sales_lead_id = Column(Integer, nullable=False)
    activity_type = Column(String(20), nullable=False)
    content = Column(Text, nullable=False, default="")
    old_status = Column(String(20), nullable=False, default="")
    new_status = Column(String(20), nullable=False, default="")
    created_by_id = Column(BigInteger, nullable=True)
    created_at = Column(DateTime, nullable=True)


class SalesLeadActivityAttachment(Base):
    __tablename__ = "sales_lead_activity_attachment"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    activity_id = Column(Integer, nullable=False)
    file = Column(String(100), nullable=False)
    filename = Column(String(255), nullable=False)
    uploaded_at = Column(DateTime, nullable=False)


class EstimateContractHistory(Base):
    """계약서 이력 (Django 소유). action: created/updated/sent/resent/viewed/signed/manager_signed/cancelled."""
    __tablename__ = "estimate_contract_history"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    contract_id = Column(Integer, nullable=False)
    action = Column(String(20), nullable=False)
    action_by_id = Column(BigInteger, nullable=True)
    action_by_name = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)
    ip_address = Column(String(39), nullable=True)
    created_at = Column(DateTime, nullable=False)


class PaymentHistory(Base):
    """납부내역 (Django 소유)."""
    __tablename__ = "payment_history"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(Integer, nullable=True)
    project_id = Column(Integer, nullable=True)
    payment_id = Column(Integer, nullable=True)
    payment_amount = Column(Integer, nullable=True)
    deposit_amount = Column(Integer, nullable=True)
    deposit_date = Column(DateTime, nullable=True)
    progress_amount = Column(Integer, nullable=True)
    progress_date = Column(DateTime, nullable=True)
    balance_amount = Column(Integer, nullable=True)
    balance_date = Column(DateTime, nullable=True)
    payment_tf = Column(String(1), nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)
