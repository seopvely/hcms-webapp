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
from sqlalchemy import func

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.manager import Manager
from app.models.customer import Inditask, InditaskComment

router = APIRouter(prefix="/tasks", tags=["tasks"])

UPLOAD_DIR = "/home/pacms/media/upload_file"
MEDIA_ROOT = "/home/pacms/media"
ALLOWED_EXTENSIONS = {
    "jpg", "jpeg", "png", "gif", "bmp", "webp", "svg",
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "hwp", "hwpx",
    "txt", "csv", "zip", "rar", "7z",
}

TASK_TYPE_LABELS = {
    1: "계약",
    2: "기획",
    3: "디자인",
    4: "프론트엔드",
    5: "백엔드",
    6: "유지보수",
    7: "기타",
}

TASK_STATUS_LABELS = {
    1: "접수",
    2: "진행중",
    3: "검수",
    4: "완료",
}


def save_upload_file(file: UploadFile) -> tuple[str, str]:
    """Save uploaded file and return (relative_path, original_filename)"""
    ext = os.path.splitext(file.filename)[1].lower().lstrip(".")
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"허용되지 않는 파일 형식입니다: {file.filename}")
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    unique_name = f"{uuid.uuid4().hex}.{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_name)
    with open(file_path, "wb") as f:
        f.write(file.file.read())
    return f"upload_file/{unique_name}", file.filename


@router.get("")
def list_tasks(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    search: str = Query("", description="Search in title"),
    status: str = Query("", description="Filter by task_status (1-4)"),
    task_type: str = Query("", description="Filter by task_type (1-7)"),
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id

    query = db.query(Inditask).filter(Inditask.company_id == company_id)

    if search:
        query = query.filter(Inditask.title.ilike(f"%{search}%"))

    if status:
        query = query.filter(Inditask.task_status == int(status))

    if task_type:
        query = query.filter(Inditask.task_type == int(task_type))

    total = query.count()
    total_pages = math.ceil(total / per_page) if total > 0 else 1

    items_db = (
        query.options(joinedload(Inditask.project))
        .order_by(Inditask.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    items = []
    for t in items_db:
        comment_count = (
            db.query(func.count(InditaskComment.seq))
            .filter(InditaskComment.inditask_id == t.seq)
            .scalar()
            or 0
        )
        items.append(
            {
                "id": t.seq,
                "title": t.title,
                "task_type": t.task_type,
                "task_type_label": TASK_TYPE_LABELS.get(t.task_type, ""),
                "status": t.task_status,
                "status_label": TASK_STATUS_LABELS.get(t.task_status, ""),
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "deadline": t.deadline.isoformat() if t.deadline else None,
                "project_title": t.project.title if t.project else None,
                "views": comment_count,
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
async def create_task(
    title: str = Form(...),
    task_type: int = Form(...),
    content: str = Form(...),
    files: Optional[List[UploadFile]] = File(None),
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new inditask (건별의뢰)"""
    company_id = current_user.company_id

    # Create the task
    new_task = Inditask(
        title=title,
        company_id=company_id,
        task_type=task_type,
        content=content,
        writer_id=current_user.seq,
        task_status=1,  # 대기
        created_at=datetime.now(),
    )
    db.add(new_task)
    db.flush()

    # Handle file uploads - create separate Inditask entries for each file (matching pacms behavior)
    if files:
        for file in files:
            if file.filename:
                file_path, _ = save_upload_file(file)
                file_task = Inditask(
                    title=title,
                    company_id=company_id,
                    task_type=task_type,
                    content=content,
                    writer_id=current_user.seq,
                    task_status=1,
                    inditask_file=file_path,
                    created_at=datetime.now(),
                )
                db.add(file_task)

    db.commit()
    db.refresh(new_task)

    return {"id": new_task.seq, "message": "건별의뢰가 등록되었습니다."}


@router.get("/file/download/{task_id}")
def download_task_file(
    task_id: int,
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download inditask file"""
    company_id = current_user.company_id
    task = db.query(Inditask).filter(Inditask.seq == task_id, Inditask.company_id == company_id).first()
    if not task or not task.inditask_file:
        raise HTTPException(status_code=404, detail="File not found")
    full_path = os.path.join(MEDIA_ROOT, task.inditask_file)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    filename = os.path.basename(task.inditask_file)
    content_type, _ = mimetypes.guess_type(filename)
    if not content_type:
        content_type = "application/octet-stream"
    encoded_filename = quote(filename)
    return FileResponse(
        path=full_path,
        media_type=content_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"}
    )


@router.get("/{task_id}")
def get_task_detail(
    task_id: int,
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id

    item = (
        db.query(Inditask)
        .options(
            joinedload(Inditask.task_comments).joinedload(InditaskComment.writer),
            joinedload(Inditask.project),
            joinedload(Inditask.writer),
            joinedload(Inditask.worker),
        )
        .filter(Inditask.seq == task_id, Inditask.company_id == company_id)
        .first()
    )

    if not item:
        raise HTTPException(status_code=404, detail="Task not found")

    comments = []
    for c in item.task_comments:
        comments.append(
            {
                "id": c.seq,
                "author": c.writer.name if c.writer else None,
                "content": c.content,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
        )

    return {
        "id": item.seq,
        "title": item.title,
        "content": item.content,
        "task_type": item.task_type,
        "task_type_label": TASK_TYPE_LABELS.get(item.task_type, ""),
        "status": item.task_status,
        "status_label": TASK_STATUS_LABELS.get(item.task_status, ""),
        "request_date": item.requestDate.isoformat() if item.requestDate else None,
        "work_date": item.work_date.isoformat() if item.work_date else None,
        "deadline": item.deadline.isoformat() if item.deadline else None,
        "budget": item.budget or 0,
        "estimated_hours": item.estimated_hours,
        "actual_hours": item.actual_hours,
        "writer_name": item.writer.name if item.writer else None,
        "worker_name": item.worker.name if item.worker else None,
        "project_title": item.project.title if item.project else None,
        "inditask_file": item.inditask_file,
        "inditask_comment": item.inditask_comment,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "comments": comments,
    }
