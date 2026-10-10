"""최신소식 (/api/managed/news) — 직원 CRUD. 대상 회사 미선택 = 전체 공개.
게시 상태로 바뀌는 시점(등록 또는 미게시→게시)에 대상 회사 고객에게 푸시."""
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Request, UploadFile
from sqlalchemy.orm import Session, joinedload

from app.api.endpoints.managed.common import page_response, require_write, write_enabled
from app.core.deps import get_current_staff
from app.db.session import SessionLocal, get_db
from app.models.company import Company
from app.models.customer import CustomAuthUser, News
from app.services import staff_auth
from app.services.push import send_push_to_company
from app.utils.html_sanitize import html_to_text, sanitize_html
from app.utils.media import file_download_response, save_upload

router = APIRouter(prefix="/news", tags=["managed-news"])
WRITE = require_write("news")
CATEGORIES = {"general": "일반", "maintenance": "유지보수", "notice": "공지", "update": "업데이트"}


def _serialize(n: News, full: bool = False) -> dict:
    data = {
        "seq": n.seq,
        "title": n.title,
        "category": n.category,
        "category_label": CATEGORIES.get(n.category or "", n.category),
        "is_published": bool(n.is_published),
        "views": n.views or 0,
        "company_ids": [c.seq for c in n.companies],
        "company_names": [c.name for c in n.companies],
        "has_attachment": bool(n.attachment),
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }
    if full:
        data["content"] = sanitize_html(n.content)
    else:
        data["summary"] = html_to_text(n.content, 100)
    return data


@router.get("")
def list_news(page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    query = db.query(News).options(joinedload(News.companies))
    total = query.count()
    rows = query.order_by(News.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    return page_response([_serialize(n) for n in rows], total, page, per_page) | {"write_enabled": write_enabled("news")}


@router.get("/{seq}")
def get_news(seq: int, db: Session = Depends(get_db)):
    n = db.query(News).options(joinedload(News.companies)).filter(News.seq == seq).first()
    if n is None:
        raise HTTPException(status_code=404, detail="소식을 찾을 수 없습니다.")
    return _serialize(n, full=True) | {"write_enabled": write_enabled("news")}


@router.get("/{seq}/file")
def download_news_file(seq: int, db: Session = Depends(get_db)):
    n = db.query(News).filter(News.seq == seq).first()
    if n is None or not n.attachment:
        raise HTTPException(status_code=404, detail="첨부를 찾을 수 없습니다.")
    return file_download_response(n.attachment)


def _push_published(news_id: int) -> None:
    db = SessionLocal()
    try:
        n = db.query(News).options(joinedload(News.companies)).filter(News.seq == news_id).first()
        if n is None or not n.is_published:
            return
        company_ids = [c.seq for c in n.companies] or [c for (c,) in db.query(Company.seq)]
        for cid in company_ids:
            send_push_to_company(db, cid, "새소식 등록", n.title or "",
                                 {"type": "news_register", "target_id": str(n.seq), "route": f"/news/{n.seq}"})
    finally:
        db.close()


def _apply(db: Session, n: News, title: str, content: str, category: str, is_published: bool, company_ids: str | None):
    if not title.strip():
        raise HTTPException(status_code=400, detail="제목을 입력하세요.")
    if category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="분류 값이 올바르지 않습니다.")
    ids = [int(x) for x in (company_ids or "").split(",") if x.strip()]
    n.title = title.strip()[:200]
    n.content = sanitize_html(content)
    n.category = category
    n.is_published = is_published
    n.companies = db.query(Company).filter(Company.seq.in_(ids)).all() if ids else []
    n.updated_at = datetime.now()


@router.post("", dependencies=[WRITE])
def create_news(
    request: Request,
    background: BackgroundTasks,
    title: str = Form(...),
    content: str = Form(""),
    category: str = Form("general"),
    is_published: bool = Form(True),
    company_ids: str | None = Form(None, description="쉼표 구분, 비우면 전체 공개"),
    attachment: UploadFile | None = File(None),
    staff: CustomAuthUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
):
    n = News(views=0, writer_id=staff.id, created_at=datetime.now())
    _apply(db, n, title, content, category, is_published, company_ids)
    if attachment and attachment.filename:
        n.attachment = save_upload(attachment, "news_attachments")[0]
    db.add(n)
    db.flush()
    staff_auth.audit(db, request, "news_create", user_id=staff.id, target=f"news:{n.seq}")
    db.commit()
    if n.is_published:
        background.add_task(_push_published, n.seq)
    return {"seq": n.seq}


@router.post("/{seq}", dependencies=[WRITE])
def update_news(
    seq: int,
    request: Request,
    background: BackgroundTasks,
    title: str = Form(...),
    content: str = Form(""),
    category: str = Form("general"),
    is_published: bool = Form(True),
    company_ids: str | None = Form(None),
    attachment: UploadFile | None = File(None),
    remove_attachment: bool = Form(False),
    staff: CustomAuthUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
):
    n = db.query(News).filter(News.seq == seq).first()
    if n is None:
        raise HTTPException(status_code=404, detail="소식을 찾을 수 없습니다.")
    was_published = bool(n.is_published)
    _apply(db, n, title, content, category, is_published, company_ids)
    if attachment and attachment.filename:
        n.attachment = save_upload(attachment, "news_attachments")[0]
    elif remove_attachment:
        n.attachment = None
    staff_auth.audit(db, request, "news_update", user_id=staff.id, target=f"news:{seq}")
    db.commit()
    if n.is_published and not was_published:
        background.add_task(_push_published, n.seq)
    return {"seq": n.seq}


@router.post("/{seq}/delete", dependencies=[WRITE])
def delete_news(seq: int, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    n = db.query(News).filter(News.seq == seq).first()
    if n is None:
        raise HTTPException(status_code=404, detail="소식을 찾을 수 없습니다.")
    n.companies = []
    db.flush()
    staff_auth.audit(db, request, "news_delete", user_id=staff.id, target=f"news:{seq}", detail=(n.title or "")[:200])
    db.delete(n)
    db.commit()
    return {"ok": True}
