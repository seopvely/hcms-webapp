import math
import os
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_

from app.core.deps import get_current_user
from app.services.email import notify_dev_request_created, notify_dev_request_comment_created
from app.db.session import get_db
from app.models.manager import Manager
from app.models.customer import (
    Managelist,
    ManagelistComment,
    MaintenanceAttachment,
    CommentAttachment,
    DevSubscription,
    PointHistory,
)

router = APIRouter(prefix="/dev-requests", tags=["dev-requests"])

STATUS_LABELS = {1: "접수", 2: "알림", 3: "처리중", 4: "완료"}
UPLOAD_DIR = "/home/pacms/media/upload_file"

ALLOWED_EXTENSIONS = {
    "jpg", "jpeg", "png", "gif", "bmp", "webp", "svg",
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "hwp", "hwpx",
    "txt", "csv",
    "zip", "rar", "7z",
}


def save_upload_file(file: UploadFile) -> tuple[str, str]:
    ext = os.path.splitext(file.filename)[1].lower().lstrip(".")
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"허용되지 않는 파일 형식입니다: {file.filename}")
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    unique_name = f"{uuid.uuid4().hex}.{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_name)
    with open(file_path, "wb") as f:
        f.write(file.file.read())
    return f"upload_file/{unique_name}", file.filename


def get_active_dev_subscription(company_id: int, db: Session) -> Optional[DevSubscription]:
    return (
        db.query(DevSubscription)
        .filter(
            DevSubscription.company_id == company_id,
            DevSubscription.status.in_(["active", "beta"]),
        )
        .first()
    )


@router.get("")
def list_dev_requests(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    search: str = Query(""),
    status: str = Query(""),
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id

    query = (
        db.query(Managelist)
        .filter(
            Managelist.company_id == company_id,
            Managelist.dev_subscription_id.isnot(None),
        )
    )

    if search:
        query = query.filter(
            or_(
                Managelist.title.ilike(f"%{search}%"),
                Managelist.contents.ilike(f"%{search}%"),
            )
        )

    if status:
        query = query.filter(Managelist.status == int(status))

    total = query.count()
    total_pages = math.ceil(total / per_page) if total > 0 else 1

    items_db = (
        query.options(joinedload(Managelist.dev_subscription))
        .order_by(Managelist.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    items = []
    for m in items_db:
        comment_count = (
            db.query(func.count(ManagelistComment.seq))
            .filter(ManagelistComment.managelist_id == m.seq)
            .scalar() or 0
        )
        items.append({
            "id": m.seq,
            "title": m.title,
            "status": m.status,
            "status_label": STATUS_LABELS.get(m.status, ""),
            "request_date": m.request_date.isoformat() if m.request_date else None,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "comment_count": comment_count,
            "points_used": m.points_used or 0,
            "plan_type": m.dev_subscription.plan_type if m.dev_subscription else None,
        })

    return {"items": items, "total": total, "page": page, "per_page": per_page, "total_pages": total_pages}


@router.post("")
async def create_dev_request(
    title: str = Form(...),
    contents: str = Form(...),
    files: Optional[List[UploadFile]] = File(None),
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id

    dev_sub = get_active_dev_subscription(company_id, db)
    if not dev_sub:
        raise HTTPException(status_code=403, detail="활성화된 개발 구독이 없습니다.")

    new_request = Managelist(
        company_id=company_id,
        project_id=None,
        dev_subscription_id=dev_sub.seq,
        title=title,
        contents=contents,
        writer_id=current_user.seq,
        request_date=datetime.now(),
        status=1,
        created_at=datetime.now(),
        points_used=0,
    )

    db.add(new_request)
    db.flush()

    if files:
        for file in files:
            if file.filename:
                file_path, original_filename = save_upload_file(file)
                db.add(MaintenanceAttachment(
                    managelist_id=new_request.seq,
                    file=file_path,
                    filename=original_filename,
                    uploaded_at=datetime.now(),
                ))

    db.commit()
    db.refresh(new_request)

    try:
        company_name = current_user.company.name if current_user.company else "Unknown"
        notify_dev_request_created(
            db=db,
            dev_request_id=new_request.seq,
            company_name=company_name,
            title=title,
            writer_name=current_user.name or "고객",
            plan_type=dev_sub.plan_type,
        )
    except Exception:
        pass

    return {"id": new_request.seq, "message": "개발 요청이 등록되었습니다."}


@router.get("/{request_id}")
def get_dev_request_detail(
    request_id: int,
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id

    item = (
        db.query(Managelist)
        .options(
            joinedload(Managelist.comments).joinedload(ManagelistComment.writer),
            joinedload(Managelist.comments).joinedload(ManagelistComment.comment_attachments),
            joinedload(Managelist.attachments),
            joinedload(Managelist.writer),
            joinedload(Managelist.dev_subscription),
        )
        .filter(
            Managelist.seq == request_id,
            Managelist.company_id == company_id,
            Managelist.dev_subscription_id.isnot(None),
        )
        .first()
    )

    if not item:
        raise HTTPException(status_code=404, detail="개발 요청을 찾을 수 없습니다.")

    attachments = [
        {"id": att.seq, "name": att.filename, "url": att.file,
         "uploaded_at": att.uploaded_at.isoformat() if att.uploaded_at else None}
        for att in item.attachments
    ]

    comments = []
    for c in item.comments:
        comment_atts = [{"id": ca.seq, "name": ca.filename, "url": ca.file} for ca in c.comment_attachments]
        comments.append({
            "id": c.seq,
            "author": c.writer.name if c.writer else None,
            "role": "manager" if c.writer_id else "customer",
            "content": c.content,
            "status": c.status,
            "point": c.point,
            "point_executed": c.point_executed,
            "completion_date": c.completion_date.isoformat() if c.completion_date else None,
            "attachment": c.attachment,
            "attachments": comment_atts,
            "parent_id": c.parent_id,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        })

    point_histories_db = (
        db.query(PointHistory)
        .filter(PointHistory.managelist_id == item.seq)
        .order_by(PointHistory.created_at.desc())
        .all()
    )
    worker_type_map = {1: "계약", 2: "기획", 3: "디자인", 4: "프론트엔드", 5: "백엔드", 6: "유지보수"}
    point_histories = [
        {
            "id": ph.seq,
            "created_at": ph.created_at.strftime("%Y-%m-%d %H:%M:%S") if ph.created_at else "",
            "content": ph.content or "",
            "point_type": ph.point_type,
            "point": abs(ph.point) if ph.point else 0,
            "status": ph.status,
            "worker_type": worker_type_map.get(ph.worker_type, "") if ph.worker_type else "",
            "point_category": ph.point_category or "1",
        }
        for ph in point_histories_db
    ]

    return {
        "id": item.seq,
        "title": item.title,
        "content": item.contents,
        "status": item.status,
        "status_label": STATUS_LABELS.get(item.status, ""),
        "request_date": item.request_date.isoformat() if item.request_date else None,
        "completion_date": item.completion_date.isoformat() if item.completion_date else None,
        "complete_date": item.complete_date.isoformat() if item.complete_date else None,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "writer_name": item.writer.name if item.writer else None,
        "points_used": item.points_used or 0,
        "plan_type": item.dev_subscription.plan_type if item.dev_subscription else None,
        "attachments": attachments,
        "comments": comments,
        "point_histories": point_histories,
    }


@router.post("/{request_id}/comments")
async def create_dev_request_comment(
    request_id: int,
    content: str = Form(...),
    parent_id: Optional[int] = Form(None),
    attachment: Optional[UploadFile] = File(None),
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id

    dev_request = (
        db.query(Managelist)
        .filter(
            Managelist.seq == request_id,
            Managelist.company_id == company_id,
            Managelist.dev_subscription_id.isnot(None),
        )
        .first()
    )

    if not dev_request:
        raise HTTPException(status_code=404, detail="개발 요청을 찾을 수 없습니다.")

    customer_name = current_user.name or "고객"
    new_comment = ManagelistComment(
        managelist_id=request_id,
        writer_id=None,
        parent_id=parent_id,
        content=f"[고객: {customer_name}] {content}",
        status=1,
        created_at=datetime.now(),
    )

    db.add(new_comment)
    db.flush()

    if attachment and attachment.filename:
        file_path, original_filename = save_upload_file(attachment)
        db.add(CommentAttachment(
            comment_id=new_comment.seq,
            file=file_path,
            filename=original_filename,
            uploaded_at=datetime.now(),
        ))

    if dev_request.status == 4:
        dev_request.status = 3

    db.commit()
    db.refresh(new_comment)

    try:
        company_name = current_user.company.name if current_user.company else "Unknown"
        notify_dev_request_comment_created(
            db=db,
            dev_request_id=request_id,
            company_name=company_name,
            request_title=dev_request.title or "",
            writer_name=current_user.name or "고객",
        )
    except Exception:
        pass

    return {"id": new_comment.seq, "message": "댓글이 등록되었습니다."}


# ─── 파일 다운로드 엔드포인트 ───────────────────────────────────────────────

MEDIA_ROOT = "/home/pacms/media"


def _build_file_path(relative_path: str) -> str:
    if relative_path.startswith("/"):
        return relative_path
    return os.path.join(MEDIA_ROOT, relative_path)


@router.get("/attachments/{attachment_id}/download")
def download_request_attachment(
    attachment_id: int,
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """요청 첨부파일 다운로드 (MaintenanceAttachment)"""
    attachment = (
        db.query(MaintenanceAttachment)
        .filter(MaintenanceAttachment.seq == attachment_id)
        .first()
    )
    if not attachment:
        raise HTTPException(status_code=404, detail="첨부파일을 찾을 수 없습니다.")

    managelist = (
        db.query(Managelist)
        .filter(
            Managelist.seq == attachment.managelist_id,
            Managelist.company_id == current_user.company_id,
        )
        .first()
    )
    if not managelist:
        raise HTTPException(status_code=403, detail="접근 권한이 없습니다.")

    file_path = _build_file_path(attachment.file)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")

    filename = attachment.filename or os.path.basename(file_path)
    return FileResponse(file_path, filename=filename, media_type="application/octet-stream")


@router.get("/comments/attachments/{attachment_id}/download")
def download_comment_attachment(
    attachment_id: int,
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """댓글 다중 첨부파일 다운로드 (CommentAttachment)"""
    attachment = (
        db.query(CommentAttachment)
        .filter(CommentAttachment.seq == attachment_id)
        .first()
    )
    if not attachment:
        raise HTTPException(status_code=404, detail="첨부파일을 찾을 수 없습니다.")

    comment = (
        db.query(ManagelistComment)
        .join(Managelist, Managelist.seq == ManagelistComment.managelist_id)
        .filter(
            ManagelistComment.seq == attachment.comment_id,
            Managelist.company_id == current_user.company_id,
        )
        .first()
    )
    if not comment:
        raise HTTPException(status_code=403, detail="접근 권한이 없습니다.")

    file_path = _build_file_path(attachment.file)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")

    filename = attachment.filename or os.path.basename(file_path)
    return FileResponse(file_path, filename=filename, media_type="application/octet-stream")


@router.get("/comments/{comment_id}/file/download")
def download_comment_legacy_file(
    comment_id: int,
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """댓글 단일 첨부파일 다운로드 (ManagelistComment.attachment 레거시 필드)"""
    comment = (
        db.query(ManagelistComment)
        .join(Managelist, Managelist.seq == ManagelistComment.managelist_id)
        .filter(
            ManagelistComment.seq == comment_id,
            Managelist.company_id == current_user.company_id,
        )
        .first()
    )
    if not comment:
        raise HTTPException(status_code=403, detail="접근 권한이 없습니다.")

    if not comment.attachment:
        raise HTTPException(status_code=404, detail="첨부파일이 없습니다.")

    file_path = _build_file_path(comment.attachment)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")

    filename = os.path.basename(file_path)
    return FileResponse(file_path, filename=filename, media_type="application/octet-stream")
