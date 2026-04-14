import smtplib
import logging
import threading
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
from sqlalchemy.orm import Session

from app.models.customer import CustomAuthUser

logger = logging.getLogger(__name__)

SMTP_HOST = "localhost"
SMTP_PORT = 25
FROM_EMAIL = "no-reply@hankyeul.com"
FROM_NAME = "HCMS 고객관리시스템"


def get_agent_emails(db: Session) -> list[str]:
    """Get email addresses of all active agents from pacms_customauthuser"""
    agents = (
        db.query(CustomAuthUser)
        .filter(
            CustomAuthUser.is_active == True,
            CustomAuthUser.email.isnot(None),
            CustomAuthUser.email != "",
        )
        .all()
    )
    return [agent.email for agent in agents if agent.email and "@" in agent.email]


def _send_email(to_emails: list[str], subject: str, html_body: str):
    """Send email via SMTP (called in background thread)"""
    if not to_emails:
        logger.warning("No recipient emails provided, skipping email send")
        return

    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = f"{FROM_NAME} <{FROM_EMAIL}>"
        msg["To"] = ", ".join(to_emails)
        msg["Subject"] = subject
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.sendmail(FROM_EMAIL, to_emails, msg.as_string())

        logger.info(f"Email sent successfully to {len(to_emails)} recipients: {subject}")
    except Exception as e:
        logger.error(f"Failed to send email: {e}")


def send_email_async(to_emails: list[str], subject: str, html_body: str):
    """Send email in background thread to not block API response"""
    thread = threading.Thread(target=_send_email, args=(to_emails, subject, html_body))
    thread.daemon = True
    thread.start()


def _build_html(title: str, items: list[tuple[str, str]], link_url: str, link_text: str) -> str:
    """Build a simple HTML email body"""
    rows = ""
    for label, value in items:
        rows += f"""
        <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #666; font-weight: bold; width: 120px;">{label}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #333;">{value}</td>
        </tr>"""

    return f"""
    <div style="max-width: 600px; margin: 0 auto; font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; border-radius: 12px 12px 0 0;">
            <h2 style="color: white; margin: 0; font-size: 18px;">{title}</h2>
        </div>
        <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
            <table style="width: 100%; border-collapse: collapse;">
                {rows}
            </table>
            <div style="margin-top: 24px; text-align: center;">
                <a href="{link_url}" style="display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">{link_text}</a>
            </div>
        </div>
        <div style="padding: 16px; text-align: center; color: #999; font-size: 12px;">
            본 메일은 HCMS 고객관리시스템에서 자동 발송되었습니다.
        </div>
    </div>
    """


PACMS_BASE_URL = "https://cms.hankyeul.com"


def notify_maintenance_created(
    db: Session,
    maintenance_id: int,
    company_name: str,
    project_title: str,
    title: str,
    writer_name: str,
):
    """Send notification email when a new maintenance request is created"""
    emails = get_agent_emails(db)
    if not emails:
        return

    subject = f"[HCMS] 새 유지보수 요청: {title}"
    html = _build_html(
        title="새로운 유지보수 요청이 등록되었습니다",
        items=[
            ("업체명", company_name),
            ("프로젝트", project_title),
            ("제목", title),
            ("작성자", writer_name),
        ],
        link_url=f"{PACMS_BASE_URL}/managed/managelist_detail/{maintenance_id}",
        link_text="의뢰 확인하기",
    )
    send_email_async(emails, subject, html)


def notify_task_created(
    db: Session,
    task_id: int,
    company_name: str,
    title: str,
    task_type_label: str,
    writer_name: str,
):
    """Send notification email when a new task is created"""
    emails = get_agent_emails(db)
    if not emails:
        return

    subject = f"[HCMS] 새 건별의뢰: {title}"
    html = _build_html(
        title="새로운 건별의뢰가 등록되었습니다",
        items=[
            ("업체명", company_name),
            ("유형", task_type_label),
            ("제목", title),
            ("작성자", writer_name),
        ],
        link_url=f"{PACMS_BASE_URL}/managed/inditask_detail/{task_id}",
        link_text="의뢰 확인하기",
    )
    send_email_async(emails, subject, html)


def notify_inquiry_created(
    db: Session,
    inquiry_id: int,
    company_name: str,
    title: str,
    inquiry_type_label: str,
    writer_name: str,
):
    """Send notification email when a new inquiry is created"""
    emails = get_agent_emails(db)
    if not emails:
        return

    subject = f"[HCMS] 새 문의: {title}"
    html = _build_html(
        title="새로운 문의가 등록되었습니다",
        items=[
            ("업체명", company_name),
            ("유형", inquiry_type_label),
            ("제목", title),
            ("작성자", writer_name),
        ],
        link_url=f"{PACMS_BASE_URL}/managed/inquiry_detail/{inquiry_id}",
        link_text="문의 확인하기",
    )
    send_email_async(emails, subject, html)


def notify_maintenance_comment_created(
    db: Session,
    maintenance_id: int,
    company_name: str,
    project_title: str,
    maintenance_title: str,
    writer_name: str,
):
    """Send notification email when a customer adds a comment to maintenance"""
    emails = get_agent_emails(db)
    if not emails:
        return

    subject = f"[HCMS] 유지보수 댓글: {maintenance_title}"
    html = _build_html(
        title="유지보수 요청에 새로운 댓글이 등록되었습니다",
        items=[
            ("업체명", company_name),
            ("프로젝트", project_title),
            ("요청 제목", maintenance_title),
            ("작성자", writer_name),
        ],
        link_url=f"{PACMS_BASE_URL}/managed/managelist_detail/{maintenance_id}",
        link_text="댓글 확인하기",
    )
    send_email_async(emails, subject, html)


def notify_inquiry_answer_created(
    db: Session,
    inquiry_id: int,
    company_name: str,
    inquiry_title: str,
    inquiry_type_label: str,
    writer_name: str,
):
    """Send notification email when a customer adds an answer to inquiry"""
    emails = get_agent_emails(db)
    if not emails:
        return

    subject = f"[HCMS] 문의 답변: {inquiry_title}"
    html = _build_html(
        title="문의에 새로운 고객 답변이 등록되었습니다",
        items=[
            ("업체명", company_name),
            ("유형", inquiry_type_label),
            ("문의 제목", inquiry_title),
            ("작성자", writer_name),
        ],
        link_url=f"{PACMS_BASE_URL}/managed/inquiry_detail/{inquiry_id}",
        link_text="답변 확인하기",
    )
    send_email_async(emails, subject, html)


def notify_project_board_created(
    db: Session,
    board_id: int,
    company_name: str,
    project_title: str,
    title: str,
    writer_name: str,
):
    """Send notification email when a customer creates a new project board post"""
    emails = get_agent_emails(db)
    if not emails:
        return

    subject = f"[HCMS] 새 프로젝트 게시글: {title}"
    html = _build_html(
        title="새로운 프로젝트구축진행 게시글이 등록되었습니다",
        items=[
            ("업체명", company_name),
            ("프로젝트", project_title),
            ("제목", title),
            ("작성자", writer_name),
        ],
        link_url=f"{PACMS_BASE_URL}/managed/project-board/{board_id}/",
        link_text="게시글 확인하기",
    )
    send_email_async(emails, subject, html)


def notify_project_board_reply_created(
    db: Session,
    parent_board_id: int,
    company_name: str,
    project_title: str,
    title: str,
    writer_name: str,
):
    """Send notification email when a customer creates a reply to a project board post"""
    emails = get_agent_emails(db)
    if not emails:
        return

    subject = f"[HCMS] 프로젝트 게시글 답글: {title}"
    html = _build_html(
        title="프로젝트구축진행 게시글에 새로운 답글이 등록되었습니다",
        items=[
            ("업체명", company_name),
            ("프로젝트", project_title),
            ("답글 제목", title),
            ("작성자", writer_name),
        ],
        link_url=f"{PACMS_BASE_URL}/managed/project-board/{parent_board_id}/",
        link_text="답글 확인하기",
    )
    send_email_async(emails, subject, html)


def notify_project_board_comment_created(
    db: Session,
    board_id: int,
    company_name: str,
    project_title: str,
    board_title: str,
    writer_name: str,
):
    """Send notification email when a customer adds a comment to a project board post"""
    emails = get_agent_emails(db)
    if not emails:
        return

    subject = f"[HCMS] 프로젝트 게시글 댓글: {board_title}"
    html = _build_html(
        title="프로젝트구축진행 게시글에 새로운 댓글이 등록되었습니다",
        items=[
            ("업체명", company_name),
            ("프로젝트", project_title),
            ("게시글 제목", board_title),
            ("작성자", writer_name),
        ],
        link_url=f"{PACMS_BASE_URL}/managed/project-board/{board_id}/",
        link_text="댓글 확인하기",
    )
    send_email_async(emails, subject, html)
