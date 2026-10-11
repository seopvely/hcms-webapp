"""연동 설정(/api/managed/settings/webhooks) — Django admin 의 WebhookConfig 대체(SPEC 08 §2.4).

cms 가 이벤트(문의 답변·유지보수 답변·소식 등)를 외부로 보낼 때 쓰는 설정이다(현재 hcms 푸시 1건).
API 키는 화면에 내보내지 않고(끝 4자리만), 바꿀 때만 새 값을 받는다. 관리자 + 2단계 인증 세션만.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import require_staff_admin, require_staff_mfa
from app.db.session import get_db
from app.models.customer import CustomAuthUser
from app.models.reference import WebhookConfig, WebhookEventLog
from app.services import staff_auth

router = APIRouter(prefix="/settings", tags=["managed-settings"],
                   dependencies=[Depends(require_staff_admin), Depends(require_staff_mfa)])
EVENT_TYPES = {"all": "전체", "inquiry_answer": "문의사항 답변", "managelist_comment": "유지보수 답변",
               "inditask_comment": "건별업무 답변", "news_register": "최신소식 등록", "project_board_post": "프로젝트구축진행",
               "maint_renewal_notice": "유지보수 전환 안내"}


def _mask(key: str | None) -> str | None:
    return f"…{key[-4:]}" if key else None


def _serialize(w: WebhookConfig, last: WebhookEventLog | None) -> dict:
    return {"seq": w.seq, "name": w.name, "target_url": w.target_url, "api_key_hint": _mask(w.api_key),
            "event_type": w.event_type, "event_type_label": EVENT_TYPES.get(w.event_type, w.event_type),
            "is_active": bool(w.is_active), "timeout": w.timeout,
            "last_event": {"status": last.status, "status_code": last.status_code, "created_at": last.created_at.isoformat()} if last else None,
            "updated_at": w.updated_at.isoformat() if w.updated_at else None}


@router.get("/webhooks")
def list_webhooks(db: Session = Depends(get_db)):
    rows = db.query(WebhookConfig).order_by(WebhookConfig.seq).all()
    out = []
    for w in rows:
        last = db.query(WebhookEventLog).filter(WebhookEventLog.webhook_id == w.seq).order_by(WebhookEventLog.seq.desc()).first()
        out.append(_serialize(w, last))
    return {"items": out, "event_types": EVENT_TYPES}


@router.get("/webhooks/{seq}/logs")
def webhook_logs(seq: int, db: Session = Depends(get_db)):
    rows = (db.query(WebhookEventLog).filter(WebhookEventLog.webhook_id == seq)
            .order_by(WebhookEventLog.seq.desc()).limit(50).all())
    return {"items": [{"seq": r.seq, "event_type": r.event_type, "status": r.status, "status_code": r.status_code,
                       "error_message": (r.error_message or "")[:300], "created_at": r.created_at.isoformat()} for r in rows]}


class WebhookBody(BaseModel):
    name: str | None = None
    target_url: str | None = None
    api_key: str | None = None  # 보낼 때만 교체, "" 이면 지움
    event_type: str | None = None
    is_active: bool | None = None
    timeout: int | None = None


def _apply(w: WebhookConfig, data: dict) -> None:
    if "name" in data and not (data["name"] or "").strip():
        raise HTTPException(status_code=400, detail="웹훅명을 입력하세요.")
    if "target_url" in data and not (data["target_url"] or "").startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="대상 URL 은 http(s) 주소여야 합니다.")
    if "event_type" in data and data["event_type"] not in EVENT_TYPES:
        raise HTTPException(status_code=400, detail="알 수 없는 이벤트 유형입니다.")
    if "timeout" in data and not 1 <= (data["timeout"] or 0) <= 60:
        raise HTTPException(status_code=400, detail="타임아웃은 1~60초입니다.")
    for k, v in data.items():
        if k == "api_key":
            v = (v or "").strip() or None
        setattr(w, k, v.strip() if isinstance(v, str) else v)
    w.updated_at = datetime.now()


@router.post("/webhooks")
def create_webhook(body: WebhookBody, request: Request, staff: CustomAuthUser = Depends(require_staff_admin),
                   db: Session = Depends(get_db)):
    now = datetime.now()
    w = WebhookConfig(event_type="all", is_active=True, timeout=10, created_at=now, updated_at=now)
    data = body.model_dump(exclude_unset=True)
    if not data.get("name") or not data.get("target_url"):
        raise HTTPException(status_code=400, detail="웹훅명과 대상 URL 을 입력하세요.")
    _apply(w, data)
    db.add(w)
    db.flush()
    staff_auth.audit(db, request, "webhook_create", user_id=staff.id, target=f"webhook:{w.seq}")
    db.commit()
    return {"seq": w.seq}


@router.patch("/webhooks/{seq}")
def update_webhook(seq: int, body: WebhookBody, request: Request, staff: CustomAuthUser = Depends(require_staff_admin),
                   db: Session = Depends(get_db)):
    w = db.query(WebhookConfig).filter(WebhookConfig.seq == seq).first()
    if w is None:
        raise HTTPException(status_code=404, detail="웹훅을 찾을 수 없습니다.")
    data = body.model_dump(exclude_unset=True)
    _apply(w, data)
    # 키 값은 감사 로그에도 남기지 않는다(바뀐 항목 이름만)
    staff_auth.audit(db, request, "webhook_update", user_id=staff.id, target=f"webhook:{seq}", detail=",".join(sorted(data)))
    db.commit()
    return {"ok": True}
