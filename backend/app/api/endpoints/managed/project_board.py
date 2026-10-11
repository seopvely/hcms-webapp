"""프로젝트구축진행 게시판 — 직원 조회·쓰기 (/api/managed/project-board).

테이블·고객 화면은 기존 hcms 것을 그대로 쓰고 직원 쓰기만 추가한다.
직원 글·댓글 = writer_type '1' + writer_id(직원 id), 고객 = '2' + customer_writer_id.
권한(cms 와 같음): 삭제·상태변경 = 작성자 또는 관리자, 수정 = 작성자.
"""
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.api.endpoints.managed.common import apply_sort, page_response, require_write, write_enabled
from app.core.deps import get_current_staff
from app.db.session import SessionLocal, get_db
from app.models.customer import (
    CustomAuthUser,
    Project,
    ProjectBoard,
    ProjectBoardAttachment,
    ProjectBoardCategory,
    ProjectBoardComment,
    ProjectBoardCommentAttachment,
)
from app.services import staff_auth
from app.services.push import send_push_to_company
from app.utils.html_sanitize import html_to_text, sanitize_html
from app.utils.media import file_download_response, save_upload

router = APIRouter(prefix="/project-board", tags=["managed-project-board"])
WRITE = require_write("project_board")
STATUS_LABELS = {"1": "진행중", "2": "완료", "3": "보류"}
ACTION_LABELS = {"post": "질문", "reply": "답글", "comment": "댓글"}


def _iso(v):
    return v.isoformat() if v else None


def _writer(item) -> str:
    if item.writer_type == "1":
        return (item.admin_writer.name or item.admin_writer.username) if item.admin_writer else "직원"
    return item.customer_writer.name if item.customer_writer else "고객"


def _files(rows, kind: str) -> list:
    return [{"id": a.seq, "filename": a.filename, "url": f"/project-board/files/{kind}/{a.seq}"} for a in rows]


@router.get("")
def list_posts(
    project_id: int | None = None,
    status: str | None = None,
    sort: str | None = Query(None, description="title|status|created_at, '-' 접두 = 내림차순"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(ProjectBoard).options(
        joinedload(ProjectBoard.project), joinedload(ProjectBoard.company),
        joinedload(ProjectBoard.admin_writer), joinedload(ProjectBoard.customer_writer),
    ).filter(ProjectBoard.parent_id.is_(None))
    if project_id:
        query = query.filter(ProjectBoard.project_id == project_id)
    if status:
        query = query.filter(ProjectBoard.status == status)
    total = query.count()
    query = apply_sort(query, sort, {"title": ProjectBoard.title, "status": ProjectBoard.status, "created_at": ProjectBoard.created_at},
                       [ProjectBoard.is_notice.desc(), ProjectBoard.created_at.desc()])
    rows = query.offset((page - 1) * per_page).limit(per_page).all()
    items = [{
        "seq": b.seq,
        "title": b.title,
        "company_name": b.company.name if b.company else None,
        "project_id": b.project_id,
        "project_title": b.project.title if b.project else None,
        "writer_name": _writer(b),
        "is_staff": b.writer_type == "1",
        "status": b.status,
        "status_label": STATUS_LABELS.get(b.status or "", "-"),
        "is_notice": bool(b.is_notice),
        "reply_count": len(b.replies),
        "comment_count": len(b.comments),
        "created_at": _iso(b.created_at),
    } for b in rows]
    return page_response(items, total, page, per_page) | {"write_enabled": write_enabled("project_board")}


@router.get("/projects")
def board_projects(db: Session = Depends(get_db)):
    """게시글이 있거나 카테고리가 있는 프로젝트(필터·등록 선택용)."""
    ids = {p for (p,) in db.query(ProjectBoard.project_id).distinct()} | {p for (p,) in db.query(ProjectBoardCategory.project_id).distinct()}
    rows = db.query(Project).options(joinedload(Project.company)).filter(Project.seq.in_(ids)).all() if ids else []
    return {"items": [{"id": p.seq, "name": f"{p.company.name if p.company else ''} · {p.title}"} for p in rows]}


@router.get("/categories/{project_id}")
def categories(project_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(ProjectBoardCategory)
        .filter(ProjectBoardCategory.project_id == project_id, ProjectBoardCategory.is_active == True)  # noqa: E712
        .order_by(ProjectBoardCategory.sort_order)
        .all()
    )
    return {"items": [{"id": c.seq, "name": c.name} for c in rows]}


def _post_detail(b: ProjectBoard) -> dict:
    def comment(c: ProjectBoardComment) -> dict:
        return {
            "seq": c.seq, "parent_id": c.parent_id, "writer_name": _writer(c), "is_staff": c.writer_type == "1",
            "writer_id": c.writer_id, "content": sanitize_html(c.content), "created_at": _iso(c.created_at),
            "attachments": _files(c.comment_attachments, "comment"),
        }

    return {
        "seq": b.seq, "parent_id": b.parent_id, "title": b.title, "content": sanitize_html(b.content),
        "writer_name": _writer(b), "is_staff": b.writer_type == "1", "writer_id": b.writer_id,
        "status": b.status, "status_label": STATUS_LABELS.get(b.status or "", "-"), "is_notice": bool(b.is_notice),
        "created_at": _iso(b.created_at), "categories": [c.name for c in b.categories], "category_ids": [c.seq for c in b.categories],
        "attachments": _files(b.board_attachments, "post"),
        "comments": [comment(c) for c in b.comments],
    }


@router.get("/{seq}")
def get_post(seq: int, db: Session = Depends(get_db)):
    b = db.query(ProjectBoard).options(joinedload(ProjectBoard.project), joinedload(ProjectBoard.company)).filter(ProjectBoard.seq == seq).first()
    if b is None:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    return {
        **_post_detail(b),
        "company_name": b.company.name if b.company else None,
        "project_id": b.project_id,
        "project_title": b.project.title if b.project else None,
        "replies": [_post_detail(r) for r in sorted(b.replies, key=lambda r: r.created_at or datetime.min)],
        "write_enabled": write_enabled("project_board"),
    }


@router.get("/files/post/{attachment_id}")
def download_post_file(attachment_id: int, db: Session = Depends(get_db)):
    a = db.query(ProjectBoardAttachment).filter(ProjectBoardAttachment.seq == attachment_id).first()
    if a is None:
        raise HTTPException(status_code=404, detail="첨부를 찾을 수 없습니다.")
    return file_download_response(a.file, a.filename)


@router.get("/files/comment/{attachment_id}")
def download_comment_file(attachment_id: int, db: Session = Depends(get_db)):
    a = db.query(ProjectBoardCommentAttachment).filter(ProjectBoardCommentAttachment.seq == attachment_id).first()
    if a is None:
        raise HTTPException(status_code=404, detail="첨부를 찾을 수 없습니다.")
    return file_download_response(a.file, a.filename)


def _notify(board_id: int, action: str) -> None:
    db = SessionLocal()
    try:
        b = db.query(ProjectBoard).options(joinedload(ProjectBoard.project)).filter(ProjectBoard.seq == board_id).first()
        if b is None:
            return
        root = b.parent_id or b.seq
        send_push_to_company(
            db, b.company_id, f"한결랩에서 {ACTION_LABELS[action]}이 등록되었습니다",
            f"[{b.project.title if b.project else ''}] {b.title or ''}",
            {"type": "project_board_post", "target_id": str(root), "route": f"/project-board/{root}"},
        )
    finally:
        db.close()


def _save_files(files: list[UploadFile]) -> list[tuple[str, str, int]]:
    saved = []
    for f in files:
        if f.filename:
            path, name = save_upload(f, "project_board_files")
            f.file.seek(0, 2)
            saved.append((path, name, f.file.tell()))
    return saved


@router.post("", dependencies=[WRITE])
def create_post(
    request: Request,
    background: BackgroundTasks,
    project_id: int = Form(...),
    title: str = Form(...),
    content: str = Form(...),
    category_ids: str | None = Form(None),
    is_notice: bool = Form(False),
    parent_id: int | None = Form(None),
    files: list[UploadFile] = File(default=[]),
    staff: CustomAuthUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
):
    """직원 글 또는 답글(parent_id) 등록."""
    project = db.query(Project).filter(Project.seq == project_id).first()
    if project is None or not project.company_id:
        raise HTTPException(status_code=400, detail="프로젝트를 확인하세요.")
    if not title.strip() or not html_to_text(content):
        raise HTTPException(status_code=400, detail="제목과 내용을 입력하세요.")
    if parent_id:
        parent = db.query(ProjectBoard).filter(ProjectBoard.seq == parent_id, ProjectBoard.project_id == project_id).first()
        if parent is None:
            raise HTTPException(status_code=400, detail="원글을 찾을 수 없습니다.")
    now = datetime.now()
    b = ProjectBoard(
        company_id=project.company_id, project_id=project_id, parent_id=parent_id, title=title.strip()[:200],
        content=sanitize_html(content), writer_id=staff.id, writer_type="1", status="1", views=0,
        is_notice=is_notice and not parent_id, created_at=now, updated_at=now,
    )
    ids = [int(x) for x in (category_ids or "").split(",") if x.strip()]
    if ids and not parent_id:
        b.categories = db.query(ProjectBoardCategory).filter(ProjectBoardCategory.seq.in_(ids), ProjectBoardCategory.project_id == project_id).all()
    db.add(b)
    db.flush()
    for path, name, size in _save_files(files):
        db.add(ProjectBoardAttachment(board_id=b.seq, file=path, filename=name, file_size=size, uploaded_at=now))
    staff_auth.audit(db, request, "board_post", user_id=staff.id, target=f"board:{b.seq}")
    db.commit()
    background.add_task(_notify, b.seq, "reply" if parent_id else "post")
    return {"seq": b.seq}


class PostUpdate(BaseModel):
    title: str
    content: str
    category_ids: list[int] = []
    is_notice: bool = False


@router.patch("/{seq}", dependencies=[WRITE])
def update_post(seq: int, body: PostUpdate, request: Request, staff: CustomAuthUser = Depends(get_current_staff),
                db: Session = Depends(get_db)):
    """글 수정 — 작성한 직원만(cms 와 같은 권한)."""
    b = db.query(ProjectBoard).filter(ProjectBoard.seq == seq).with_for_update().first()
    if b is None:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    if b.writer_type != "1" or b.writer_id != staff.id:
        raise HTTPException(status_code=403, detail="작성자만 수정할 수 있습니다.")
    if not body.title.strip() or not html_to_text(body.content):
        raise HTTPException(status_code=400, detail="제목과 내용을 입력하세요.")
    b.title = body.title.strip()[:200]
    b.content = sanitize_html(body.content)
    if not b.parent_id:
        b.is_notice = body.is_notice
        b.categories = db.query(ProjectBoardCategory).filter(
            ProjectBoardCategory.seq.in_(body.category_ids or [0]), ProjectBoardCategory.project_id == b.project_id).all()
    b.updated_at = datetime.now()
    staff_auth.audit(db, request, "board_update", user_id=staff.id, target=f"board:{seq}")
    db.commit()
    return {"ok": True}


# ── 카테고리(프로젝트별) ──

class CategoryBody(BaseModel):
    project_id: int | None = None
    name: str | None = None
    description: str | None = None
    color: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


@router.get("/categories/{project_id}/all")
def all_categories(project_id: int, db: Session = Depends(get_db)):
    """관리용 — 숨긴 카테고리 포함."""
    rows = (db.query(ProjectBoardCategory).filter(ProjectBoardCategory.project_id == project_id)
            .order_by(ProjectBoardCategory.sort_order, ProjectBoardCategory.seq).all())
    return {"items": [{"id": c.seq, "name": c.name, "description": c.description, "color": c.color,
                       "sort_order": c.sort_order or 0, "is_active": bool(c.is_active)} for c in rows],
            "write_enabled": write_enabled("project_board")}


@router.post("/categories", dependencies=[WRITE])
def create_category(body: CategoryBody, request: Request, staff: CustomAuthUser = Depends(get_current_staff),
                    db: Session = Depends(get_db)):
    if not body.project_id or not db.query(Project.seq).filter(Project.seq == body.project_id).first():
        raise HTTPException(status_code=400, detail="프로젝트를 확인하세요.")
    if not (body.name or "").strip():
        raise HTTPException(status_code=400, detail="카테고리 이름을 입력하세요.")
    last = db.query(ProjectBoardCategory.sort_order).filter(ProjectBoardCategory.project_id == body.project_id) \
        .order_by(ProjectBoardCategory.sort_order.desc()).first()
    now = datetime.now()
    c = ProjectBoardCategory(project_id=body.project_id, name=body.name.strip()[:100], description=(body.description or "")[:255] or None,
                             color=body.color or None, sort_order=body.sort_order if body.sort_order is not None else ((last[0] or 0) + 1 if last else 1),
                             is_active=True, created_at=now, updated_at=now)
    db.add(c)
    db.flush()
    staff_auth.audit(db, request, "board_category_create", user_id=staff.id, target=f"board_category:{c.seq}")
    db.commit()
    return {"id": c.seq}


@router.patch("/categories/{cid}", dependencies=[WRITE])
def update_category(cid: int, body: CategoryBody, request: Request, staff: CustomAuthUser = Depends(get_current_staff),
                    db: Session = Depends(get_db)):
    """이름·설명·색·순서·사용 여부. 삭제 대신 숨김(is_active=false) — 글에 붙은 연결을 보존한다."""
    c = db.query(ProjectBoardCategory).filter(ProjectBoardCategory.seq == cid).first()
    if c is None:
        raise HTTPException(status_code=404, detail="카테고리를 찾을 수 없습니다.")
    data = body.model_dump(exclude_unset=True, exclude={"project_id"})
    if "name" in data and not (data["name"] or "").strip():
        raise HTTPException(status_code=400, detail="카테고리 이름을 입력하세요.")
    for k, v in data.items():
        setattr(c, k, v.strip() if isinstance(v, str) else v)
    c.updated_at = datetime.now()
    staff_auth.audit(db, request, "board_category_update", user_id=staff.id, target=f"board_category:{cid}", detail=",".join(sorted(data)))
    db.commit()
    return {"ok": True}


@router.post("/{seq}/comments", dependencies=[WRITE])
def add_comment(
    seq: int,
    background: BackgroundTasks,
    content: str = Form(...),
    parent_id: int | None = Form(None),
    files: list[UploadFile] = File(default=[]),
    staff: CustomAuthUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
):
    b = db.query(ProjectBoard).filter(ProjectBoard.seq == seq).first()
    if b is None:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    if not html_to_text(content):
        raise HTTPException(status_code=400, detail="내용을 입력하세요.")
    now = datetime.now()
    c = ProjectBoardComment(board_id=seq, parent_id=parent_id, content=sanitize_html(content), writer_id=staff.id,
                            writer_type="1", created_at=now, updated_at=now)
    db.add(c)
    db.flush()
    for path, name, size in _save_files(files):
        db.add(ProjectBoardCommentAttachment(comment_id=c.seq, file=path, filename=name, file_size=size, uploaded_at=now))
    db.commit()
    background.add_task(_notify, seq, "comment")
    return {"seq": c.seq}


class StatusBody(BaseModel):
    status: str


@router.post("/{seq}/status", dependencies=[WRITE])
def change_status(seq: int, body: StatusBody, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    if body.status not in STATUS_LABELS:
        raise HTTPException(status_code=400, detail="상태 값이 올바르지 않습니다.")
    b = db.query(ProjectBoard).filter(ProjectBoard.seq == seq).first()
    if b is None:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    b.status = body.status
    b.updated_at = datetime.now()
    db.commit()
    return {"ok": True}


def _delete_board(db: Session, b: ProjectBoard) -> None:
    """답글·댓글·첨부·카테고리 연결까지 지운다(DB FK 가 RESTRICT 라 하위부터)."""
    for reply in list(b.replies):
        _delete_board(db, reply)
    comments = list(b.comments)
    for c in comments:
        for a in list(c.comment_attachments):
            db.delete(a)
        c.parent_id = None
    db.flush()
    for c in comments:
        db.delete(c)
    for a in list(b.board_attachments):
        db.delete(a)
    b.categories = []
    db.flush()
    db.delete(b)
    db.flush()


@router.post("/{seq}/delete", dependencies=[WRITE])
def delete_post(seq: int, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    b = db.query(ProjectBoard).filter(ProjectBoard.seq == seq).first()
    if b is None:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    if b.writer_id != staff.id and not staff_auth.is_admin(staff):
        raise HTTPException(status_code=403, detail="작성자 또는 관리자만 삭제할 수 있습니다.")
    staff_auth.audit(db, request, "board_delete", user_id=staff.id, target=f"board:{seq}", detail=(b.title or "")[:200])
    _delete_board(db, b)
    db.commit()
    return {"ok": True}


@router.post("/comments/{comment_id}/delete", dependencies=[WRITE])
def delete_comment(comment_id: int, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    c = db.query(ProjectBoardComment).filter(ProjectBoardComment.seq == comment_id).first()
    if c is None:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")
    if c.writer_id != staff.id and not staff_auth.is_admin(staff):
        raise HTTPException(status_code=403, detail="작성자 또는 관리자만 삭제할 수 있습니다.")
    if db.query(ProjectBoardComment.seq).filter(ProjectBoardComment.parent_id == comment_id).first():
        raise HTTPException(status_code=400, detail="답글이 있는 댓글은 삭제할 수 없습니다.")
    db.query(ProjectBoardCommentAttachment).filter(ProjectBoardCommentAttachment.comment_id == comment_id).delete(synchronize_session=False)
    db.delete(c)
    db.commit()
    return {"ok": True}
