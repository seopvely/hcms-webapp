import hmac
import logging
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.manager import Manager
from app.models.push_token import PushToken
from app.services.push import send_push_notification

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhook", tags=["webhook"])


class WebhookData(BaseModel):
    type: str
    company_id: int | None = None
    company_name: str | None = None
    title: str | None = None
    content: str | None = None
    writer: str | None = None
    comment_id: int | None = None
    managelist_id: int | None = None
    project_id: int | None = None
    project_name: str | None = None
    comment_status: str | None = None
    point: int | None = None
    inditask_id: int | None = None
    task_status: str | None = None
    answer_id: int | None = None
    inquiry_id: int | None = None
    status: str | None = None
    created_at: str | None = None
    news_id: int | None = None
    category: str | None = None
    category_display: str | None = None
    is_published: bool | None = None
    companies: list[dict] | None = None
    board_id: int | None = None
    parent_id: int | None = None
    action: str | None = None


class WebhookPayload(BaseModel):
    event_type: str
    source: str = "pacms"
    timestamp: str | None = None
    data: WebhookData


EVENT_PUSH_CONFIG = {
    "managelist_comment": {
        "title": "유지보수 답변 등록",
        "body_template": "{title} 건에 새 답변이 등록되었습니다.",
        "route_prefix": "/maintenance/",
        "id_field": "managelist_id",
    },
    "dev_request_comment": {
        "title": "개발 요청 답변 등록",
        "body_template": "개발 요청에 답변이 등록되었습니다.",
        "route_prefix": "/dev-requests/",
        "id_field": "managelist_id",
    },
    "inditask_comment": {
        "title": "건별업무 답변 등록",
        "body_template": "{title} 건에 새 답변이 등록되었습니다.",
        "route_prefix": "/tasks/",
        "id_field": "inditask_id",
    },
    "inquiry_answer": {
        "title": "문의사항 답변 등록",
        "body_template": "{title} 건에 새 답변이 등록되었습니다.",
        "route_prefix": "/inquiries/",
        "id_field": "inquiry_id",
    },
    "news_register": {
        "title": "새소식 등록",
        "body_template": "{title}",
        "route_prefix": "/news/",
        "id_field": "news_id",
    },
    "project_board_post": {
        "title": "프로젝트구축진행",
        "body_template": "{title}",
        "route_prefix": "/project-board/",
        "id_field": "board_id",
    },
}


def _verify_api_key(x_api_key: str = Header(...)):
    if not hmac.compare_digest(x_api_key, settings.WEBHOOK_API_KEY):
        raise HTTPException(status_code=403, detail="Invalid API key")
    return x_api_key


@router.post("/pacms")
def receive_pacms_webhook(
    payload: WebhookPayload,
    db: Session = Depends(get_db),
    _api_key: str = Depends(_verify_api_key),
) -> dict[str, Any]:
    event_type = payload.event_type
    data = payload.data

    logger.info(f"Webhook received: event_type={event_type}, company_id={data.company_id}")

    config = EVENT_PUSH_CONFIG.get(event_type)
    if not config:
        logger.warning(f"Unsupported event type: {event_type}")
        return {"status": "ignored", "reason": f"Unsupported event type: {event_type}"}

    if event_type == "news_register":
        companies_list = data.companies or []
        if not companies_list:
            return {"status": "ignored", "reason": "No companies in data"}
        company_ids = [c.get("company_id") for c in companies_list if c.get("company_id")]
        if not company_ids:
            return {"status": "ignored", "reason": "No valid company_ids"}
        managers = db.query(Manager).filter(Manager.company_id.in_(company_ids), Manager.login_permit_tf == "1").all()
    else:
        if not data.company_id:
            return {"status": "ignored", "reason": "No company_id in data"}
        managers = db.query(Manager).filter(Manager.company_id == data.company_id, Manager.login_permit_tf == "1").all()

    if not managers:
        return {"status": "ok", "push_sent": 0, "reason": "No active managers"}

    manager_seqs = [m.seq for m in managers]
    push_tokens = db.query(PushToken).filter(PushToken.manager_seq.in_(manager_seqs), PushToken.is_active == True).all()

    if not push_tokens:
        return {"status": "ok", "push_sent": 0, "reason": "No active push tokens"}

    token_strings = [pt.token for pt in push_tokens]

    title = config["title"]
    body = config["body_template"].format(title=data.title or "")

    if event_type == "project_board_post" and data.action:
        action_labels = {"post": "질문", "reply": "답글", "comment": "댓글"}
        action_label = action_labels.get(data.action, "글")
        title = f"한결랩에서 {action_label}이 등록되었습니다"
        body = f"[{data.project_name or ''}] {data.title or ''}"

    if event_type == "dev_request_comment":
        body = "개발 요청에 답변이 등록되었습니다."

    target_id = getattr(data, config["id_field"], None)
    push_data = {
        "type": event_type,
        "target_id": str(target_id) if target_id else "",
        "route": f"{config['route_prefix']}{target_id}" if target_id else "",
    }

    success_count = send_push_notification(title, body, token_strings, push_data)

    logger.info(f"Push sent for {event_type}: managers={len(managers)}, tokens={len(token_strings)}, success={success_count}")

    return {"status": "ok", "push_sent": success_count, "total_tokens": len(token_strings)}
