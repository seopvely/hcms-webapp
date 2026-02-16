from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    Date,
    ForeignKey,
    Text,
    Table,
    Float,
)
from sqlalchemy.orm import relationship
from app.db.session import Base


# Read-only mapping of Django's customauthuser table
class CustomAuthUser(Base):
    __tablename__ = "pacms_customauthuser"

    id = Column(Integer, primary_key=True)
    username = Column(String(150), nullable=True)
    name = Column(String(100), nullable=True)
    email = Column(String(254), nullable=True)
    group = Column(String(100), nullable=True)
    type = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True)


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
    point = Column(Integer, nullable=True, default=0)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)
    extension_count = Column(Integer, nullable=True, default=0)

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

    company = relationship("Company")
    project = relationship("Project", backref="managelists")
    writer = relationship("Manager")
    comments = relationship("ManagelistComment", back_populates="managelist", order_by="ManagelistComment.created_at")
    attachments = relationship("MaintenanceAttachment", back_populates="managelist")


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
    category = Column(String(50), nullable=True)  # general/maintenance/notice/update
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
    task_type = Column(Integer, nullable=True)  # 1-7
    deadline = Column(DateTime, nullable=True)
    task_status = Column(Integer, nullable=True, default=1)  # 1-4
    budget = Column(Integer, nullable=True, default=0)
    estimated_hours = Column(Float, nullable=True)
    actual_hours = Column(Float, nullable=True)
    inditask_file = Column(String(500), nullable=True)
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
    estimate_date = Column(Date, nullable=True)
    estimate_amount = Column(Integer, nullable=True, default=0)
    estimate_status = Column(Integer, nullable=True, default=1)  # 1-5
    tax_rate = Column(Float, nullable=True)
    discount_type = Column(String(1), nullable=True)  # 1=비율, 2=금액
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
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)

    estimate = relationship("Estimate", back_populates="items")


class Payment(Base):
    __tablename__ = "payment"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    project_type = Column(String(50), nullable=True)
    company_id = Column(Integer, ForeignKey("company.seq"), nullable=True)
    project_id = Column(Integer, ForeignKey("project.seq"), nullable=True)
    payment_date = Column(Date, nullable=True)
    payment_amount = Column(Integer, nullable=True, default=0)
    payment_type = Column(Integer, nullable=True)  # 1-6
    payment_method = Column(Integer, nullable=True)  # 1-3
    payment_status = Column(Integer, nullable=True, default=1)  # 1-3
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
    status = Column(Integer, nullable=True, default=1)  # 1=입력,2=실행
    worker_type = Column(Integer, nullable=True)
    service_type = Column(String(50), nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)

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
    inquiry_type = Column(Integer, nullable=True)  # 1-7
    status = Column(Integer, nullable=True, default=1)  # 1-3
    priority = Column(String(50), nullable=True)
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
    writer_type = Column(Integer, nullable=True)  # 1=관리자,2=고객
    admin_writer_id = Column(Integer, ForeignKey("pacms_customauthuser.id"), nullable=True)
    customer_writer_id = Column(Integer, ForeignKey("manager.seq"), nullable=True)
    parent_answer_id = Column(Integer, ForeignKey("inquiry_answer.seq"), nullable=True)
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
    notice_type = Column(Integer, nullable=True)  # 1-3
    company_id = Column(Integer, ForeignKey("company.seq"), nullable=True)
    content = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)

    company = relationship("Company")


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
    status = Column(String(1), nullable=False, default="1")
    sent_at = Column(DateTime, nullable=True)
    sent_to_email = Column(String(254), nullable=True)
    customer_signature_token = Column(String(64), nullable=True)
    customer_signed_at = Column(DateTime, nullable=True)
    customer_signed_name = Column(String(100), nullable=True)
    contract_file = Column(String(100), nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)
    created_by_id = Column(Integer, nullable=True)
    sent_by_id = Column(Integer, nullable=True)

    estimate = relationship("Estimate", backref="contracts")
    company = relationship("Company")
