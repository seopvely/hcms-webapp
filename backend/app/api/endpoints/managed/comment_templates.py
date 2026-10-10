"""처리내역 템플릿(/api/managed/comment-templates) — 유지보수 댓글 작성 시 불러오기."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.endpoints.managed.common import require_write
from app.core.deps import get_current_staff
from app.db.session import get_db
from app.models.customer import CustomAuthUser, ManagelistCommentTemplate
from app.utils.html_sanitize import sanitize_html

router = APIRouter(prefix="/comment-templates", tags=["managed-comment-templates"])
WRITE = require_write("maintenance")


def _serialize(t: ManagelistCommentTemplate) -> dict:
    return {
        "seq": t.seq, "name": t.name, "content": sanitize_html(t.content), "worker_type": t.worker_type,
        "usage_count": t.usage_count, "is_default": bool(t.is_default), "sort_order": t.sort_order,
        "created_by_id": t.created_by_id,
    }


@router.get("")
def list_templates(db: Session = Depends(get_db)):
    rows = (
        db.query(ManagelistCommentTemplate)
        .filter(ManagelistCommentTemplate.is_active == True)  # noqa: E712
        .order_by(ManagelistCommentTemplate.sort_order, ManagelistCommentTemplate.usage_count.desc())
        .all()
    )
    return {"items": [_serialize(t) for t in rows]}


class TemplateBody(BaseModel):
    name: str
    content: str
    worker_type: str | None = None


@router.post("", dependencies=[WRITE])
def create_template(body: TemplateBody, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="템플릿 이름을 입력하세요.")
    now = datetime.now()
    t = ManagelistCommentTemplate(
        name=body.name.strip()[:100], content=sanitize_html(body.content), worker_type=body.worker_type or None,
        usage_count=0, is_active=True, is_default=False, sort_order=0, created_by_id=staff.id,
        created_at=now, updated_at=now,
    )
    db.add(t)
    db.commit()
    return _serialize(t)


def _get_owned(db: Session, seq: int, staff: CustomAuthUser) -> ManagelistCommentTemplate:
    from app.services.staff_auth import is_admin

    t = db.query(ManagelistCommentTemplate).filter(ManagelistCommentTemplate.seq == seq).first()
    if t is None or not t.is_active:
        raise HTTPException(status_code=404, detail="템플릿을 찾을 수 없습니다.")
    if t.created_by_id not in (None, staff.id) and not is_admin(staff):
        raise HTTPException(status_code=403, detail="본인 템플릿만 수정할 수 있습니다.")
    return t


@router.patch("/{seq}", dependencies=[WRITE])
def update_template(seq: int, body: TemplateBody, staff: CustomAuthUser = Depends(get_current_staff),
                    db: Session = Depends(get_db)):
    t = _get_owned(db, seq, staff)
    t.name = body.name.strip()[:100] or t.name
    t.content = sanitize_html(body.content)
    t.worker_type = body.worker_type or None
    t.updated_at = datetime.now()
    db.commit()
    return _serialize(t)


@router.post("/{seq}/delete", dependencies=[WRITE])
def delete_template(seq: int, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """비활성화(소프트 삭제)."""
    t = _get_owned(db, seq, staff)
    t.is_active = False
    t.updated_at = datetime.now()
    db.commit()
    return {"ok": True}


@router.post("/{seq}/use")
def use_template(seq: int, db: Session = Depends(get_db)):
    """사용 횟수 +1 (정렬용). 쓰기 영역과 무관한 통계라 읽기 전용 기간에도 허용."""
    db.query(ManagelistCommentTemplate).filter(ManagelistCommentTemplate.seq == seq).update(
        {ManagelistCommentTemplate.usage_count: ManagelistCommentTemplate.usage_count + 1}, synchronize_session=False)
    db.commit()
    return {"ok": True}
