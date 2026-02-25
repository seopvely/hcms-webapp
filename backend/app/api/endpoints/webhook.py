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


# --- Pydantic schemas ---

class WebhookData(BaseModel):
    type: str
    company_id: int | None = None
    company_name: str | None = None
    title: str | None = None
    content: str | None = None
    writer: str | None = None
    # managelist_comment fields
    comment_id: int | None = None
    managelist_id: int | None = None
    project_id: int | None = None
    project_name: str | None = None
    comment_status: str | None = None
    point: int | None = None
    # inditask_comment fields
    inditask_id: int | None = None
    task_status: str | None = None
    # inquiry_answer fields
    answer_id: int | None = None
    inquiry_id: int | None = None
    status: str | None = None
    created_at: str | None = None


class WebhookPayload(BaseModel):
    event_type: str
    source: str = "pacms"
    timestamp: str | None = None
    data: WebhookData


# --- Push message configuration ---

EVENT_PUSH_CONFIG = {
    "managelist_comment": {
        "title": "유지보수 답변 등록",
        "body_template": "{title} 건에 새 답변이 등록되었습니다.",
        "route_prefix": "/maintenance/",
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
}


def _verify_api_key(x_api_key: str = Header(...)):
    """X-API-Key 헤더 검증."""
    if not hmac.compare_digest(x_api_key, settings.WEBHOOK_API_KEY):
        raise HTTPException(status_code=403, detail="Invalid API key")
    return x_api_key


@router.post("/pacms")
def receive_pacms_webhook(
    payload: WebhookPayload,
    db: Session = Depends(get_db),
    _api_key: str = Depends(_verify_api_key),
) -> dict[str, Any]:
    """
    PACMS 웹훅 수신 엔드포인트.
    관리자 답변 이벤트를 수신하여 해당 회사 고객에게 FCM 푸시 알림을 발송합니다.
    """
    event_type = payload.event_type
    data = payload.data

    logger.info(f"Webhook received: event_type={event_type}, company_id={data.company_id}")

    # 지원하는 이벤트 유형인지 확인
    config = EVENT_PUSH_CONFIG.get(event_type)
    if not config:
        logger.warning(f"Unsupported event type: {event_type}")
        return {"status": "ignored", "reason": f"Unsupported event type: {event_type}"}

    # company_id 필수
    if not data.company_id:
        logger.warning(f"No company_id in webhook data for event: {event_type}")
        return {"status": "ignored", "reason": "No company_id in data"}

    # 해당 회사의 활성 manager 조회
    managers = (
        db.query(Manager)
        .filter(
            Manager.company_id == data.company_id,
            Manager.login_permit_tf == "1",
        )
        .all()
    )

    if not managers:
        logger.info(f"No active managers found for company_id={data.company_id}")
        return {"status": "ok", "push_sent": 0, "reason": "No active managers"}

    # 해당 manager들의 모든 활성 FCM 토큰 수집
    manager_seqs = [m.seq for m in managers]
    push_tokens = (
        db.query(PushToken)
        .filter(
            PushToken.manager_seq.in_(manager_seqs),
            PushToken.is_active == True,
        )
        .all()
    )

    if not push_tokens:
        logger.info(f"No active push tokens for company_id={data.company_id}")
        return {"status": "ok", "push_sent": 0, "reason": "No active push tokens"}

    token_strings = [pt.token for pt in push_tokens]

    # 푸시 메시지 구성
    title = config["title"]
    body = config["body_template"].format(title=data.title or "")

    # 프론트엔드 네비게이션용 data 필드
    target_id = getattr(data, config["id_field"], None)
    push_data = {
        "type": event_type,
        "target_id": str(target_id) if target_id else "",
        "route": f"{config['route_prefix']}{target_id}" if target_id else "",
    }

    # FCM 발송
    success_count = send_push_notification(title, body, token_strings, push_data)

    logger.info(
        f"Push sent for {event_type}: "
        f"company_id={data.company_id}, "
        f"tokens={len(token_strings)}, "
        f"success={success_count}"
    )

    return {
        "status": "ok",
        "push_sent": success_count,
        "total_tokens": len(token_strings),
    }
