"""할일 (/api/managed/todos) — 목록·칸반·달력·상세·댓글·첨부 (SPEC 06 §4).

cms 와 다른 점: 폴더명(MD 문서)을 iCloud requirements.md 로 쓰지 않는다(경로 검증 없는 쓰기 — 폐기, 값은 DB 에만 보존).
삭제·첨부삭제는 POST 만. 09:00 다이제스트 메일은 cms cron 이 계속 보낸다(P6).
"""
import re
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.endpoints.managed.common import apply_sort, page_response, require_write, write_enabled
from app.core.deps import get_current_staff
from app.db.session import get_db
from app.models.company import Company
from app.models.customer import CustomAuthUser, Inditask, Managelist, Project
from app.models.worktools import Todo, TodoComment, TodoFile
from app.services import staff_auth
from app.utils.html_sanitize import html_to_text
from app.utils.media import delete_media, file_download_response, save_upload

router = APIRouter(prefix="/todos", tags=["managed-todos"])
WRITE = require_write("todos")
STATUS = {"pending": "대기", "in_progress": "진행중", "review": "검토중", "done": "완료"}
PRIORITY = {"high": "높음", "normal": "보통", "low": "낮음"}


def _iso(v):
    return v.isoformat() if v else None


def _names(db: Session, rows):
    users = {u.id: (u.name or u.username) for u in db.query(CustomAuthUser).filter(
        CustomAuthUser.id.in_({r.assignee_id for r in rows} | {r.created_by_id for r in rows} - {None} or {0}))}
    companies = dict(db.query(Company.seq, Company.name).filter(Company.seq.in_({r.company_id for r in rows} - {None} or {0})))
    projects = dict(db.query(Project.seq, Project.title).filter(Project.seq.in_({r.project_id for r in rows} - {None} or {0})))
    return users, companies, projects


def _row(t: Todo, users, companies, projects, today: date) -> dict:
    overdue = (today - t.due_date).days if t.due_date and t.due_date < today and t.status != "done" else 0
    return {"seq": t.seq, "title": t.title, "status": t.status, "status_label": STATUS.get(t.status, t.status), "priority": t.priority,
            "priority_label": PRIORITY.get(t.priority, t.priority), "assignee_id": t.assignee_id, "assignee": users.get(t.assignee_id, ""),
            "created_by": users.get(t.created_by_id, ""), "company_id": t.company_id, "company": companies.get(t.company_id, ""),
            "project_id": t.project_id, "project": projects.get(t.project_id, ""), "start_date": _iso(t.start_date), "due_date": _iso(t.due_date),
            "tags": [x.strip() for x in (t.tags or "").split(",") if x.strip()], "overdue_days": overdue, "created_at": _iso(t.created_at)}


def _base(db: Session):
    return db.query(Todo).filter(Todo.is_deleted == False)  # noqa: E712


@router.get("")
def list_todos(q: str | None = None, status: str | None = None, priority: str | None = None, assignee_id: int | None = None,
               company_id: int | None = None, project_id: int | None = None, page: int = Query(1, ge=1), per_page: int = Query(20, le=100),
               sort: str | None = Query(None, description="title|priority|status|due_date|created_at, '-' 접두 = 내림차순"),
               db: Session = Depends(get_db)):
    today = date.today()
    query = _base(db)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Todo.title.like(like), Todo.content.like(like), Todo.tags.like(like),
                                 Todo.assignee_id.in_(db.query(CustomAuthUser.id).filter(CustomAuthUser.name.like(like)))))
    if status == "overdue":
        query = query.filter(Todo.due_date < today, Todo.status != "done")
    elif status:
        query = query.filter(Todo.status == status)
    if priority:
        query = query.filter(Todo.priority == priority)
    if assignee_id:
        query = query.filter(Todo.assignee_id == assignee_id)
    if company_id:
        query = query.filter(Todo.company_id == company_id)
    if project_id:
        query = query.filter(Todo.project_id == project_id)
    total = query.count()
    query = apply_sort(query, sort, {"title": Todo.title, "priority": Todo.priority, "status": Todo.status, "due_date": Todo.due_date,
                                     "created_at": Todo.created_at}, [Todo.created_at.desc()])
    rows = query.offset((page - 1) * per_page).limit(per_page).all()
    out = page_response([_row(t, *_names(db, rows), today) for t in rows], total, page, per_page)
    out["counts"] = {s: _base(db).filter(Todo.status == s).count() for s in ("pending", "in_progress", "done")}
    out["counts"]["overdue"] = _base(db).filter(Todo.due_date < today, Todo.status != "done").count()
    out["write_enabled"] = write_enabled("todos")
    return out


@router.get("/kanban")
def kanban(db: Session = Depends(get_db)):
    rows = _base(db).order_by(Todo.created_at.desc()).all()
    names = _names(db, rows)
    today = date.today()
    cols = {k: [] for k in STATUS}
    for t in rows:
        if t.status in cols:
            cols[t.status].append(_row(t, *names, today))
    return {"columns": [{"key": k, "label": STATUS[k], "items": v} for k, v in cols.items()], "write_enabled": write_enabled("todos")}


@router.get("/calendar")
def calendar(db: Session = Depends(get_db)):
    """마감일 기준(시작일이 있으면 시작~마감) — cms todo_calendar_events."""
    rows = _base(db).filter(Todo.due_date.isnot(None)).all()
    users, _, _ = _names(db, rows)
    today = date.today()
    return [{"id": t.seq, "title": t.title, "start": _iso(t.start_date or t.due_date), "end": _iso(t.due_date + timedelta(days=1)),
             "status": t.status, "status_label": STATUS.get(t.status, t.status), "priority": t.priority, "assignee": users.get(t.assignee_id, "-"),
             "overdue": t.status != "done" and t.due_date < today} for t in rows]


@router.get("/prefill")
def prefill(managelist: int | None = None, inditask: int | None = None, db: Session = Depends(get_db)):
    """유지보수 요청·건별작업에서 할일 만들기 — 폼 미리 채움(cms todo_create GET)."""
    from app.core.config import settings
    if managelist:
        m = db.query(Managelist).filter(Managelist.seq == managelist).first()
        if m:
            body = html_to_text(m.contents or "").strip()
            return {"title": m.title or "", "content": f"{body}\n\n[유지보수 요청] {settings.PUBLIC_BASE_URL}/managed/maintenance/{m.seq}".strip(),
                    "due_date": _iso(getattr(m, "completion_date", None)), "company_id": m.company_id, "project_id": m.project_id, "tags": "유지보수"}
    if inditask:
        it = db.query(Inditask).filter(Inditask.seq == inditask).first()
        if it:
            body = html_to_text(it.content or "").strip()
            return {"title": it.title or "", "content": f"{body}\n\n[건별작업] {settings.PUBLIC_BASE_URL}/managed/tasks/{it.seq}".strip(),
                    "start_date": _iso(getattr(it, "work_date", None)), "due_date": _iso(getattr(it, "deadline", None)), "company_id": it.company_id,
                    "project_id": it.project_id, "assignee_id": getattr(it, "worker_id", None), "tags": "건별작업"}
    return {}


def _get(db: Session, seq: int) -> Todo:
    t = _base(db).filter(Todo.seq == seq).first()
    if not t:
        raise HTTPException(404, "할일을 찾을 수 없습니다.")
    return t


@router.get("/{seq}")
def get_todo(seq: int, db: Session = Depends(get_db)):
    t = _get(db, seq)
    out = _row(t, *_names(db, [t]), date.today())
    comments = db.query(TodoComment).filter(TodoComment.todo_id == seq).order_by(TodoComment.created_at).all()
    users = {u.id: (u.name or u.username) for u in db.query(CustomAuthUser).filter(CustomAuthUser.id.in_({c.user_id for c in comments} - {None} or {0}))}
    out.update(content=t.content, folder_name=t.folder_name, md_content=t.md_content, tags_text=t.tags, write_enabled=write_enabled("todos"))
    out["comments"] = [{"seq": c.seq, "user": users.get(c.user_id, ""), "comment": c.comment, "created_at": _iso(c.created_at)} for c in comments]
    out["files"] = [{"seq": f.seq, "filename": f.filename, "created_at": _iso(f.created_at)}
                    for f in db.query(TodoFile).filter(TodoFile.todo_id == seq).order_by(TodoFile.seq)]
    return out


@router.get("/{seq}/files/{fid}")
def download(seq: int, fid: int, db: Session = Depends(get_db)):
    f = db.query(TodoFile).filter(TodoFile.seq == fid, TodoFile.todo_id == seq).first()
    if not f:
        raise HTTPException(404, "파일을 찾을 수 없습니다.")
    return file_download_response(f.filepath, f.filename)


def _apply(db: Session, t: Todo, title: str, content: str, assignee_id: str | None, priority: str, status: str, start_date: str | None,
           due_date: str | None, tags: str, folder_name: str, md_content: str, company_id: str | None, project_id: str | None) -> None:
    if not title.strip():
        raise HTTPException(400, "제목을 입력해주세요.")
    if priority not in PRIORITY or status not in STATUS:
        raise HTTPException(400, "우선순위/상태가 올바르지 않습니다.")
    try:
        sd = date.fromisoformat(start_date) if start_date else None
        dd = date.fromisoformat(due_date) if due_date else None
    except ValueError:
        raise HTTPException(400, "날짜 형식이 올바르지 않습니다.")
    folder = (folder_name or "").strip()
    if folder and not re.fullmatch(r"[\w가-힣 .\-]{1,100}", folder) or ".." in folder:
        raise HTTPException(400, "폴더명에 사용할 수 없는 문자가 있습니다.")
    t.title, t.content, t.priority, t.status, t.start_date, t.due_date = title.strip(), content or "", priority, status, sd, dd
    t.tags, t.folder_name, t.md_content = (tags or "").strip()[:255], folder, md_content or ""
    t.assignee_id = int(assignee_id) if assignee_id else None
    t.company_id = int(company_id) if company_id else None
    t.project_id = int(project_id) if project_id else None
    if t.project_id and t.company_id and not db.query(Project.seq).filter(Project.seq == t.project_id, Project.company_id == t.company_id).first():
        raise HTTPException(400, "선택한 업체의 프로젝트가 아닙니다.")


@router.post("", dependencies=[WRITE])
def create_todo(request: Request, title: str = Form(...), content: str = Form(""), assignee_id: str | None = Form(None), priority: str = Form("normal"),
                status: str = Form("pending"), start_date: str | None = Form(None), due_date: str | None = Form(None), tags: str = Form(""),
                folder_name: str = Form(""), md_content: str = Form(""), company_id: str | None = Form(None), project_id: str | None = Form(None),
                files: list[UploadFile] = File([]), staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    now = datetime.now()
    t = Todo(created_by_id=staff.id, is_deleted=False, created_at=now, updated_at=now)
    _apply(db, t, title, content, assignee_id, priority, status, start_date, due_date, tags, folder_name, md_content, company_id, project_id)
    db.add(t)
    db.flush()
    for f in files:
        if f and f.filename:
            path, name = save_upload(f, "todo_files")
            db.add(TodoFile(todo_id=t.seq, filename=name, filepath=path, created_at=now))
    staff_auth.audit(db, request, "todos.create", user_id=staff.id, target=f"todo:{t.seq}")
    db.commit()
    return {"seq": t.seq}


@router.post("/{seq}/update", dependencies=[WRITE])
def update_todo(seq: int, title: str = Form(...), content: str = Form(""), assignee_id: str | None = Form(None), priority: str = Form("normal"),
                status: str = Form("pending"), start_date: str | None = Form(None), due_date: str | None = Form(None), tags: str = Form(""),
                folder_name: str = Form(""), md_content: str = Form(""), company_id: str | None = Form(None), project_id: str | None = Form(None),
                files: list[UploadFile] = File([]), db: Session = Depends(get_db)):
    t = _get(db, seq)
    _apply(db, t, title, content, assignee_id, priority, status, start_date, due_date, tags, folder_name, md_content, company_id, project_id)
    now = datetime.now()
    t.updated_at = now
    for f in files:
        if f and f.filename:
            path, name = save_upload(f, "todo_files")
            db.add(TodoFile(todo_id=seq, filename=name, filepath=path, created_at=now))
    db.commit()
    return {"ok": True}


class StatusBody(BaseModel):
    status: str


@router.post("/{seq}/status", dependencies=[WRITE])
def change_status(seq: int, body: StatusBody, db: Session = Depends(get_db)):
    if body.status not in STATUS:
        raise HTTPException(400, "상태가 올바르지 않습니다.")
    t = _get(db, seq)
    t.status, t.updated_at = body.status, datetime.now()
    db.commit()
    return {"ok": True}


class CommentBody(BaseModel):
    comment: str


@router.post("/{seq}/comments", dependencies=[WRITE])
def add_comment(seq: int, body: CommentBody, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    _get(db, seq)
    if not body.comment.strip():
        raise HTTPException(400, "댓글을 입력해주세요.")
    db.add(TodoComment(todo_id=seq, user_id=staff.id, comment=body.comment.strip(), created_at=datetime.now()))
    db.commit()
    return {"ok": True}


@router.post("/{seq}/files/{fid}/delete", dependencies=[WRITE])
def delete_file(seq: int, fid: int, db: Session = Depends(get_db)):
    f = db.query(TodoFile).filter(TodoFile.seq == fid, TodoFile.todo_id == seq).first()
    if not f:
        raise HTTPException(404, "파일을 찾을 수 없습니다.")
    path = f.filepath
    db.delete(f)
    db.commit()
    delete_media(path)
    return {"ok": True}


class DeleteBody(BaseModel):
    hard: bool = False


@router.post("/{seq}/delete", dependencies=[WRITE])
def delete_todo(seq: int, body: DeleteBody, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """기본 soft delete, hard=True 면 댓글·첨부까지 실제 삭제(cms hard_delete)."""
    t = _get(db, seq)
    if body.hard:
        paths = [f.filepath for f in db.query(TodoFile).filter(TodoFile.todo_id == seq)]
        db.query(TodoComment).filter(TodoComment.todo_id == seq).delete(synchronize_session=False)
        db.query(TodoFile).filter(TodoFile.todo_id == seq).delete(synchronize_session=False)
        db.delete(t)
    else:
        t.is_deleted, t.updated_at = True, datetime.now()
        paths = []
    staff_auth.audit(db, request, "todos.delete", user_id=staff.id, target=f"todo:{seq}", detail="hard" if body.hard else "soft")
    db.commit()
    for p in paths:
        delete_media(p)
    return {"ok": True}
