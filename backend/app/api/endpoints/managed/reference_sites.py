"""레퍼런스 사이트(/api/managed/reference-sites) — 홈페이지 포트폴리오 목록 관리(SPEC 03 §9).

썸네일은 cms 와 같은 MEDIA_ROOT/reference_sites/ 에 둔다(cms 공개 /media 경로와 hcms 공개 썸네일 경로 모두에서 열린다).
AI 설명 생성·참고파일 검색은 옮기지 않는다(D18 결정 전, iCloud 마운트 의존). 홈페이지 재시작 훅은 인계(hcms 용 SSH 키).
"""
import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.endpoints.managed.common import require_write, write_enabled
from app.core.config import settings
from app.core.deps import get_current_staff
from app.db.session import get_db
from app.models.customer import CustomAuthUser
from app.models.reference import ReferenceSite, ReferenceSiteCategory
from app.services import staff_auth
from app.utils.media import MEDIA_ROOT, delete_media

router = APIRouter(prefix="/reference-sites", tags=["managed-reference-sites"])
WRITE = require_write("reference_sites")
THUMB_EXTS = {"jpg", "jpeg", "png", "gif", "webp"}
MAX_THUMB_BYTES = 10 * 1024 * 1024


def thumbnail_url(site: ReferenceSite) -> str | None:
    """공개 썸네일 주소(나머지 /media 를 닫아도 열리는 전용 경로)."""
    return f"{settings.PUBLIC_BASE_URL}/api/public/reference-sites/{site.seq}/thumbnail" if site.thumbnail else None


def _serialize(s: ReferenceSite, categories: dict) -> dict:
    return {
        "seq": s.seq, "site_name": s.site_name, "url": s.url, "description": s.description, "tech_stack": s.tech_stack,
        "category_id": s.category_id, "category": categories.get(s.category_id), "production_year": s.production_year,
        "display_order": s.display_order, "is_active": bool(s.is_active), "thumbnail_url": thumbnail_url(s),
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }


@router.get("")
def list_sites(db: Session = Depends(get_db)):
    categories = {c.seq: c.name for c in db.query(ReferenceSiteCategory).order_by(ReferenceSiteCategory.name)}
    rows = db.query(ReferenceSite).order_by(ReferenceSite.display_order, ReferenceSite.created_at.desc()).all()
    return {"items": [_serialize(s, categories) for s in rows],
            "categories": [{"id": k, "name": v} for k, v in categories.items()],
            "write_enabled": write_enabled("reference_sites")}


def _category_id(db: Session, name: str | None) -> int | None:
    """카테고리는 이름으로 받아 없으면 만든다(cms get_or_create)."""
    name = (name or "").strip()[:50]
    if not name:
        return None
    c = db.query(ReferenceSiteCategory).filter(ReferenceSiteCategory.name == name).first()
    if c is None:
        c = ReferenceSiteCategory(name=name)
        db.add(c)
        db.flush()
    return c.seq


def _save_thumbnail(upload: UploadFile) -> str:
    ext = os.path.splitext(upload.filename or "")[1].lower().lstrip(".")
    if ext not in THUMB_EXTS:
        raise HTTPException(status_code=400, detail="썸네일은 jpg·png·gif·webp 만 올릴 수 있습니다.")
    data = upload.file.read(MAX_THUMB_BYTES + 1)
    if len(data) > MAX_THUMB_BYTES:
        raise HTTPException(status_code=400, detail="썸네일이 너무 큽니다(최대 10MB).")
    rel = f"reference_sites/{uuid.uuid4().hex[:16]}.{ext}"  # cms ImageField upload_to 와 같은 디렉터리(varchar(100))
    os.makedirs(os.path.join(MEDIA_ROOT, "reference_sites"), exist_ok=True)
    with open(os.path.join(MEDIA_ROOT, rel), "wb") as f:
        f.write(data)
    return rel


def _apply(db: Session, s: ReferenceSite, site_name: str, url: str, description: str, tech_stack: str,
           category: str | None, production_year: str | None, is_active: bool) -> None:
    if not site_name.strip() or not url.strip().startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="사이트명과 http(s) 주소를 입력하세요.")
    s.site_name = site_name.strip()[:100]
    s.url = url.strip()[:500]
    s.description = description or ""
    s.tech_stack = ",".join(t.strip() for t in (tech_stack or "").split(",") if t.strip())[:255]
    s.category_id = _category_id(db, category)
    year = (production_year or "").strip()
    s.production_year = int(year) if year.isdigit() else None
    s.is_active = is_active
    s.updated_at = datetime.now()


@router.post("", dependencies=[WRITE])
def create_site(request: Request, site_name: str = Form(...), url: str = Form(...), description: str = Form(""),
                tech_stack: str = Form(""), category: str | None = Form(None), production_year: str | None = Form(None),
                is_active: bool = Form(True), thumbnail: UploadFile | None = File(None),
                staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    last = db.query(ReferenceSite.display_order).order_by(ReferenceSite.display_order.desc()).first()
    s = ReferenceSite(display_order=(last[0] + 1) if last else 0, created_at=datetime.now())
    _apply(db, s, site_name, url, description, tech_stack, category, production_year, is_active)
    if thumbnail and thumbnail.filename:
        s.thumbnail = _save_thumbnail(thumbnail)
    db.add(s)
    db.flush()
    staff_auth.audit(db, request, "reference_site_create", user_id=staff.id, target=f"reference_site:{s.seq}")
    db.commit()
    return {"seq": s.seq}


@router.post("/{seq}", dependencies=[WRITE])
def update_site(seq: int, request: Request, site_name: str = Form(...), url: str = Form(...), description: str = Form(""),
                tech_stack: str = Form(""), category: str | None = Form(None), production_year: str | None = Form(None),
                is_active: bool = Form(True), thumbnail: UploadFile | None = File(None), remove_thumbnail: bool = Form(False),
                staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    s = db.query(ReferenceSite).filter(ReferenceSite.seq == seq).first()
    if s is None:
        raise HTTPException(status_code=404, detail="레퍼런스를 찾을 수 없습니다.")
    _apply(db, s, site_name, url, description, tech_stack, category, production_year, is_active)
    old = s.thumbnail
    if thumbnail and thumbnail.filename:
        s.thumbnail = _save_thumbnail(thumbnail)
    elif remove_thumbnail:
        s.thumbnail = None
    staff_auth.audit(db, request, "reference_site_update", user_id=staff.id, target=f"reference_site:{seq}")
    db.commit()
    if old and old != s.thumbnail:
        delete_media(old)
    return {"ok": True}


class ReorderBody(BaseModel):
    ids: list[int]


@router.post("/reorder/save", dependencies=[WRITE])
def reorder(body: ReorderBody, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """화면 순서대로 display_order 0,1,2… 를 다시 매긴다."""
    rows = {s.seq: s for s in db.query(ReferenceSite).filter(ReferenceSite.seq.in_(body.ids or [0]))}
    for i, sid in enumerate(body.ids):
        if sid in rows:
            rows[sid].display_order = i
    staff_auth.audit(db, request, "reference_site_reorder", user_id=staff.id, detail=",".join(map(str, body.ids))[:500])
    db.commit()
    return {"ok": True}


@router.post("/{seq}/delete", dependencies=[WRITE])
def delete_site(seq: int, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    s = db.query(ReferenceSite).filter(ReferenceSite.seq == seq).first()
    if s is None:
        raise HTTPException(status_code=404, detail="레퍼런스를 찾을 수 없습니다.")
    thumb = s.thumbnail
    db.delete(s)
    staff_auth.audit(db, request, "reference_site_delete", user_id=staff.id, target=f"reference_site:{seq}", detail=s.site_name)
    db.commit()
    delete_media(thumb)
    return {"ok": True}
