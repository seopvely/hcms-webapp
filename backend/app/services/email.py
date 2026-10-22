import html
import smtplib
import logging
import threading
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.customer import CustomAuthUser
from app.utils.links import open_link

logger = logging.getLogger(__name__)

SMTP_HOST = "localhost"
SMTP_PORT = 25
FROM_EMAIL = "no-reply@hankyeul.com"
FROM_NAME = "HCMS 고객관리시스템"


def get_agent_emails(db: Session) -> list[str]:
    agents = (
        db.query(CustomAuthUser)
        .filter(CustomAuthUser.is_active == True, CustomAuthUser.email.isnot(None), CustomAuthUser.email != "")
        .all()
    )
    return [agent.email for agent in agents if agent.email and "@" in agent.email]


def send_email_sync(to_emails: list[str], subject: str, html_body: str) -> None:
    """발송 결과를 호출자가 기록해야 할 때(테스트 발송 등) — 실패 시 예외."""
    msg = MIMEMultipart("alternative")
    msg["From"] = f"{FROM_NAME} <{FROM_EMAIL}>"
    msg["To"] = ", ".join(to_emails)
    msg["Subject"] = subject
    msg.attach(MIMEText(html_body, "html", "utf-8"))
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
        server.sendmail(FROM_EMAIL, to_emails, msg.as_string())


def _send_email(to_emails: list[str], subject: str, html_body: str):
    if not to_emails:
        return
    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = f"{FROM_NAME} <{FROM_EMAIL}>"
        msg["To"] = ", ".join(to_emails)
        msg["Subject"] = subject
        msg.attach(MIMEText(html_body, "html", "utf-8"))
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.sendmail(FROM_EMAIL, to_emails, msg.as_string())
        logger.info(f"Email sent to {len(to_emails)} recipients: {subject}")
    except Exception as e:
        logger.error(f"Failed to send email: {e}")


def send_email_async(to_emails: list[str], subject: str, html_body: str):
    thread = threading.Thread(target=_send_email, args=(to_emails, subject, html_body))
    thread.daemon = True
    thread.start()


def _build_html(title: str, items: list[tuple[str, str]], link_url: str, link_text: str) -> str:
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
            <table style="width: 100%; border-collapse: collapse;">{rows}</table>
            <div style="margin-top: 24px; text-align: center;">
                <a href="{link_url}" style="display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">{link_text}</a>
            </div>
        </div>
        <div style="padding: 16px; text-align: center; color: #999; font-size: 12px;">본 메일은 HCMS 고객관리시스템에서 자동 발송되었습니다.</div>
    </div>
    """


# 직원 관리 화면(/managed) base URL — 컷오버 시 .env STAFF_BASE_URL 만 바꾼다
PACMS_BASE_URL = settings.STAFF_BASE_URL


def notify_maintenance_created(db, maintenance_id, company_name, project_title, title, writer_name):
    emails = get_agent_emails(db)
    if not emails:
        return
    send_email_async(emails, f"[HCMS] 새 유지보수 요청: {title}", _build_html(
        "새로운 유지보수 요청이 등록되었습니다",
        [("업체명", company_name), ("프로젝트", project_title), ("제목", title), ("작성자", writer_name)],
        open_link(f"/managed/managelist_detail/{maintenance_id}", PACMS_BASE_URL), "의뢰 확인하기",
    ))


def notify_task_created(db, task_id, company_name, title, task_type_label, writer_name):
    emails = get_agent_emails(db)
    if not emails:
        return
    send_email_async(emails, f"[HCMS] 새 건별의뢰: {title}", _build_html(
        "새로운 건별의뢰가 등록되었습니다",
        [("업체명", company_name), ("유형", task_type_label), ("제목", title), ("작성자", writer_name)],
        open_link(f"/managed/inditask_detail/{task_id}", PACMS_BASE_URL), "의뢰 확인하기",
    ))


def notify_inquiry_created(db, inquiry_id, company_name, title, inquiry_type_label, writer_name):
    emails = get_agent_emails(db)
    if not emails:
        return
    send_email_async(emails, f"[HCMS] 새 문의: {title}", _build_html(
        "새로운 문의가 등록되었습니다",
        [("업체명", company_name), ("유형", inquiry_type_label), ("제목", title), ("작성자", writer_name)],
        open_link(f"/managed/inquiry_detail/{inquiry_id}", PACMS_BASE_URL), "문의 확인하기",
    ))


def notify_maintenance_comment_created(db, maintenance_id, company_name, project_title, maintenance_title, writer_name):
    emails = get_agent_emails(db)
    if not emails:
        return
    send_email_async(emails, f"[HCMS] 유지보수 댓글: {maintenance_title}", _build_html(
        "유지보수 요청에 새로운 댓글이 등록되었습니다",
        [("업체명", company_name), ("프로젝트", project_title), ("요청 제목", maintenance_title), ("작성자", writer_name)],
        open_link(f"/managed/managelist_detail/{maintenance_id}", PACMS_BASE_URL), "댓글 확인하기",
    ))


def notify_inquiry_answer_created(db, inquiry_id, company_name, inquiry_title, inquiry_type_label, writer_name):
    emails = get_agent_emails(db)
    if not emails:
        return
    send_email_async(emails, f"[HCMS] 문의 답변: {inquiry_title}", _build_html(
        "문의에 새로운 고객 답변이 등록되었습니다",
        [("업체명", company_name), ("유형", inquiry_type_label), ("문의 제목", inquiry_title), ("작성자", writer_name)],
        open_link(f"/managed/inquiry_detail/{inquiry_id}", PACMS_BASE_URL), "답변 확인하기",
    ))


def notify_project_board_created(db, board_id, company_name, project_title, title, writer_name):
    emails = get_agent_emails(db)
    if not emails:
        return
    send_email_async(emails, f"[HCMS] 새 프로젝트 게시글: {title}", _build_html(
        "새로운 프로젝트구축진행 게시글이 등록되었습니다",
        [("업체명", company_name), ("프로젝트", project_title), ("제목", title), ("작성자", writer_name)],
        open_link(f"/managed/project-board/{board_id}/", PACMS_BASE_URL), "게시글 확인하기",
    ))


def notify_project_board_reply_created(db, parent_board_id, company_name, project_title, title, writer_name):
    emails = get_agent_emails(db)
    if not emails:
        return
    send_email_async(emails, f"[HCMS] 프로젝트 게시글 답글: {title}", _build_html(
        "프로젝트구축진행 게시글에 새로운 답글이 등록되었습니다",
        [("업체명", company_name), ("프로젝트", project_title), ("답글 제목", title), ("작성자", writer_name)],
        open_link(f"/managed/project-board/{parent_board_id}/", PACMS_BASE_URL), "답글 확인하기",
    ))


def notify_project_board_comment_created(db, board_id, company_name, project_title, board_title, writer_name):
    emails = get_agent_emails(db)
    if not emails:
        return
    send_email_async(emails, f"[HCMS] 프로젝트 게시글 댓글: {board_title}", _build_html(
        "프로젝트구축진행 게시글에 새로운 댓글이 등록되었습니다",
        [("업체명", company_name), ("프로젝트", project_title), ("게시글 제목", board_title), ("작성자", writer_name)],
        open_link(f"/managed/project-board/{board_id}/", PACMS_BASE_URL), "댓글 확인하기",
    ))


def notify_dev_request_created(db, dev_request_id, company_name, title, writer_name, plan_type):
    emails = get_agent_emails(db)
    if not emails:
        return
    send_email_async(emails, f"[HCMS] 새 개발 요청: {title}", _build_html(
        "새로운 개발 요청이 등록되었습니다",
        [("업체명", company_name), ("플랜", plan_type), ("제목", title), ("작성자", writer_name)],
        open_link(f"/managed/managelist_detail/{dev_request_id}", PACMS_BASE_URL), "요청 확인하기",
    ))


def notify_dev_request_comment_created(db, dev_request_id, company_name, request_title, writer_name):
    emails = get_agent_emails(db)
    if not emails:
        return
    send_email_async(emails, f"[HCMS] 개발 요청 댓글: {request_title}", _build_html(
        "개발 요청에 새로운 댓글이 등록되었습니다",
        [("업체명", company_name), ("요청 제목", request_title), ("작성자", writer_name)],
        open_link(f"/managed/managelist_detail/{dev_request_id}", PACMS_BASE_URL), "댓글 확인하기",
    ))


FREE_MAINT_ALERT_TITLES = {
    "started": "무상 유지보수 기간 시작",
    "d30": "무상 유지보수 종료 D-30 (연장/플랜 영업 대상)",
    "d7": "무상 유지보수 종료 D-7 (연장/플랜 영업 대상)",
    "ended": "무상 유지보수 기간 종료",
}


def notify_free_maint_alert(db, kind, project_id, company_name, project_title, start_date, end_date, days_left=None):
    """무상 유지보수 시작/종료 임박/종료 알림 (담당자). cron 작업에서 호출하므로 동기 발송."""
    emails = get_agent_emails(db)
    if not emails:
        return
    title = FREE_MAINT_ALERT_TITLES.get(kind, "무상 유지보수 알림")
    items = [
        ("고객사", company_name),
        ("프로젝트", project_title),
        ("무상 기간", f"{start_date} ~ {end_date}"),
    ]
    if days_left is not None:
        items.append(("남은 기간", f"D-{days_left}"))
    html = _build_html(title, items, open_link(f"/managed/project_update/{project_id}", PACMS_BASE_URL), "프로젝트 확인하기")
    _send_email(emails, f"[HCMS] {title} - {company_name} / {project_title}", html)


def notify_maint_renewal_response(db, renewal_id, company_name, project_title, due_date, response_label,
                                  plan_label, hosting_text, monthly_price, memo, writer_name):
    emails = get_agent_emails(db)
    if not emails:
        return
    items = [("업체명", company_name), ("프로젝트", project_title), ("기준일", due_date), ("응답", response_label)]
    if plan_label:
        items += [("요금제", plan_label), ("호스팅", hosting_text), ("월 청구액", f"{monthly_price:,}원")]
    items += [("메모", html.escape(memo) if memo else "-"), ("응답자", writer_name)]
    send_email_async(emails, f"[HCMS] 유지보수 전환 응답({response_label}): {company_name} / {project_title}", _build_html(
        "고객이 유지보수 계속 이용 안내에 응답했습니다",
        items,
        open_link(f"/managed/maint-renewal/{renewal_id}/", PACMS_BASE_URL), "전환 건 확인하기",
    ))


def notify_customer_maintenance_reply(to_email, customer_name, maintenance_id, title, status_display,
                                      writer_name, points):
    """직원 처리 댓글 → 요청 고객에게 메일 (cms add_managelist_comment 와 같은 시점). 링크는 hcms 고객 화면."""
    if not to_email:
        return
    esc = html.escape
    items = [("요청", esc(title or "")), ("상태", status_display), ("처리자", esc(writer_name or ""))]
    if points:
        items.append(("책정 포인트", f"{points}P"))
    send_email_async([to_email], f"[유지보수 {status_display}] {title}", _build_html(
        f"{esc(customer_name or '고객')}님, 유지보수 요청에 처리 내역이 등록되었습니다",
        items,
        open_link(f"/maintenance/{maintenance_id}"), "처리 내역 확인하기",
    ))


def notify_customer_inquiry_answer(to_emails, company_name, inquiry_id, inquiry_title, writer_name):
    """직원 문의 답변 → 회사 고객 담당자 전원에게 메일(cms render_inquiry_answer 와 같은 대상). 링크는 hcms."""
    if not to_emails:
        return
    esc = html.escape
    send_email_async(list(to_emails), f"[HCMS] 문의사항 답변 등록 - {inquiry_title}", _build_html(
        "등록하신 문의사항에 답변이 등록되었습니다",
        [("문의 제목", esc(inquiry_title or "")), ("회사", esc(company_name or "")), ("답변자", esc(writer_name or ""))],
        open_link(f"/inquiries/{inquiry_id}"), "답변 확인하기",
    ))


def send_customer_invite(to_email, customer_name, company_name, login_id, token):
    """고객 계정 초대 메일 — 비밀번호는 담지 않고 설정 링크(72시간, 1회용)만 보낸다."""
    if not to_email:
        return
    esc = html.escape
    send_email_async([to_email], "[HCMS] 고객 포털 계정 안내", _build_html(
        f"{esc(customer_name or '고객')}님, 한결랩 고객 포털 계정이 준비되었습니다",
        [("회사", esc(company_name or "")), ("아이디", esc(login_id or "")), ("링크 유효기간", "72시간(1회용)")],
        f"{settings.PUBLIC_BASE_URL}/invite#token={token}", "비밀번호 설정하기",
    ))


def send_estimate_to_customer_mail(to_email, estimate_id, title, number, total, tax, validity, token,
                                   manager_name, manager_email):
    """견적서 고객 발송 — PDF·승인·수정요청·거절 4개 링크(hcms /estimate-auth, 토큰 24시간)."""
    esc = html.escape
    base = f"{settings.PUBLIC_BASE_URL}/estimate-auth?token={token}&estimate_id={estimate_id}"
    buttons = "".join(
        f'<a href="{base}&action={action}" style="display:inline-block;margin:4px;padding:10px 18px;'
        f'background:{color};color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">{label}</a>'
        for action, label, color in (("pdf", "견적서 보기(PDF)", "#4f46e5"), ("approve", "승인", "#16a34a"),
                                     ("revision", "수정 요청", "#d97706"), ("reject", "거절", "#dc2626"))
    )
    body = _build_html(
        "한결랩 견적서를 보내드립니다",
        [("견적명", esc(title or "")), ("견적번호", esc(number or "")), ("총액(VAT 포함)", f"{total:,}원"),
         ("부가세", f"{tax:,}원"), ("유효기간", validity or "-"),
         ("담당자", esc(f"{manager_name or ''} {manager_email or ''}".strip() or "-"))],
        f"{base}&action=pdf", "견적서 확인하기",
    ).replace("</table>", f"</table><div style='text-align:center;padding:12px'>{buttons}</div>"
              "<p style='text-align:center;color:#999;font-size:12px'>링크는 24시간 동안 유효합니다.</p>", 1)
    send_email_async([to_email], f"[견적서] {title} - {number}", body)


def notify_manager_estimate_action(to_email, estimate_id, title, number, action, actor, reason=""):
    """고객 승인·거절·수정요청 → 견적 담당 직원에게 메일(cms 는 승인만 보냈다)."""
    if not to_email:
        return
    esc = html.escape
    label = {"approved": "승인", "rejected": "거절", "revision": "수정요청"}.get(action, action)
    items = [("견적명", esc(title or "")), ("견적번호", esc(number or "")), ("처리", label), ("고객", esc(actor or ""))]
    if reason:
        items.append(("내용", esc(reason)[:1000]))
    send_email_async([to_email], f"[견적서 {label}] {title} - {number}", _build_html(
        f"고객이 견적서를 {label}했습니다", items,
        open_link(f"/managed/estimate/{estimate_id}/", settings.STAFF_BASE_URL), "견적서 확인하기",
    ))


def send_contract_mail(to_email, title, number, token):
    """계약서 고객 발송 — hcms 공개 서명 페이지 링크(토큰은 # 뒤에 실어 서버 로그·Referer 에 남지 않게, 24시간)."""
    esc = html.escape
    send_email_async([to_email], f"[계약서] {title} - {number}", _build_html(
        "한결랩 계약서를 보내드립니다",
        [("계약명", esc(title or "")), ("계약번호", esc(number or "")), ("링크 유효기간", "24시간")],
        f"{settings.PUBLIC_BASE_URL}/contract-sign#token={token}", "계약서 확인 및 서명",
    ))


def notify_manager_contract_signed(to_email, contract_id, title, number, signer):
    """고객 서명 완료 → 담당 직원 메일(cms 는 알림이 없었다)."""
    if not to_email:
        return
    esc = html.escape
    send_email_async([to_email], f"[계약서 서명] {title} - {number}", _build_html(
        "고객이 계약서에 서명했습니다 — 을 서명을 진행해 주세요",
        [("계약명", esc(title or "")), ("계약번호", esc(number or "")), ("서명자", esc(signer or ""))],
        open_link(f"/managed/contract/{contract_id}/", settings.STAFF_BASE_URL), "계약서 확인하기",
    ))


def notify_staff_contract_event(to_emails, contract_id, title, number, label, actor, detail=""):
    """을 서명·계약 철회 → 계약·견적 담당 직원 메일(처리한 본인은 받는 쪽에서 뺀다)."""
    to_emails = [e for e in to_emails if e]
    if not to_emails:
        return
    esc = html.escape
    items = [("계약명", esc(title or "")), ("계약번호", esc(number or "")), ("처리", label), ("처리자", esc(actor or ""))]
    if detail:
        items.append(("내용", esc(detail)[:1000]))
    send_email_async(to_emails, f"[계약서 {label}] {title} - {number}", _build_html(
        f"계약서가 {label} 처리되었습니다", items,
        open_link(f"/managed/contract/{contract_id}/", settings.STAFF_BASE_URL), "계약서 확인하기",
    ))
