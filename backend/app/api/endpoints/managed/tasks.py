"""직원 건별작업 API (/api/managed/tasks)."""
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.endpoints.managed.common import apply_sort, code, page_response, require_write, verify_step_up, write_enabled
from app.core.deps import get_current_staff
from app.db.session import SessionLocal, get_db
from app.models.company import Company
from app.models.customer import CustomAuthUser, Inditask, InditaskComment, Project
from app.models.manager import Manager
from app.services import staff_auth
from app.services.push import send_push_to_company
from app.utils.html_sanitize import html_to_text, sanitize_html
from app.utils.media import file_download_response, save_upload

router = APIRouter(prefix="/tasks", tags=["managed-tasks"])
WRITE = require_write("tasks")

STATUS_LABELS = {"1": "대기", "2": "진행중", "3": "완료", "4": "보류"}
TYPE_LABELS = {"1": "계약", "2": "기획", "3": "디자인", "4": "프론트엔드", "5": "백엔드", "6": "유지보수", "7": "기타"}


def _iso(v):
    return v.isoformat() if v else None


def apply_status_change(task: Inditask, new_status: str | None) -> None:
    """cms Inditask.apply_status_change 와 같은 규칙: 진행중(2) 구간의 경과시간을 actual_hours 에 0.1시간 단위로 누적."""
    if not new_status or new_status == code(task.task_status):
        return
    now = datetime.now()
    if code(task.task_status) == "2" and task.work_started_at:
        elapsed = Decimal(str((now - task.work_started_at).total_seconds() / 3600)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
        task.actual_hours = float(Decimal(str(task.actual_hours or 0)) + elapsed)
        task.work_started_at = None
    if new_status == "2":
        task.work_started_at = now
    task.task_status = new_status


@router.get("")
def list_tasks(
    company_id: int | None = None,
    status: str | None = None,
    task_type: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    sort: str | None = Query(None, description="seq|title|task_status|created_at|deadline, '-' 접두 = 내림차순"),
    db: Session = Depends(get_db),
):
    query = db.query(Inditask).outerjoin(Company, Inditask.company_id == Company.seq)
    if company_id:
        query = query.filter(Inditask.company_id == company_id)
    if status:
        query = query.filter(Inditask.task_status == status)
    if task_type:
        query = query.filter(Inditask.task_type == task_type)
    if date_from:
        query = query.filter(Inditask.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.filter(Inditask.created_at < datetime.combine(date_to + timedelta(days=1), datetime.min.time()))
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(Inditask.title.like(like), Inditask.content.like(like), Company.name.like(like)))
    total = query.count()
    query = apply_sort(query, sort, {"seq": Inditask.seq, "title": Inditask.title, "task_status": Inditask.task_status,
                                     "created_at": Inditask.created_at, "deadline": Inditask.deadline}, [Inditask.created_at.desc()])
    rows = query.offset((page - 1) * per_page).limit(per_page).all()
    companies = {c.seq: c.name for c in db.query(Company).filter(Company.seq.in_({r.company_id for r in rows}))} if rows else {}
    writers = {m.seq: m.name for m in db.query(Manager).filter(Manager.seq.in_({r.writer_id for r in rows if r.writer_id}))} if rows else {}
    items = [{
        "seq": r.seq,
        "title": r.title or html_to_text(r.content, 40),
        "company_name": companies.get(r.company_id),
        "writer_name": writers.get(r.writer_id),
        "task_type_label": TYPE_LABELS.get(code(r.task_type) or "", "-"),
        "status": code(r.task_status),
        "status_label": STATUS_LABELS.get(code(r.task_status) or "", "-"),
        "request_date": _iso(r.requestDate),
        "deadline": _iso(r.deadline),
        "work_date": _iso(r.work_date),
        "estimated_hours": r.estimated_hours,
        "actual_hours": r.actual_hours,
        "created_at": _iso(r.created_at),
    } for r in rows]
    return page_response(items, total, page, per_page)


@router.get("/{seq}")
def get_task(seq: int, db: Session = Depends(get_db)):
    r = db.query(Inditask).filter(Inditask.seq == seq).first()
    if r is None:
        raise HTTPException(status_code=404, detail="건별작업을 찾을 수 없습니다.")
    company = db.query(Company).filter(Company.seq == r.company_id).first()
    project = db.query(Project).filter(Project.seq == r.project_id).first() if r.project_id else None
    writer = db.query(Manager).filter(Manager.seq == r.writer_id).first() if r.writer_id else None
    comments = db.query(InditaskComment).filter(InditaskComment.inditask_id == seq).order_by(InditaskComment.created_at).all()
    names = {u.id: (u.name or u.username) for u in db.query(CustomAuthUser).filter(CustomAuthUser.id.in_({c.writer_id for c in comments if c.writer_id}))}
    return {
        "seq": r.seq,
        "title": r.title,
        "content": sanitize_html(r.content),
        "company_id": r.company_id,
        "company_name": company.name if company else None,
        "project_id": r.project_id,
        "project_title": project.title if project else None,
        "writer_id": r.writer_id,
        "writer_name": writer.name if writer else None,
        "task_type": code(r.task_type),
        "task_type_label": TYPE_LABELS.get(code(r.task_type) or "", "-"),
        "status": code(r.task_status),
        "status_label": STATUS_LABELS.get(code(r.task_status) or "", "-"),
        "request_date": _iso(r.requestDate),
        "deadline": _iso(r.deadline),
        "work_date": _iso(r.work_date),
        "estimated_hours": r.estimated_hours,
        "actual_hours": r.actual_hours,
        "work_started_at": _iso(r.work_started_at),
        "budget": r.budget,
        "file_name": (r.inditask_file_name or (r.inditask_file or "").rsplit("/", 1)[-1]) if r.inditask_file else None,
        "created_at": _iso(r.created_at),
        "comments": [{
            "seq": c.seq,
            "writer_name": names.get(c.writer_id, "고객") if c.writer_id else "고객",
            "content": sanitize_html(c.content),
            "created_at": _iso(c.created_at),
        } for c in comments],
        "write_enabled": write_enabled("tasks"),
    }


@router.get("/{seq}/file")
def download_task_file(seq: int, db: Session = Depends(get_db)):
    r = db.query(Inditask).filter(Inditask.seq == seq).first()
    if r is None or not r.inditask_file:
        raise HTTPException(status_code=404, detail="첨부를 찾을 수 없습니다.")
    return file_download_response(r.inditask_file, r.inditask_file_name)


def _parse_date(value: str | None) -> date | None:
    return date.fromisoformat(value) if value else None


@router.post("", dependencies=[WRITE])
def create_task(
    request: Request,
    company_id: int = Form(...),
    title: str = Form(...),
    content: str = Form(""),
    project_id: int | None = Form(None),
    writer_seq: int | None = Form(None),
    task_type: str | None = Form(None),
    status: str = Form("1"),
    request_date: str | None = Form(None),
    deadline: str | None = Form(None),
    work_date: str | None = Form(None),
    estimated_hours: float | None = Form(None),
    budget: int | None = Form(None),
    file: UploadFile | None = File(None),
    staff: CustomAuthUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
):
    if status not in STATUS_LABELS or (task_type and task_type not in TYPE_LABELS):
        raise HTTPException(status_code=400, detail="상태·작업유형 값을 확인하세요.")
    if writer_seq and not db.query(Manager).filter(Manager.seq == writer_seq, Manager.company_id == company_id).first():
        raise HTTPException(status_code=400, detail="선택한 회사의 고객 담당자가 아닙니다.")
    stored, filename = save_upload(file, "inditask_files") if file and file.filename else (None, None)
    now = datetime.now()
    task = Inditask(
        company_id=company_id, project_id=project_id, writer_id=writer_seq, title=title.strip(),
        content=sanitize_html(content), task_type=task_type, task_status="1",
        requestDate=_parse_date(request_date), deadline=_parse_date(deadline), work_date=_parse_date(work_date),
        estimated_hours=estimated_hours, budget=budget, inditask_file=stored, inditask_file_name=filename,
        created_at=now, updated_at=now,
    )
    apply_status_change(task, status)
    db.add(task)
    db.flush()
    staff_auth.audit(db, request, "task_create", user_id=staff.id, target=f"inditask:{task.seq}")
    db.commit()
    return {"seq": task.seq}


class TaskUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    task_type: str | None = None
    status: str | None = None
    request_date: date | None = None
    deadline: date | None = None
    work_date: date | None = None
    estimated_hours: float | None = None
    budget: int | None = None


@router.patch("/{seq}", dependencies=[WRITE])
def update_task(seq: int, body: TaskUpdate, db: Session = Depends(get_db)):
    """수정 — 요청자(writer)는 건드리지 않는다(cms 수정 화면이 요청자를 지우던 버그 방지)."""
    task = db.query(Inditask).filter(Inditask.seq == seq).with_for_update().first()
    if task is None:
        raise HTTPException(status_code=404, detail="건별작업을 찾을 수 없습니다.")
    data = body.model_dump(exclude_unset=True)
    if "status" in data and data["status"] not in STATUS_LABELS:
        raise HTTPException(status_code=400, detail="상태 값이 올바르지 않습니다.")
    field_map = {"request_date": "requestDate"}
    for key, value in data.items():
        if key == "status":
            continue
        if key == "content":
            value = sanitize_html(value)
        setattr(task, field_map.get(key, key), value)
    apply_status_change(task, data.get("status"))
    task.updated_at = datetime.now()
    db.commit()
    return {"ok": True}


def _notify_comment(task_id: int) -> None:
    db = SessionLocal()
    try:
        t = db.query(Inditask).filter(Inditask.seq == task_id).first()
        if t is not None:
            send_push_to_company(db, t.company_id, "건별작업 코멘트 등록", f"{t.title or ''} 건에 코멘트가 등록되었습니다.",
                                 {"type": "inditask_comment", "target_id": str(t.seq), "route": f"/tasks/{t.seq}"})
    finally:
        db.close()


class TaskComment(BaseModel):
    content: str
    status: str | None = None


@router.post("/{seq}/comments", dependencies=[WRITE])
def add_comment(seq: int, body: TaskComment, background: BackgroundTasks,
                staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    if not html_to_text(body.content):
        raise HTTPException(status_code=400, detail="내용을 입력하세요.")
    if body.status and body.status not in STATUS_LABELS:
        raise HTTPException(status_code=400, detail="상태 값이 올바르지 않습니다.")
    task = db.query(Inditask).filter(Inditask.seq == seq).with_for_update().first()
    if task is None:
        raise HTTPException(status_code=404, detail="건별작업을 찾을 수 없습니다.")
    now = datetime.now()
    db.add(InditaskComment(inditask_id=seq, content=sanitize_html(body.content), writer_id=staff.id,
                           created_at=now, updated_at=now))
    apply_status_change(task, body.status)
    task.updated_at = now
    db.commit()
    background.add_task(_notify_comment, seq)
    return {"ok": True}


class StepUp(BaseModel):
    password: str


@router.post("/{seq}/delete", dependencies=[WRITE])
def delete_task(seq: int, body: StepUp, request: Request,
                staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    verify_step_up(staff, body.password)
    task = db.query(Inditask).filter(Inditask.seq == seq).with_for_update().first()
    if task is None:
        raise HTTPException(status_code=404, detail="건별작업을 찾을 수 없습니다.")
    db.query(InditaskComment).filter(InditaskComment.inditask_id == seq).delete(synchronize_session=False)
    staff_auth.audit(db, request, "task_delete", user_id=staff.id, target=f"inditask:{seq}", detail=(task.title or "")[:200])
    db.delete(task)
    db.commit()
    return {"ok": True}
