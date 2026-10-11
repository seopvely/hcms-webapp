"""직원 유지보수 요청 API (/api/managed/maintenance). 쓰기는 MANAGED_WRITE_AREAS 에 'maintenance' 가 있을 때만."""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.services.points import calculate_remaining_points
from app.api.endpoints.managed.common import (
    MAINT_STATUS_LABELS,
    POINT_STATUS_LABELS,
    POINT_TYPE_LABELS,
    REQUEST_TYPE_LABELS,
    WORKER_TYPE_LABELS,
    apply_sort,
    code,
    page_response,
    require_write,
    verify_step_up,
    write_enabled,
)
from app.core.deps import get_current_staff
from app.db.session import SessionLocal, get_db
from app.models.company import Company
from app.models.customer import (
    CommentAttachment,
    CustomAuthUser,
    Managelist,
    ManagelistComment,
    MaintenanceAttachment,
    PointHistory,
    Project,
)
from app.models.manager import Manager
from app.services import managed_maintenance as svc
from app.services import staff_auth
from app.services.email import notify_customer_maintenance_reply
from app.services.push import send_push_to_company
from app.utils.html_sanitize import html_to_text, sanitize_html
from app.utils.media import file_download_response, save_upload

router = APIRouter(prefix="/maintenance", tags=["managed-maintenance"])

WRITE = require_write("maintenance")


def _iso(value) -> str | None:
    return value.isoformat() if value else None


def _staff_names(db: Session, ids: set) -> dict:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return {u.id: (u.name or u.username) for u in db.query(CustomAuthUser).filter(CustomAuthUser.id.in_(ids))}


# ── 목록·상세 ───────────────────────────────────────────────────────────

@router.get("")
def list_requests(
    company_id: int | None = None,
    project_id: int | None = None,
    status: str | None = Query(None, description="1~4 또는 pending(1·2·3)"),
    request_type: str | None = Query(None, description="maint | dev | none"),
    free: bool | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = None,
    sort: str | None = Query(None, description="seq|title|request_date|completion_date|status, '-' 접두 = 내림차순"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    query = (
        db.query(Managelist)
        .options(joinedload(Managelist.company), joinedload(Managelist.project), joinedload(Managelist.writer))
        .outerjoin(Company, Managelist.company_id == Company.seq)
        .outerjoin(Project, Managelist.project_id == Project.seq)
    )
    if company_id:
        query = query.filter(Managelist.company_id == company_id)
    if project_id:
        query = query.filter(Managelist.project_id == project_id)
    if status == "pending":
        query = query.filter(Managelist.status.in_(["1", "2", "3"]))
    elif status:
        query = query.filter(Managelist.status == status)
    if request_type == "none":
        query = query.filter(Managelist.request_type.is_(None))
    elif request_type:
        query = query.filter(Managelist.request_type == request_type)
    if free is not None:
        query = query.filter(Managelist.is_free_maint == free)
    if date_from:
        query = query.filter(Managelist.request_date >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.filter(Managelist.request_date < datetime.combine(date_to + timedelta(days=1), datetime.min.time()))
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(Managelist.title.like(like), Managelist.contents.like(like),
                                 Company.name.like(like), Project.title.like(like)))

    total = query.count()
    query = apply_sort(query, sort, {"seq": Managelist.seq, "title": Managelist.title, "request_date": Managelist.request_date,
                                     "completion_date": Managelist.completion_date, "status": Managelist.status},
                       [Managelist.created_at.desc(), Managelist.seq.desc()])
    rows = query.offset((page - 1) * per_page).limit(per_page).all()

    ids = [m.seq for m in rows]
    pending = dict(
        db.query(ManagelistComment.managelist_id, func.sum(ManagelistComment.point))
        .filter(ManagelistComment.managelist_id.in_(ids), ManagelistComment.point > 0,
                ManagelistComment.point_executed == False)  # noqa: E712
        .group_by(ManagelistComment.managelist_id)
    ) if ids else {}
    counts = dict(
        db.query(ManagelistComment.managelist_id, func.count(ManagelistComment.seq))
        .filter(ManagelistComment.managelist_id.in_(ids)).group_by(ManagelistComment.managelist_id)
    ) if ids else {}

    items = [{
        "seq": m.seq,
        "title": m.title,
        "company_id": m.company_id,
        "company_name": m.company.name if m.company else None,
        "project_id": m.project_id,
        "project_title": m.project.title if m.project else None,
        "writer_name": m.writer.name if m.writer else None,
        "request_date": _iso(m.request_date),
        "completion_date": _iso(m.completion_date),
        "status": code(m.status),
        "status_label": MAINT_STATUS_LABELS.get(code(m.status) or "", "-"),
        "request_type": m.request_type,
        "is_free_maint": bool(m.is_free_maint),
        "points_used": m.points_used or 0,
        "pending_points": int(pending.get(m.seq) or 0),
        "comment_count": counts.get(m.seq, 0),
    } for m in rows]
    return page_response(items, total, page, per_page)


@router.get("/pending-points")
def pending_points(
    company_id: int | None = None,
    project_id: int | None = None,
    db: Session = Depends(get_db),
):
    """미실행 책정 포인트 댓글 목록(일괄 실행 모달)."""
    query = (
        db.query(ManagelistComment, Managelist)
        .join(Managelist, ManagelistComment.managelist_id == Managelist.seq)
        .filter(ManagelistComment.point > 0, ManagelistComment.point_executed == False)  # noqa: E712
    )
    if company_id:
        query = query.filter(Managelist.company_id == company_id)
    if project_id:
        query = query.filter(Managelist.project_id == project_id)
    rows = query.order_by(ManagelistComment.created_at).all()
    names = _staff_names(db, {c.writer_id for c, _ in rows})
    companies = {c.seq: c.name for c in db.query(Company).filter(Company.seq.in_({m.company_id for _, m in rows}))} if rows else {}
    return {"items": [{
        "comment_id": c.seq,
        "managelist_id": m.seq,
        "title": m.title,
        "company_name": companies.get(m.company_id),
        "point": c.point,
        "writer_name": names.get(c.writer_id),
        "created_at": _iso(c.created_at),
        "summary": html_to_text(c.content, 80),
    } for c, m in rows]}


@router.get("/schedule")
def schedule(start: date, end: date, db: Session = Depends(get_db)):
    """달력 이벤트 — cms maintenance-schedule/api 와 같은 겹침 조건."""
    end_dt = datetime.combine(end, datetime.max.time())
    start_dt = datetime.combine(start, datetime.min.time())
    rows = (
        db.query(Managelist)
        .options(joinedload(Managelist.company), joinedload(Managelist.project), joinedload(Managelist.writer))
        .filter(Managelist.request_date.isnot(None), Managelist.request_date <= end_dt)
        .filter(or_(Managelist.completion_date.is_(None), Managelist.completion_date >= start_dt,
                    Managelist.request_date >= start_dt))
        .all()
    )
    events = []
    for m in rows:
        s = m.request_date.date()
        e = (m.completion_date.date() if isinstance(m.completion_date, datetime) else m.completion_date) or s
        events.append({
            "id": m.seq,
            "title": m.title,
            "start": s.isoformat(),
            "end": max(e, s).isoformat(),
            "status": code(m.status),
            "status_label": MAINT_STATUS_LABELS.get(code(m.status) or "", "-"),
            "company_name": m.company.name if m.company else None,
            "project_title": m.project.title if m.project else None,
            "writer_name": m.writer.name if m.writer else None,
        })
    return {"items": events}


@router.get("/comments")
def search_comments(
    project_id: int | None = None,
    worker_type: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    sort: str | None = Query(None, description="created_at|worker_type|status|point, '-' 접두 = 내림차순"),
    db: Session = Depends(get_db),
):
    """처리내역 검색(cms 댓글히스토리). 내용은 정화한 평문 요약."""
    query = db.query(ManagelistComment, Managelist).join(Managelist, ManagelistComment.managelist_id == Managelist.seq)
    if project_id:
        query = query.filter(Managelist.project_id == project_id)
    if worker_type:
        query = query.filter(ManagelistComment.worker_type == worker_type)
    if date_from:
        query = query.filter(ManagelistComment.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.filter(ManagelistComment.created_at < datetime.combine(date_to + timedelta(days=1), datetime.min.time()))
    if q:
        query = query.filter(ManagelistComment.content.like(f"%{q.strip()}%"))
    total = query.count()
    query = apply_sort(query, sort, {"created_at": ManagelistComment.created_at, "worker_type": ManagelistComment.worker_type,
                                     "status": ManagelistComment.status, "point": ManagelistComment.point},
                       [ManagelistComment.created_at.desc()])
    rows = query.offset((page - 1) * per_page).limit(per_page).all()
    names = _staff_names(db, {c.writer_id for c, _ in rows})
    companies = {c.seq: c.name for c in db.query(Company).filter(Company.seq.in_({m.company_id for _, m in rows}))} if rows else {}
    items = [{
        "comment_id": c.seq,
        "managelist_id": m.seq,
        "title": m.title,
        "company_name": companies.get(m.company_id),
        "writer_name": names.get(c.writer_id) if c.writer_id else "고객",
        "worker_type_label": WORKER_TYPE_LABELS.get(code(c.worker_type) or "", None),
        "status_label": MAINT_STATUS_LABELS.get(code(c.status) or "", None),
        "point": c.point or 0,
        "point_executed": bool(c.point_executed),
        "created_at": _iso(c.created_at),
        "summary": html_to_text(c.content, 120),
    } for c, m in rows]
    return page_response(items, total, page, per_page)


@router.get("/{seq}")
def get_request(seq: int, db: Session = Depends(get_db)):
    m = (
        db.query(Managelist)
        .options(joinedload(Managelist.company), joinedload(Managelist.project), joinedload(Managelist.writer))
        .filter(Managelist.seq == seq)
        .first()
    )
    if m is None:
        raise HTTPException(status_code=404, detail="유지보수 요청을 찾을 수 없습니다.")

    comments = (
        db.query(ManagelistComment)
        .options(joinedload(ManagelistComment.comment_attachments))
        .filter(ManagelistComment.managelist_id == seq)
        .order_by(ManagelistComment.created_at, ManagelistComment.seq)
        .all()
    )
    names = _staff_names(db, {c.writer_id for c in comments})
    staff_types = {u.id: code(u.type) for u in db.query(CustomAuthUser).filter(CustomAuthUser.id.in_(names.keys()))} if names else {}
    histories = db.query(PointHistory).filter(PointHistory.managelist_id == seq).order_by(PointHistory.created_at).all()
    used_ledger = sum(abs(h.point or 0) for h in histories if code(h.point_type) == "2" and code(h.status) == "2")
    remaining = calculate_remaining_points(m.project, db, m.company_id) if m.project else None
    attachments = db.query(MaintenanceAttachment).filter(MaintenanceAttachment.managelist_id == seq).all()

    return {
        "seq": m.seq,
        "title": m.title,
        "contents": sanitize_html(m.contents),
        "company_id": m.company_id,
        "company_name": m.company.name if m.company else None,
        "project_id": m.project_id,
        "project_title": m.project.title if m.project else None,
        "writer_name": m.writer.name if m.writer else None,
        "writer_email": m.writer.email if m.writer else None,
        "request_date": _iso(m.request_date),
        "completion_date": _iso(m.completion_date),
        "complete_date": _iso(m.complete_date),
        "created_at": _iso(m.created_at),
        "status": code(m.status),
        "status_label": MAINT_STATUS_LABELS.get(code(m.status) or "", "-"),
        "request_type": m.request_type,
        "request_type_label": REQUEST_TYPE_LABELS.get(m.request_type or "", "미분류"),
        "is_free_maint": bool(m.is_free_maint),
        "points_used": m.points_used or 0,
        "points_used_ledger": used_ledger,
        "remaining_points": remaining,
        "monthly_point": m.project.point if m.project else None,
        "attachments": [{"id": a.seq, "filename": a.filename} for a in attachments],
        "legacy_file": m.request_file or None,
        "comments": [{
            "seq": c.seq,
            "parent_id": c.parent_id,
            "writer_id": c.writer_id,
            "writer_name": names.get(c.writer_id, "삭제된 직원") if c.writer_id else "고객",
            "is_customer": c.writer_id is None,
            "worker_type_label": WORKER_TYPE_LABELS.get(code(c.worker_type) or staff_types.get(c.writer_id) or "", None),
            "status": code(c.status),
            "status_label": MAINT_STATUS_LABELS.get(code(c.status) or "", None),
            "content": sanitize_html(c.content),
            "point": c.point or 0,
            "point_executed": bool(c.point_executed),
            "completion_date": _iso(c.completion_date),
            "created_at": _iso(c.created_at),
            "attachments": [{"id": a.seq, "filename": a.filename} for a in c.comment_attachments],
            "legacy_file": c.attachment or None,
        } for c in comments],
        "point_histories": [{
            "seq": h.seq,
            "point": h.point,
            "point_type_label": POINT_TYPE_LABELS.get(code(h.point_type) or "", "-"),
            "status_label": POINT_STATUS_LABELS.get(code(h.status) or "", "-"),
            "comment_id": h.comment_id,
            "created_at": _iso(h.created_at),
        } for h in histories],
        "write_enabled": write_enabled("maintenance"),
    }


# ── 첨부 다운로드(인증) ─────────────────────────────────────────────────

@router.get("/files/request/{attachment_id}")
def download_request_attachment(attachment_id: int, db: Session = Depends(get_db)):
    a = db.query(MaintenanceAttachment).filter(MaintenanceAttachment.seq == attachment_id).first()
    if a is None:
        raise HTTPException(status_code=404, detail="첨부를 찾을 수 없습니다.")
    return file_download_response(a.file, a.filename)


@router.get("/files/request-legacy/{seq}")
def download_request_legacy(seq: int, db: Session = Depends(get_db)):
    m = db.query(Managelist).filter(Managelist.seq == seq).first()
    if m is None or not m.request_file:
        raise HTTPException(status_code=404, detail="첨부를 찾을 수 없습니다.")
    return file_download_response(m.request_file)


@router.get("/files/comment/{attachment_id}")
def download_comment_attachment(attachment_id: int, db: Session = Depends(get_db)):
    a = db.query(CommentAttachment).filter(CommentAttachment.seq == attachment_id).first()
    if a is None:
        raise HTTPException(status_code=404, detail="첨부를 찾을 수 없습니다.")
    return file_download_response(a.file, a.filename)


@router.get("/files/comment-legacy/{comment_id}")
def download_comment_legacy(comment_id: int, db: Session = Depends(get_db)):
    c = db.query(ManagelistComment).filter(ManagelistComment.seq == comment_id).first()
    if c is None or not c.attachment:
        raise HTTPException(status_code=404, detail="첨부를 찾을 수 없습니다.")
    return file_download_response(c.attachment)


# ── 쓰기 ────────────────────────────────────────────────────────────────

def _notify_reply(managelist_id: int, comment_id: int) -> None:
    """직원 댓글 알림(커밋 후): 요청 고객 메일 + 회사 고객 푸시. cms 와 같은 시점·대상."""
    db = SessionLocal()
    try:
        m = db.query(Managelist).options(joinedload(Managelist.writer)).filter(Managelist.seq == managelist_id).first()
        c = db.query(ManagelistComment).filter(ManagelistComment.seq == comment_id).first()
        if m is None or c is None:
            return
        status_display = {"2": "알림", "3": "처리중", "4": "완료"}.get(code(c.status) or "", "처리 내역")
        writer = db.query(CustomAuthUser).filter(CustomAuthUser.id == c.writer_id).first()
        if m.writer and m.writer.email:
            notify_customer_maintenance_reply(
                m.writer.email, m.writer.name, m.seq, m.title, status_display,
                (writer.name or writer.username) if writer else "담당자", c.point or 0,
            )
        send_push_to_company(
            db, m.company_id, "유지보수 답변 등록", f"{m.title or ''} 건에 새 답변이 등록되었습니다.",
            {"type": "managelist_comment", "target_id": str(m.seq), "route": f"/maintenance/{m.seq}"},
        )
    finally:
        db.close()


@router.post("", dependencies=[WRITE])
def create_request(
    request: Request,
    company_id: int = Form(...),
    title: str = Form(...),
    contents: str = Form(""),
    project_id: int | None = Form(None),
    writer_seq: int | None = Form(None),
    attachments: list[UploadFile] = File(default=[]),
    staff: CustomAuthUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
):
    if not title.strip():
        raise HTTPException(status_code=400, detail="제목을 입력하세요.")
    files = [save_upload(f, "maintenance_files") for f in attachments if f.filename]
    ml = svc.create_request(db, staff, company_id, project_id, writer_seq, title.strip(), contents, files)
    staff_auth.audit(db, request, "maintenance_create", user_id=staff.id, target=f"managelist:{ml.seq}")
    db.commit()
    return {"seq": ml.seq}


class RequestUpdate(BaseModel):
    title: str | None = None
    contents: str | None = None
    completion_date: date | None = None


@router.patch("/{seq}", dependencies=[WRITE])
def update_request(seq: int, body: RequestUpdate, db: Session = Depends(get_db)):
    ml = svc.lock_managelist(db, seq)
    if code(ml.status) != "1":
        raise HTTPException(status_code=400, detail="접수 상태인 요청만 수정할 수 있습니다.")
    data = body.model_dump(exclude_unset=True)
    if "title" in data:
        if not (data["title"] or "").strip():
            raise HTTPException(status_code=400, detail="제목을 입력하세요.")
        ml.title = data["title"].strip()
    if "contents" in data:
        ml.contents = sanitize_html(data["contents"])
    if "completion_date" in data:
        ml.completion_date = data["completion_date"]
    ml.updated_at = datetime.now()
    db.commit()
    return {"ok": True}


class StepUp(BaseModel):
    password: str


@router.post("/{seq}/delete", dependencies=[WRITE])
def delete_request(seq: int, body: StepUp, request: Request,
                   staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    verify_step_up(staff, body.password)
    ml = svc.lock_managelist(db, seq)
    svc.delete_request(db, staff, ml)
    staff_auth.audit(db, request, "maintenance_delete", user_id=staff.id, target=f"managelist:{seq}")
    db.commit()
    return {"ok": True}


class RequestTypeUpdate(BaseModel):
    request_type: str | None
    password: str


@router.post("/{seq}/request-type", dependencies=[WRITE])
def update_request_type(seq: int, body: RequestTypeUpdate, request: Request,
                        staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    verify_step_up(staff, body.password)
    if body.request_type not in (None, "maint", "dev"):
        raise HTTPException(status_code=400, detail="요청 유형이 올바르지 않습니다.")
    ml = svc.lock_managelist(db, seq)
    ml.request_type = body.request_type
    ml.updated_at = datetime.now()
    staff_auth.audit(db, request, "maintenance_request_type", user_id=staff.id, target=f"managelist:{seq}",
                     detail=body.request_type or "none")
    db.commit()
    return {"ok": True}


@router.post("/{seq}/comments", dependencies=[WRITE])
def add_comment(
    seq: int,
    background: BackgroundTasks,
    content: str = Form(...),
    status: str = Form(""),
    point: int = Form(0),
    request_type: str | None = Form(None),
    expected_date: date | None = Form(None),
    parent_id: int | None = Form(None),
    attachments: list[UploadFile] = File(default=[]),
    staff: CustomAuthUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
):
    if not html_to_text(content) and not attachments:
        raise HTTPException(status_code=400, detail="내용을 입력하세요.")
    if point < 0:
        raise HTTPException(status_code=400, detail="포인트는 0 이상이어야 합니다.")
    files = [save_upload(f, "comment_files") for f in attachments if f.filename]
    ml = svc.lock_managelist(db, seq)
    comment = svc.add_staff_comment(db, staff, ml, content, status or None, point, request_type,
                                    expected_date, parent_id, files)
    db.commit()
    background.add_task(_notify_reply, seq, comment.seq)
    return {"seq": comment.seq}


@router.post("/comments/{comment_id}/complete", dependencies=[WRITE])
def complete_comment(comment_id: int, request: Request,
                     staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    comment = db.query(ManagelistComment).filter(ManagelistComment.seq == comment_id).with_for_update().first()
    if comment is None:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")
    new_status = svc.toggle_complete(db, staff, comment)
    staff_auth.audit(db, request, "maintenance_comment_complete", user_id=staff.id,
                     target=f"comment:{comment_id}", detail=new_status)
    db.commit()
    return {"status": new_status}


@router.post("/comments/{comment_id}/delete", dependencies=[WRITE])
def delete_comment(comment_id: int, body: StepUp, request: Request,
                   staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    verify_step_up(staff, body.password)
    comment = db.query(ManagelistComment).filter(ManagelistComment.seq == comment_id).with_for_update().first()
    if comment is None:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")
    svc.delete_comment(db, staff, comment)
    staff_auth.audit(db, request, "maintenance_comment_delete", user_id=staff.id, target=f"comment:{comment_id}")
    db.commit()
    return {"ok": True}


class ExecutePoints(BaseModel):
    comment_ids: list[int]
    password: str


@router.post("/points/execute", dependencies=[WRITE])
def execute_points(body: ExecutePoints, request: Request,
                   staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """포인트 실행(단건·일괄 공용). 전체를 한 트랜잭션으로 처리한다."""
    verify_step_up(staff, body.password)
    if not body.comment_ids:
        raise HTTPException(status_code=400, detail="실행할 댓글을 선택하세요.")
    executed = svc.execute_points(db, body.comment_ids)
    staff_auth.audit(db, request, "point_execute", user_id=staff.id,
                     detail=",".join(map(str, executed)) or "none")
    db.commit()
    return {"executed": executed, "skipped": [i for i in body.comment_ids if i not in executed]}
