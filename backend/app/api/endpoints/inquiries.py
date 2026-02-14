import math
import os
import uuid
import mimetypes
from datetime import datetime
from typing import List, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.manager import Manager
from app.models.customer import (
    Inquiry,
    InquiryAnswer,
    InquiryAttachment,
)

router = APIRouter(prefix="/inquiries", tags=["inquiries"])

INQUIRY_TYPE_LABELS = {
    1: "버그 신고",
    2: "디자인 변경",
    3: "기능 추가",
    4: "기술 지원",
    5: "성능 개선",
    6: "권한 문제",
    7: "기타"
}
INQUIRY_STATUS_LABELS = {1: "대기중", 2: "진행중", 3: "답변완료"}
UPLOAD_DIR = "/home/pacms/media/upload_file"
MEDIA_ROOT = "/home/pacms/media"

ALLOWED_EXTENSIONS = {
    "jpg", "jpeg", "png", "gif", "bmp", "webp", "svg",
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "hwp", "hwpx",
    "txt", "csv",
    "zip", "rar", "7z",
}


def save_upload_file(file: UploadFile) -> tuple[str, str]:
    """Save uploaded file and return (file_path, original_filename)"""
    ext = os.path.splitext(file.filename)[1].lower().lstrip(".")
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"허용되지 않는 파일 형식입니다: {file.filename}"
        )
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    unique_name = f"{uuid.uuid4().hex}.{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_name)
    with open(file_path, "wb") as f:
        f.write(file.file.read())
    return f"upload_file/{unique_name}", file.filename


@router.get("")
def list_inquiries(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    search: str = Query("", description="Search in title"),
    status: str = Query("", description="Filter by status (1-3)"),
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id

    query = db.query(Inquiry).filter(Inquiry.company_id == company_id)

    if search:
        query = query.filter(
            or_(
                Inquiry.title.ilike(f"%{search}%"),
                Inquiry.contents.ilike(f"%{search}%"),
            )
        )

    if status:
        query = query.filter(Inquiry.status == int(status))

    total = query.count()
    total_pages = math.ceil(total / per_page) if total > 0 else 1

    items_db = (
        query.order_by(Inquiry.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    items = []
    for inq in items_db:
        answer_count = (
            db.query(func.count(InquiryAnswer.seq))
            .filter(InquiryAnswer.inquiry_id == inq.seq)
            .scalar()
            or 0
        )
        items.append(
            {
                "id": inq.seq,
                "title": inq.title,
                "status": inq.status,
                "status_label": INQUIRY_STATUS_LABELS.get(inq.status, ""),
                "inquiry_type": inq.inquiry_type,
                "inquiry_type_label": INQUIRY_TYPE_LABELS.get(inq.inquiry_type, ""),
                "created_at": inq.created_at.isoformat() if inq.created_at else None,
                "answer_count": answer_count,
            }
        )

    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": total_pages,
    }


@router.post("")
async def create_inquiry(
    title: str = Form(...),
    contents: str = Form(...),
    inquiry_type: int = Form(...),
    files: Optional[List[UploadFile]] = File(None),
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new inquiry with optional file attachments"""
    company_id = current_user.company_id

    # Create inquiry
    new_inquiry = Inquiry(
        company_id=company_id,
        writer_id=current_user.seq,
        title=title,
        contents=contents,
        inquiry_type=inquiry_type,
        status=1,  # 대기중
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )

    db.add(new_inquiry)
    db.flush()  # Get the seq for attachments

    # Handle file uploads
    if files:
        for file in files:
            if file.filename:
                file_path, original_filename = save_upload_file(file)
                attachment = InquiryAttachment(
                    inquiry_id=new_inquiry.seq,
                    file=file_path,
                    filename=original_filename,
                    uploaded_at=datetime.now(),
                )
                db.add(attachment)

    db.commit()
    db.refresh(new_inquiry)

    return {
        "id": new_inquiry.seq,
        "message": "Inquiry created successfully",
    }


@router.get("/attachments/{attachment_id}/download")
def download_inquiry_attachment(
    attachment_id: int,
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download an InquiryAttachment file"""
    company_id = current_user.company_id

    # Get attachment and verify authorization via inquiry
    attachment = (
        db.query(InquiryAttachment)
        .join(Inquiry, InquiryAttachment.inquiry_id == Inquiry.seq)
        .filter(
            InquiryAttachment.seq == attachment_id,
            Inquiry.company_id == company_id
        )
        .first()
    )

    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    # Construct full file path
    full_path = os.path.join(MEDIA_ROOT, attachment.file)

    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    # Guess content type
    content_type, _ = mimetypes.guess_type(attachment.filename)
    if not content_type:
        content_type = "application/octet-stream"

    # Handle Korean filenames with URL encoding
    encoded_filename = quote(attachment.filename)

    return FileResponse(
        path=full_path,
        media_type=content_type,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
        }
    )


@router.get("/{inquiry_id}")
def get_inquiry_detail(
    inquiry_id: int,
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id

    item = (
        db.query(Inquiry)
        .options(
            joinedload(Inquiry.answers).joinedload(InquiryAnswer.admin_writer),
            joinedload(Inquiry.answers).joinedload(InquiryAnswer.customer_writer),
            joinedload(Inquiry.inquiry_attachments),
            joinedload(Inquiry.writer),
        )
        .filter(Inquiry.seq == inquiry_id, Inquiry.company_id == company_id)
        .first()
    )

    if not item:
        raise HTTPException(status_code=404, detail="Inquiry not found")

    attachments = []
    for att in item.inquiry_attachments:
        attachments.append(
            {
                "id": att.seq,
                "name": att.filename,
                "url": att.file,
                "uploaded_at": att.uploaded_at.isoformat() if att.uploaded_at else None,
            }
        )

    answers = []
    for ans in item.answers:
        # Determine author name and role
        if ans.writer_type == 1:  # 관리자
            author = ans.admin_writer.name if ans.admin_writer else None
            role = "admin"
        else:  # 고객
            author = ans.customer_writer.name if ans.customer_writer else None
            role = "customer"

        answers.append(
            {
                "id": ans.seq,
                "author": author,
                "role": role,
                "content": ans.content,
                "parent_answer_id": ans.parent_answer_id,
                "created_at": ans.created_at.isoformat() if ans.created_at else None,
            }
        )

    return {
        "id": item.seq,
        "title": item.title,
        "content": item.contents,
        "status": item.status,
        "status_label": INQUIRY_STATUS_LABELS.get(item.status, ""),
        "inquiry_type": item.inquiry_type,
        "inquiry_type_label": INQUIRY_TYPE_LABELS.get(item.inquiry_type, ""),
        "priority": item.priority,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
        "writer_name": item.writer.name if item.writer else None,
        "attachments": attachments,
        "answers": answers,
    }


@router.post("/{inquiry_id}/answers")
async def create_inquiry_answer(
    inquiry_id: int,
    content: str = Form(...),
    parent_answer_id: Optional[int] = Form(None),
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a customer answer to an inquiry"""
    company_id = current_user.company_id

    # Verify inquiry belongs to company
    inquiry = (
        db.query(Inquiry)
        .filter(
            Inquiry.seq == inquiry_id,
            Inquiry.company_id == company_id
        )
        .first()
    )

    if not inquiry:
        raise HTTPException(status_code=404, detail="Inquiry not found")

    # Verify parent answer belongs to same inquiry
    if parent_answer_id:
        parent_answer = (
            db.query(InquiryAnswer)
            .filter(
                InquiryAnswer.seq == parent_answer_id,
                InquiryAnswer.inquiry_id == inquiry_id
            )
            .first()
        )
        if not parent_answer:
            raise HTTPException(status_code=404, detail="Parent answer not found")

    # Create answer
    new_answer = InquiryAnswer(
        inquiry_id=inquiry_id,
        content=content,
        writer_type=2,  # 고객
        customer_writer_id=current_user.seq,
        parent_answer_id=parent_answer_id,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )

    db.add(new_answer)
    db.commit()
    db.refresh(new_answer)

    return {
        "id": new_answer.seq,
        "message": "Answer added successfully",
    }
