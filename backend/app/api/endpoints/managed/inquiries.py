"""직원 고객문의 API (/api/managed/inquiries) — cms oneperone + inquiry_list + inquiry_detail 통합."""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.api.endpoints.managed.common import apply_sort, code, page_response, require_write, write_enabled
from app.core.deps import get_current_staff
from app.db.session import SessionLocal, get_db
from app.models.company import Company
from app.models.customer import CustomAuthUser, Inquiry, InquiryAnswer, InquiryAttachment, RecentActivity
from app.models.manager import Manager
from app.services import staff_auth
from app.services.email import notify_customer_inquiry_answer
from app.services.push import send_push_to_company
from app.utils.html_sanitize import html_to_text, sanitize_html
from app.utils.media import file_download_response, save_upload

router = APIRouter(prefix="/inquiries", tags=["managed-inquiries"])
WRITE = require_write("inquiries")

STATUS_LABELS = {"1": "대기중", "2": "진행중", "3": "답변완료", "4": "완료(구버전)"}
TYPE_LABELS = {"1": "버그 신고", "2": "디자인 변경", "3": "기능 추가", "4": "기술 지원", "5": "성능 개선", "6": "권한 문제", "7": "기타"}


def _iso(v):
    return v.isoformat() if v else None


@router.get("")
def list_inquiries(
    company_id: int | None = None,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    sort: str | None = Query(None, description="seq|title|status|created_at|answered_at, '-' 접두 = 내림차순"),
    db: Session = Depends(get_db),
):
    query = db.query(Inquiry).outerjoin(Company, Inquiry.company_id == Company.seq)
    if company_id:
        query = query.filter(Inquiry.company_id == company_id)
    if status == "open":
        query = query.filter(Inquiry.status.in_(["1", "2"]))
    elif status:
        query = query.filter(Inquiry.status == status)
    if date_from:
        query = query.filter(Inquiry.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.filter(Inquiry.created_at < datetime.combine(date_to + timedelta(days=1), datetime.min.time()))
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(Inquiry.title.like(like), Inquiry.contents.like(like), Company.name.like(like)))
    total = query.count()
    query = apply_sort(query, sort, {"seq": Inquiry.seq, "title": Inquiry.title, "status": Inquiry.status, "created_at": Inquiry.created_at,
                                     "answered_at": Inquiry.answered_at}, [Inquiry.created_at.desc()])
    rows = query.offset((page - 1) * per_page).limit(per_page).all()
    ids = [r.seq for r in rows]
    answers = dict(db.query(InquiryAnswer.inquiry_id, func.count(InquiryAnswer.seq)).filter(InquiryAnswer.inquiry_id.in_(ids)).group_by(InquiryAnswer.inquiry_id)) if ids else {}
    # 마지막 답글이 고객이면 직원 확인 필요
    last = {}
    for a in db.query(InquiryAnswer).filter(InquiryAnswer.inquiry_id.in_(ids)).order_by(InquiryAnswer.created_at) if ids else []:
        last[a.inquiry_id] = code(a.writer_type)
    companies = {c.seq: c.name for c in db.query(Company).filter(Company.seq.in_({r.company_id for r in rows}))} if rows else {}
    writers = {m.seq: m.name for m in db.query(Manager).filter(Manager.seq.in_({r.writer_id for r in rows}))} if rows else {}
    items = [{
        "seq": r.seq,
        "title": r.title,
        "company_name": companies.get(r.company_id),
        "writer_name": writers.get(r.writer_id),
        "inquiry_type_label": TYPE_LABELS.get(code(r.inquiry_type) or "", "-"),
        "status": code(r.status),
        "status_label": STATUS_LABELS.get(code(r.status) or "", "-"),
        "created_at": _iso(r.created_at),
        "answered_at": _iso(r.answered_at),
        "answer_count": answers.get(r.seq, 0),
        "customer_replied_last": last.get(r.seq) == "2",
    } for r in rows]
    return page_response(items, total, page, per_page)


@router.get("/{seq}")
def get_inquiry(seq: int, db: Session = Depends(get_db)):
    r = db.query(Inquiry).filter(Inquiry.seq == seq).first()
    if r is None:
        raise HTTPException(status_code=404, detail="문의를 찾을 수 없습니다.")
    company = db.query(Company).filter(Company.seq == r.company_id).first()
    writer = db.query(Manager).filter(Manager.seq == r.writer_id).first()
    answers = db.query(InquiryAnswer).filter(InquiryAnswer.inquiry_id == seq).order_by(InquiryAnswer.created_at).all()
    staff_names = {u.id: (u.name or u.username) for u in db.query(CustomAuthUser).filter(CustomAuthUser.id.in_({a.admin_writer_id for a in answers if a.admin_writer_id}))}
    customer_names = {m.seq: m.name for m in db.query(Manager).filter(Manager.seq.in_({a.customer_writer_id for a in answers if a.customer_writer_id}))}
    attachments = db.query(InquiryAttachment).filter(InquiryAttachment.inquiry_id == seq).all()
    return {
        "seq": r.seq,
        "title": r.title,
        "contents": sanitize_html(r.contents),
        "company_id": r.company_id,
        "company_name": company.name if company else None,
        "writer_name": writer.name if writer else None,
        "writer_email": writer.email if writer else None,
        "inquiry_type_label": TYPE_LABELS.get(code(r.inquiry_type) or "", "-"),
        "status": code(r.status),
        "status_label": STATUS_LABELS.get(code(r.status) or "", "-"),
        "created_at": _iso(r.created_at),
        "answered_at": _iso(r.answered_at),
        "attachments": [{"id": a.seq, "filename": a.filename} for a in attachments],
        "has_legacy_file": bool(r.inquiry_file),
        "answers": [{
            "seq": a.seq,
            "parent_answer_id": a.parent_answer_id,
            "is_staff": code(a.writer_type) == "1",
            "writer_name": staff_names.get(a.admin_writer_id) if code(a.writer_type) == "1" else customer_names.get(a.customer_writer_id, "고객"),
            "content": sanitize_html(a.content),
            "has_file": bool(a.answer_file),
            "created_at": _iso(a.created_at),
        } for a in answers],
        "write_enabled": write_enabled("inquiries"),
    }


@router.get("/files/attachment/{attachment_id}")
def download_attachment(attachment_id: int, db: Session = Depends(get_db)):
    a = db.query(InquiryAttachment).filter(InquiryAttachment.seq == attachment_id).first()
    if a is None:
        raise HTTPException(status_code=404, detail="첨부를 찾을 수 없습니다.")
    return file_download_response(a.file, a.filename)


@router.get("/files/legacy/{seq}")
def download_legacy(seq: int, db: Session = Depends(get_db)):
    r = db.query(Inquiry).filter(Inquiry.seq == seq).first()
    if r is None or not r.inquiry_file:
        raise HTTPException(status_code=404, detail="첨부를 찾을 수 없습니다.")
    return file_download_response(r.inquiry_file)


@router.get("/files/answer/{answer_id}")
def download_answer_file(answer_id: int, db: Session = Depends(get_db)):
    a = db.query(InquiryAnswer).filter(InquiryAnswer.seq == answer_id).first()
    if a is None or not a.answer_file:
        raise HTTPException(status_code=404, detail="첨부를 찾을 수 없습니다.")
    return file_download_response(a.answer_file)


def _notify_answer(inquiry_id: int, writer_name: str) -> None:
    db = SessionLocal()
    try:
        r = db.query(Inquiry).filter(Inquiry.seq == inquiry_id).first()
        if r is None:
            return
        company = db.query(Company).filter(Company.seq == r.company_id).first()
        emails = {m.email for m in db.query(Manager).filter(Manager.company_id == r.company_id) if m.email}
        notify_customer_inquiry_answer(emails, company.name if company else "", r.seq, r.title, writer_name)
        send_push_to_company(db, r.company_id, "문의 답변 등록", f"{r.title or ''} 문의에 답변이 등록되었습니다.",
                             {"type": "inquiry_answer", "target_id": str(r.seq), "route": f"/inquiries/{r.seq}"})
    finally:
        db.close()


@router.post("/{seq}/answers", dependencies=[WRITE])
def add_answer(
    seq: int,
    request: Request,
    background: BackgroundTasks,
    content: str = Form(...),
    status: str = Form("3"),
    parent_answer_id: int | None = Form(None),
    answer_file: UploadFile | None = File(None),
    staff: CustomAuthUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
):
    if status not in ("1", "2", "3"):
        raise HTTPException(status_code=400, detail="상태 값이 올바르지 않습니다.")
    if not html_to_text(content):
        raise HTTPException(status_code=400, detail="답변 내용을 입력하세요.")
    r = db.query(Inquiry).filter(Inquiry.seq == seq).with_for_update().first()
    if r is None:
        raise HTTPException(status_code=404, detail="문의를 찾을 수 없습니다.")
    stored = save_upload(answer_file, "inquiry_answer_files")[0] if answer_file and answer_file.filename else None
    now = datetime.now()
    db.add(InquiryAnswer(
        inquiry_id=seq, content=sanitize_html(content), writer_type="1", admin_writer_id=staff.id,
        parent_answer_id=parent_answer_id, answer_file=stored, created_at=now, updated_at=now,
    ))
    r.status = status
    r.updated_at = now
    if not r.answered_at and status == "3":
        r.answered_at = now
    if r.company_id and r.writer_id:
        db.add(RecentActivity(company_id=r.company_id, writer_id=r.writer_id,
                              activity=f"문의사항 '{r.title}'에 답변이 등록되었습니다."[:255], created_at=now))
    staff_auth.audit(db, request, "inquiry_answer", user_id=staff.id, target=f"inquiry:{seq}")
    db.commit()
    background.add_task(_notify_answer, seq, staff.name or staff.username)
    return {"ok": True}


class StatusUpdate(BaseModel):
    status: str


@router.post("/{seq}/status", dependencies=[WRITE])
def update_status(seq: int, body: StatusUpdate, db: Session = Depends(get_db)):
    if body.status not in ("1", "2", "3"):
        raise HTTPException(status_code=400, detail="상태 값이 올바르지 않습니다.")
    r = db.query(Inquiry).filter(Inquiry.seq == seq).first()
    if r is None:
        raise HTTPException(status_code=404, detail="문의를 찾을 수 없습니다.")
    r.status = body.status
    r.updated_at = datetime.now()
    db.commit()
    return {"ok": True}
