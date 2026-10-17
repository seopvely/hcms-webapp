"""AI 프롬프트 템플릿 (/api/managed/ai-prompts) — 견적·계약 AI 모달이 쓰는 템플릿 관리(SPEC 06 §9).

AI 실행은 managed/ai.py(서버 claude CLI, D18 = 로컬 CLI)가 이 템플릿을 읽어 쓴다 — 여기서는 템플릿·평점만 관리한다.
temperature·session_id 는 cms 처럼 저장만 한다(CLI 는 temperature 를 받지 않는다).
"""
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.endpoints.managed.common import require_write, write_enabled
from app.core.deps import get_current_staff
from app.db.session import get_db
from app.models.customer import CustomAuthUser
from app.models.worktools import AIPromptRating, AIPromptTemplate
from app.services.claude_cli import normalize_model

router = APIRouter(prefix="/ai-prompts", tags=["managed-ai-prompts"])
WRITE = require_write("ai_prompts")
MODELS = ["claude-haiku-4-5", "claude-sonnet-5"]  # cms 화면 선택지 + DB 에 있는 값


def _row(p: AIPromptTemplate) -> dict:
    return {"seq": p.seq, "name": p.name, "prompt_content": p.prompt_content, "claude_model": p.claude_model, "temperature": float(p.temperature),
            "session_id": p.session_id or "", "average_rating": float(p.average_rating), "rating_count": p.rating_count, "usage_count": p.usage_count,
            "is_default": bool(p.is_default), "is_active": bool(p.is_active), "updated_at": p.updated_at.isoformat() if p.updated_at else None}


@router.get("")
def list_prompts(include_inactive: bool = False, db: Session = Depends(get_db)):
    q = db.query(AIPromptTemplate)
    if not include_inactive:
        q = q.filter(AIPromptTemplate.is_active == True)  # noqa: E712
    return {"items": [_row(p) for p in q.order_by(AIPromptTemplate.average_rating.desc(), AIPromptTemplate.usage_count.desc())],
            "models": sorted(set(MODELS) | {m for (m,) in db.query(AIPromptTemplate.claude_model).distinct()}), "write_enabled": write_enabled("ai_prompts")}


@router.get("/{seq}/ratings")
def ratings(seq: int, db: Session = Depends(get_db)):
    users = {u.id: (u.name or u.username) for u in db.query(CustomAuthUser)}
    return [{"seq": r.seq, "rating": r.rating, "feedback": r.feedback, "rated_by": users.get(r.rated_by_id, ""), "created_at": r.created_at.isoformat()}
            for r in db.query(AIPromptRating).filter(AIPromptRating.prompt_id == seq).order_by(AIPromptRating.created_at.desc()).limit(50)]


class PromptBody(BaseModel):
    seq: int | None = None
    name: str
    prompt_content: str
    claude_model: str = "claude-haiku-4-5"
    temperature: float = 0.7
    session_id: str = ""
    is_default: bool = False
    is_active: bool = True


class DraftSaveBody(BaseModel):
    kind: str  # "estimate" | "contract"
    prompt_content: str = Field(min_length=1, max_length=40000)
    seq: int | None = None  # 있으면 그 템플릿의 내용만 덮어쓴다
    name: str = Field("", max_length=100)
    model: str | None = None  # 새로 만들 때 모델(sonnet/haiku/opus)


FULL_MODEL = {"haiku": "claude-haiku-4-5", "sonnet": "claude-sonnet-5", "opus": "claude-opus-5-5"}


@router.post("/from-draft", dependencies=[WRITE])
def save_from_draft(body: DraftSaveBody, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """견적·계약 AI 대화상자에서 고친 템플릿 원문 저장. 덮어쓰기는 내용만 바꾸고(이름·기본·활성 유지), 새로 만들면 이름이 필요하다.

    AI 화면은 이름으로 종류를 나눈다(ai.py options·_template): 계약 템플릿은 이름에 '계약' 이 있어야 하고(없으면 앞에 붙임),
    견적 템플릿 이름에는 '계약'·'설명' 이 없어야 한다.
    """
    if body.kind not in ("estimate", "contract"):
        raise HTTPException(400, "kind 는 estimate 또는 contract 입니다.")
    content = body.prompt_content.strip()
    now = datetime.now()
    if body.seq:
        p = db.query(AIPromptTemplate).filter(AIPromptTemplate.seq == body.seq, AIPromptTemplate.is_active == True).first()  # noqa: E712
        if not p:
            raise HTTPException(404, "프롬프트를 찾을 수 없습니다.")
        p.prompt_content, p.updated_at = content, now
    else:
        name = body.name.strip()
        if not name:
            raise HTTPException(400, "새 템플릿 이름을 입력해주세요.")
        if body.kind == "contract" and "계약" not in name:
            name = f"[계약] {name}"
        if body.kind == "estimate" and ("계약" in name or "설명" in name):
            raise HTTPException(400, "견적 템플릿 이름에는 '계약'·'설명' 을 넣을 수 없습니다(계약서 템플릿으로 분류됩니다).")
        if db.query(AIPromptTemplate.seq).filter(AIPromptTemplate.name == name, AIPromptTemplate.is_active == True).first():  # noqa: E712
            raise HTTPException(409, "같은 이름의 템플릿이 있습니다.")
        p = AIPromptTemplate(name=name[:100], prompt_content=content, claude_model=FULL_MODEL.get(normalize_model(body.model), "claude-sonnet-5"),
                             temperature=Decimal("0.7"), is_active=True, is_default=False, created_by_id=staff.id, created_at=now, updated_at=now,
                             rating_count=0, average_rating=Decimal(0), usage_count=0)
        db.add(p)
    db.commit()
    return {"seq": p.seq, "name": p.name}


@router.post("", dependencies=[WRITE])
def save_prompt(body: PromptBody, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """저장 — 기본 지정 시 기존 기본을 해제(cms ai_prompt_save). 비활성화로 목록에서 숨긴다(삭제 API 는 없다)."""
    if not body.name.strip() or not body.prompt_content.strip():
        raise HTTPException(400, "이름과 내용을 입력해주세요.")
    if not 0 <= body.temperature <= 1:
        raise HTTPException(400, "Temperature는 0.0~1.0 사이여야 합니다.")
    now = datetime.now()
    if body.seq:
        p = db.query(AIPromptTemplate).filter(AIPromptTemplate.seq == body.seq).first()
        if not p:
            raise HTTPException(404, "프롬프트를 찾을 수 없습니다.")
    else:
        p = AIPromptTemplate(created_by_id=staff.id, created_at=now, rating_count=0, average_rating=Decimal(0), usage_count=0)
        db.add(p)
    p.name, p.prompt_content, p.claude_model = body.name.strip()[:255], body.prompt_content.strip(), body.claude_model[:50]
    p.temperature, p.session_id, p.is_active, p.updated_at = Decimal(str(body.temperature)), body.session_id.strip()[:255] or None, body.is_active, now
    if body.is_default:
        db.query(AIPromptTemplate).filter(AIPromptTemplate.is_default == True).update({AIPromptTemplate.is_default: False}, synchronize_session=False)  # noqa: E712
        p.is_default = True
    elif body.seq:
        p.is_default = False
    db.commit()
    return {"seq": p.seq}
