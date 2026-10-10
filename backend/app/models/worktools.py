"""업무도구 테이블 (PACMS managed 앱 소유 — 구조 변경 금지, SPEC 06 §2~4).

다대다 수신자 표(alarm_setting_recipients, meeting_appointment_recipients)는 모델 없이 SQL 로 다룬다.
"""
from sqlalchemy import BigInteger, Boolean, Column, Date, DateTime, Integer, Numeric, String, Text, Time

from app.db.session import Base


class AlarmSetting(Base):
    __tablename__ = "alarm_setting"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    when_to_notify = Column(String(10), nullable=False, default="week")  # month / week / custom
    custom_days = Column(Integer, nullable=True)
    valid_status = Column(String(10), nullable=False, default="valid")
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)
    last_sent_at = Column(DateTime, nullable=True)
    event_date = Column(DateTime, nullable=True)  # 레거시
    send_to_all_agents = Column(Boolean, nullable=False, default=True)
    alarm_time = Column(Time, nullable=True)
    image = Column(String(100), nullable=True)
    attach_file = Column(String(100), nullable=True)
    cycle_type = Column(String(10), nullable=False, default="none")
    cycle_days = Column(Integer, nullable=True)
    cycle_end_date = Column(Date, nullable=True)


class AlarmAttachment(Base):
    __tablename__ = "alarm_attachment"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    alarm_id = Column(Integer, nullable=False)
    file = Column(String(100), nullable=False)
    created_at = Column(DateTime, nullable=False)


class AlarmEventDate(Base):
    __tablename__ = "alarm_event_date"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    alarm_id = Column(Integer, nullable=False)
    event_date = Column(DateTime, nullable=False)
    notified = Column(Boolean, nullable=False, default=False)
    notified_at = Column(DateTime, nullable=True)


class AlarmHistory(Base):
    __tablename__ = "alarm_history"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    alarm_setting_id = Column(Integer, nullable=False)
    sent_at = Column(DateTime, nullable=False)
    status = Column(String(10), nullable=False)
    recipient_count = Column(Integer, nullable=False, default=0)
    recipients = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False)


class Todo(Base):
    __tablename__ = "todo"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False, default="")
    priority = Column(String(10), nullable=False, default="normal")
    status = Column(String(15), nullable=False, default="pending")
    start_date = Column(Date, nullable=True)
    due_date = Column(Date, nullable=True)
    tags = Column(String(255), nullable=False, default="")
    is_deleted = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)
    assignee_id = Column(BigInteger, nullable=True)
    created_by_id = Column(BigInteger, nullable=True)
    folder_name = Column(String(255), nullable=False, default="")
    md_content = Column(Text, nullable=False, default="")
    company_id = Column(Integer, nullable=True)
    project_id = Column(Integer, nullable=True)
    reminder_sent_date = Column(Date, nullable=True)


class TodoComment(Base):
    __tablename__ = "todo_comment"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    todo_id = Column(Integer, nullable=False)
    user_id = Column(BigInteger, nullable=True)
    comment = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False)


class TodoFile(Base):
    __tablename__ = "todo_file"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    todo_id = Column(Integer, nullable=False)
    filename = Column(String(255), nullable=False)
    filepath = Column(String(100), nullable=False)
    created_at = Column(DateTime, nullable=False)


class MeetingAppointment(Base):
    __tablename__ = "meeting_appointment"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(255), nullable=False)
    meeting_date = Column(Date, nullable=False)
    meeting_time = Column(Time, nullable=True)
    meeting_type = Column(String(10), nullable=False, default="offline")
    start_place = Column(String(255), nullable=False, default="")
    start_address = Column(String(255), nullable=False, default="")
    start_lat = Column(Numeric(10, 7), nullable=True)
    start_lng = Column(Numeric(10, 7), nullable=True)
    end_place = Column(String(255), nullable=False, default="")
    end_address = Column(String(255), nullable=False, default="")
    end_lat = Column(Numeric(10, 7), nullable=True)
    end_lng = Column(Numeric(10, 7), nullable=True)
    video_meeting_url = Column(String(500), nullable=False, default="")
    memo = Column(Text, nullable=False, default="")
    valid_status = Column(String(10), nullable=False, default="valid")
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)
    created_by_id = Column(BigInteger, nullable=True)
    sales_lead_id = Column(Integer, nullable=True)


class MeetingAttachment(Base):
    __tablename__ = "meeting_attachment"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    meeting_id = Column(Integer, nullable=False)
    file = Column(String(100), nullable=False)
    original_name = Column(String(255), nullable=False)
    file_size = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False)


class MeetingAlarm(Base):
    __tablename__ = "meeting_alarm"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    meeting_id = Column(Integer, nullable=False)
    alarm_datetime = Column(DateTime, nullable=False)
    notified = Column(Boolean, nullable=False, default=False)
    notified_at = Column(DateTime, nullable=True)
    status = Column(String(10), nullable=False, default="pending")
    error_message = Column(Text, nullable=False, default="")
    created_at = Column(DateTime, nullable=False)


class AIPromptTemplate(Base):
    __tablename__ = "ai_prompt_template"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    prompt_content = Column(Text, nullable=False)
    rating_count = Column(Integer, nullable=False, default=0)
    average_rating = Column(Numeric(3, 2), nullable=False, default=0)
    usage_count = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    is_default = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)
    created_by_id = Column(BigInteger, nullable=True)
    claude_model = Column(String(50), nullable=False, default="claude-haiku-4-5")
    temperature = Column(Numeric(3, 2), nullable=False, default=0.7)
    session_id = Column(String(100), nullable=True)


class AIPromptRating(Base):
    __tablename__ = "ai_prompt_rating"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    prompt_id = Column(Integer, nullable=False)
    rating = Column(Integer, nullable=False)
    feedback = Column(Text, nullable=True)
    ai_response = Column(Text, nullable=True)
    rated_by_id = Column(BigInteger, nullable=True)
    created_at = Column(DateTime, nullable=False)
