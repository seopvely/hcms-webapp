import math
import os
import uuid
import mimetypes
from datetime import datetime, date
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
    Managelist,
    ManagelistComment,
    MaintenanceAttachment,
    CommentAttachment,
    Project,
    Payment,
    PointHistory,
)

router = APIRouter(prefix="/maintenance", tags=["maintenance"])

STATUS_LABELS = {1: "접수", 2: "알림", 3: "처리중", 4: "완료"}
UPLOAD_DIR = "/home/pacms/media/upload_file"
MEDIA_ROOT = "/home/pacms/media"


def month_diff(d1: date, d2: date) -> int:
    """Calculate the number of complete months between two dates."""
    return (d2.year - d1.year) * 12 + (d2.month - d1.month)


def calculate_remaining_points(project: Project, db: Session, company_id: int) -> int:
    """
    Calculate remaining points for a project based on 6-month cycles.

    Business Rules:
    - Points are charged monthly in 6-month cycles
    - For a 12-month contract: first 6 months get monthly points,
      after those 6 months expire, the next 6 months of points are granted
    - If less than 6 months remain in contract, use remaining months × monthly_point
    - Remaining points = (available months in current cycle × monthly_point) - used_points_in_cycle
    """
    if not project.contract_date or not project.contract_termination_date:
        return 0

    if not project.point or project.point <= 0:
        return 0

    # Convert to date if datetime
    contract_start = project.contract_date.date() if isinstance(project.contract_date, datetime) else project.contract_date
    contract_end = project.contract_termination_date.date() if isinstance(project.contract_termination_date, datetime) else project.contract_termination_date
    today = datetime.now().date()

    # Check if contract has started or expired
    if today < contract_start or today > contract_end:
        return 0

    # Calculate total contract months and elapsed months
    total_contract_months = month_diff(contract_start, contract_end)
    months_elapsed = month_diff(contract_start, today)

    # Determine which 6-month cycle we're in
    current_cycle_index = months_elapsed // 6
    cycle_start_month = current_cycle_index * 6
    cycle_end_month = min((current_cycle_index + 1) * 6, total_contract_months)
    months_in_current_cycle = cycle_end_month - cycle_start_month

    # Available points = total months in current cycle × monthly allocation
    available_points = months_in_current_cycle * project.point

    # Calculate the date range for the current cycle
    try:
        from dateutil.relativedelta import relativedelta
        cycle_start_date = contract_start + relativedelta(months=cycle_start_month)
        cycle_end_date = contract_start + relativedelta(months=cycle_end_month)
    except:
        # Fallback: use simple calculation without dateutil
        cycle_start_date = contract_start
        cycle_end_date = contract_end

    # Query used points in the current cycle
    # Only count PointHistory with point_type=2 (사용), status=2 (실행)
    used_points_in_cycle = (
        db.query(func.sum(PointHistory.point))
        .filter(
            PointHistory.project_id == project.seq,
            PointHistory.company_id == company_id,
            PointHistory.point_type == 2,  # 사용
            PointHistory.status == 2,       # 실행
            PointHistory.created_at >= cycle_start_date,
            PointHistory.created_at <= cycle_end_date,
        )
        .scalar()
    ) or 0

    # Remaining points = available - used, never below 0
    remaining_points = max(0, available_points - abs(used_points_in_cycle))

    return remaining_points


def save_upload_file(file: UploadFile) -> tuple[str, str]:
    """Save uploaded file and return (file_path, original_filename)"""
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename)[1]
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_name)
    with open(file_path, "wb") as f:
        f.write(file.file.read())
    return f"upload_file/{unique_name}", file.filename


@router.get("/projects")
def get_available_projects(
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get list of all projects belonging to the company"""
    company_id = current_user.company_id

    projects = (
        db.query(Project)
        .filter(Project.company_id == company_id)
        .all()
    )

    result = []
    for project in projects:
        # Check payment status
        payment = (
            db.query(Payment)
            .filter(
                Payment.project_id == project.seq,
                Payment.payment_status == 1  # 결제완료
            )
            .first()
        )

        # Check contract period
        now = datetime.now().date()
        contract_valid = False
        if project.contract_date and project.contract_termination_date:
            contract_start = project.contract_date.date() if isinstance(project.contract_date, datetime) else project.contract_date
            contract_end = project.contract_termination_date.date() if isinstance(project.contract_termination_date, datetime) else project.contract_termination_date
            contract_valid = contract_start <= now <= contract_end

        # Calculate remaining points using 6-month cycle logic
        remaining_points = calculate_remaining_points(project, db, company_id)

        # Permit if payment complete, contract valid, and has remaining points
        permit = bool(payment) and contract_valid and remaining_points > 0

        result.append({
            "id": project.seq,
            "title": project.title,
            "permit": permit,
            "remaining_points": remaining_points,
            "contract_status": "active" if contract_valid else "expired",
            "contract_date": project.contract_date.isoformat() if project.contract_date else None,
            "contract_termination_date": project.contract_termination_date.isoformat() if project.contract_termination_date else None,
        })

    return {"projects": result}


@router.get("")
def list_maintenance(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    search: str = Query("", description="Search in title"),
    status: str = Query("", description="Filter by status (1-4)"),
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id

    query = db.query(Managelist).filter(Managelist.company_id == company_id)

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
        query.options(joinedload(Managelist.project))
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
            .scalar()
            or 0
        )
        items.append(
            {
                "id": m.seq,
                "title": m.title,
                "status": m.status,
                "status_label": STATUS_LABELS.get(m.status, ""),
                "request_date": m.request_date.isoformat() if m.request_date else None,
                "created_at": m.created_at.isoformat() if m.created_at else None,
                "views_count": comment_count,
                "project_title": m.project.title if m.project else None,
                "points_used": m.points_used or 0,
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
async def create_maintenance(
    project_id: int = Form(...),
    title: str = Form(...),
    contents: str = Form(...),
    files: Optional[List[UploadFile]] = File(None),
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new maintenance request with optional file attachments"""
    company_id = current_user.company_id

    # Verify project belongs to company
    project = (
        db.query(Project)
        .filter(
            Project.seq == project_id,
            Project.company_id == company_id
        )
        .first()
    )

    if not project:
        raise HTTPException(status_code=404, detail="Project not found or not accessible")

    # Verify payment status
    payment = (
        db.query(Payment)
        .filter(
            Payment.project_id == project_id,
            Payment.payment_status == 1  # 결제완료
        )
        .first()
    )

    if not payment:
        raise HTTPException(status_code=400, detail="Project payment not completed")

    # Create maintenance request
    new_maintenance = Managelist(
        company_id=company_id,
        project_id=project_id,
        title=title,
        contents=contents,
        writer_id=current_user.seq,
        request_date=datetime.now(),
        status=1,  # 접수
        created_at=datetime.now(),
        points_used=0,
    )

    db.add(new_maintenance)
    db.flush()  # Get the seq for attachments

    # Handle file uploads
    if files:
        for file in files:
            if file.filename:
                file_path, original_filename = save_upload_file(file)
                attachment = MaintenanceAttachment(
                    managelist_id=new_maintenance.seq,
                    file=file_path,
                    filename=original_filename,
                    uploaded_at=datetime.now(),
                )
                db.add(attachment)

    db.commit()
    db.refresh(new_maintenance)

    return {
        "id": new_maintenance.seq,
        "message": "Maintenance request created successfully",
    }


@router.post("/{maintenance_id}/comments")
async def create_maintenance_comment(
    maintenance_id: int,
    content: str = Form(...),
    parent_id: Optional[int] = Form(None),
    attachment: Optional[UploadFile] = File(None),
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a customer comment to a maintenance request"""
    company_id = current_user.company_id

    # Verify maintenance belongs to company
    maintenance = (
        db.query(Managelist)
        .filter(
            Managelist.seq == maintenance_id,
            Managelist.company_id == company_id
        )
        .first()
    )

    if not maintenance:
        raise HTTPException(status_code=404, detail="Maintenance request not found")

    # Verify parent comment belongs to same maintenance
    if parent_id:
        parent_comment = (
            db.query(ManagelistComment)
            .filter(
                ManagelistComment.seq == parent_id,
                ManagelistComment.managelist_id == maintenance_id
            )
            .first()
        )
        if not parent_comment:
            raise HTTPException(status_code=404, detail="Parent comment not found")

    # Prefix customer name to content
    customer_name = current_user.name or "고객"
    prefixed_content = f"[고객: {customer_name}] {content}"

    # Create comment
    new_comment = ManagelistComment(
        managelist_id=maintenance_id,
        writer_id=None,  # Customer comments have no writer_id
        parent_id=parent_id,
        content=prefixed_content,
        status=1,
        created_at=datetime.now(),
    )

    db.add(new_comment)
    db.flush()  # Get the seq for attachment

    # Handle file attachment
    if attachment and attachment.filename:
        file_path, original_filename = save_upload_file(attachment)
        comment_attachment = CommentAttachment(
            comment_id=new_comment.seq,
            file=file_path,
            filename=original_filename,
            uploaded_at=datetime.now(),
        )
        db.add(comment_attachment)

    # If maintenance status is 완료(4), change to 처리중(3)
    if maintenance.status == 4:
        maintenance.status = 3

    db.commit()
    db.refresh(new_comment)

    return {
        "id": new_comment.seq,
        "message": "Comment added successfully",
    }


@router.get("/attachments/{attachment_id}/download")
def download_maintenance_attachment(
    attachment_id: int,
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download a MaintenanceAttachment file"""
    company_id = current_user.company_id

    # Get attachment and verify authorization via managelist
    attachment = (
        db.query(MaintenanceAttachment)
        .join(Managelist, MaintenanceAttachment.managelist_id == Managelist.seq)
        .filter(
            MaintenanceAttachment.seq == attachment_id,
            Managelist.company_id == company_id
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


@router.get("/comments/attachments/{attachment_id}/download")
def download_comment_attachment(
    attachment_id: int,
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download a CommentAttachment file"""
    company_id = current_user.company_id

    # Get attachment and verify authorization via comment -> managelist
    attachment = (
        db.query(CommentAttachment)
        .join(ManagelistComment, CommentAttachment.comment_id == ManagelistComment.seq)
        .join(Managelist, ManagelistComment.managelist_id == Managelist.seq)
        .filter(
            CommentAttachment.seq == attachment_id,
            Managelist.company_id == company_id
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


@router.get("/comments/{comment_id}/file/download")
def download_comment_legacy_file(
    comment_id: int,
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download legacy comment attachment from ManagelistComment.attachment field"""
    company_id = current_user.company_id

    # Get comment and verify authorization via managelist
    comment = (
        db.query(ManagelistComment)
        .join(Managelist, ManagelistComment.managelist_id == Managelist.seq)
        .filter(
            ManagelistComment.seq == comment_id,
            Managelist.company_id == company_id
        )
        .first()
    )

    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    if not comment.attachment:
        raise HTTPException(status_code=404, detail="No attachment for this comment")

    # Construct full file path
    full_path = os.path.join(MEDIA_ROOT, comment.attachment)

    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    # Extract filename from path
    filename = os.path.basename(comment.attachment)

    # Guess content type
    content_type, _ = mimetypes.guess_type(filename)
    if not content_type:
        content_type = "application/octet-stream"

    # Handle Korean filenames with URL encoding
    encoded_filename = quote(filename)

    return FileResponse(
        path=full_path,
        media_type=content_type,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
        }
    )


@router.get("/{maintenance_id}")
def get_maintenance_detail(
    maintenance_id: int,
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
            joinedload(Managelist.project),
            joinedload(Managelist.writer),
        )
        .filter(Managelist.seq == maintenance_id, Managelist.company_id == company_id)
        .first()
    )

    if not item:
        raise HTTPException(status_code=404, detail="Maintenance request not found")

    attachments = []
    for att in item.attachments:
        attachments.append(
            {
                "id": att.seq,
                "name": att.filename,
                "url": att.file,
                "uploaded_at": att.uploaded_at.isoformat() if att.uploaded_at else None,
            }
        )

    comments = []
    for c in item.comments:
        comment_atts = []
        for ca in c.comment_attachments:
            comment_atts.append(
                {
                    "id": ca.seq,
                    "name": ca.filename,
                    "url": ca.file,
                }
            )
        comments.append(
            {
                "id": c.seq,
                "author": c.writer.name if c.writer else None,
                "role": "manager" if c.writer_id else "customer",
                "content": c.content,
                "status": c.status,
                "point": c.point,
                "point_executed": c.point_executed,
                "completion_date": (
                    c.completion_date.isoformat() if c.completion_date else None
                ),
                "attachment": c.attachment,
                "attachments": comment_atts,
                "parent_id": c.parent_id,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
        )

    return {
        "id": item.seq,
        "title": item.title,
        "content": item.contents,
        "status": item.status,
        "status_label": STATUS_LABELS.get(item.status, ""),
        "request_date": item.request_date.isoformat() if item.request_date else None,
        "completion_date": (
            item.completion_date.isoformat() if item.completion_date else None
        ),
        "complete_date": (
            item.complete_date.isoformat() if item.complete_date else None
        ),
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "writer_name": item.writer.name if item.writer else None,
        "project_title": item.project.title if item.project else None,
        "points_used": item.points_used or 0,
        "attachments": attachments,
        "comments": comments,
    }
