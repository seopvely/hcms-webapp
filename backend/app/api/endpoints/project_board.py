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
    Project,
    ProjectBoardCategory,
    ProjectBoard,
    ProjectBoardComment,
    ProjectBoardAttachment,
    ProjectBoardCommentAttachment,
    project_board_categories,
)

router = APIRouter(prefix="/project-board", tags=["project-board"])

STATUS_LABELS = {"1": "진행중", "2": "완료", "3": "보류"}
UPLOAD_DIR = "/home/pacms/media/project_board_files"
COMMENT_UPLOAD_DIR = "/home/pacms/media/project_board_comment_files"
MEDIA_ROOT = "/home/pacms/media"

ALLOWED_EXTENSIONS = {
    "jpg", "jpeg", "png", "gif", "bmp", "webp", "svg",
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "hwp", "hwpx",
    "txt", "csv",
    "zip", "rar", "7z",
}


def save_upload_file(file: UploadFile, upload_dir: str) -> tuple[str, str, int]:
    ext = os.path.splitext(file.filename)[1].lower().lstrip(".")
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"허용되지 않는 파일 형식입니다: {file.filename}"
        )
    now = datetime.now()
    date_path = now.strftime("%Y/%m/%d")
    full_dir = os.path.join(upload_dir, date_path)
    os.makedirs(full_dir, exist_ok=True)

    unique_name = f"{uuid.uuid4().hex}.{ext}"
    file_path = os.path.join(full_dir, unique_name)
    content = file.file.read()
    file_size = len(content)
    with open(file_path, "wb") as f:
        f.write(content)

    relative_dir = os.path.basename(upload_dir)
    return f"{relative_dir}/{date_path}/{unique_name}", file.filename, file_size


# === 프로젝트/카테고리 조회 ===


@router.get("/projects")
def list_company_projects(
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id
    today = date.today()

    projects = (
        db.query(Project)
        .filter(
            Project.company_id == company_id,
            Project.contract_date <= today,
        )
        .order_by(Project.created_at.desc())
        .all()
    )

    items = []
    for p in projects:
        is_active = (
            p.contract_termination_date is not None
            and p.contract_termination_date >= today
        )
        items.append({
            "id": p.seq,
            "title": p.title,
            "is_active": is_active,
            "contract_date": p.contract_date.isoformat() if p.contract_date else None,
            "contract_termination_date": p.contract_termination_date.isoformat() if p.contract_termination_date else None,
        })

    return {"projects": items}


@router.get("/categories/{project_seq}")
def list_project_categories(
    project_seq: int,
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id

    project = (
        db.query(Project)
        .filter(Project.seq == project_seq, Project.company_id == company_id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")

    categories = (
        db.query(ProjectBoardCategory)
        .filter(
            ProjectBoardCategory.project_id == project_seq,
            ProjectBoardCategory.is_active == True,
        )
        .order_by(ProjectBoardCategory.sort_order)
        .all()
    )

    items = []
    for c in categories:
        items.append({
            "id": c.seq,
            "name": c.name,
            "description": c.description,
            "icon": c.icon,
            "color": c.color,
        })

    return {"categories": items}


# === 게시글 CRUD ===


@router.get("")
def list_project_boards(
    page: int = Query(1, ge=1),
    per_page: int = Query(15, ge=1, le=100),
    search: str = Query("", description="제목/내용 검색"),
    project_id: Optional[int] = Query(None),
    category_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id

    query = (
        db.query(ProjectBoard)
        .filter(
            ProjectBoard.company_id == company_id,
            ProjectBoard.parent_id == None,
        )
    )

    if search:
        query = query.filter(
            or_(
                ProjectBoard.title.ilike(f"%{search}%"),
                ProjectBoard.content.ilike(f"%{search}%"),
            )
        )

    if project_id:
        query = query.filter(ProjectBoard.project_id == project_id)

    if category_id:
        query = query.filter(
            ProjectBoard.categories.any(ProjectBoardCategory.seq == category_id)
        )

    if status:
        query = query.filter(ProjectBoard.status == status)

    total = query.count()
    total_pages = math.ceil(total / per_page) if total > 0 else 1

    items_db = (
        query.options(
            joinedload(ProjectBoard.project),
            joinedload(ProjectBoard.categories),
            joinedload(ProjectBoard.admin_writer),
            joinedload(ProjectBoard.customer_writer),
        )
        .order_by(ProjectBoard.is_notice.desc(), ProjectBoard.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    # joinedload + limit 조합 시 중복 제거
    seen_ids = set()
    unique_items = []
    for b in items_db:
        if b.seq not in seen_ids:
            seen_ids.add(b.seq)
            unique_items.append(b)

    items = []
    for board in unique_items:
        reply_count = (
            db.query(func.count(ProjectBoard.seq))
            .filter(ProjectBoard.parent_id == board.seq)
            .scalar() or 0
        )
        comment_count = (
            db.query(func.count(ProjectBoardComment.seq))
            .filter(ProjectBoardComment.board_id == board.seq)
            .scalar() or 0
        )
        attachment_count = (
            db.query(func.count(ProjectBoardAttachment.seq))
            .filter(ProjectBoardAttachment.board_id == board.seq)
            .scalar() or 0
        )

        if board.writer_type == "1" and board.admin_writer:
            writer_name = board.admin_writer.name
        elif board.writer_type == "2" and board.customer_writer:
            writer_name = board.customer_writer.name
        else:
            writer_name = None

        categories_list = [
            {
                "name": cat.name,
                "icon": cat.icon,
                "color": cat.color,
            }
            for cat in board.categories
        ]

        items.append({
            "id": board.seq,
            "title": board.title,
            "project_name": board.project.title if board.project else None,
            "project_id": board.project_id,
            "categories": categories_list,
            "writer_name": writer_name,
            "writer_type": board.writer_type,
            "status": board.status,
            "status_label": STATUS_LABELS.get(board.status, ""),
            "is_notice": board.is_notice,
            "views": board.views or 0,
            "reply_count": reply_count,
            "comment_count": comment_count,
            "has_attachment": attachment_count > 0,
            "created_at": board.created_at.isoformat() if board.created_at else None,
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": total_pages,
    }


@router.get("/{seq}")
def get_project_board_detail(
    seq: int,
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id

    board = (
        db.query(ProjectBoard)
        .options(
            joinedload(ProjectBoard.project),
            joinedload(ProjectBoard.categories),
            joinedload(ProjectBoard.admin_writer),
            joinedload(ProjectBoard.customer_writer),
            joinedload(ProjectBoard.board_attachments),
            joinedload(ProjectBoard.comments).joinedload(ProjectBoardComment.admin_writer),
            joinedload(ProjectBoard.comments).joinedload(ProjectBoardComment.customer_writer),
            joinedload(ProjectBoard.comments).joinedload(ProjectBoardComment.comment_attachments),
        )
        .filter(ProjectBoard.seq == seq, ProjectBoard.company_id == company_id)
        .first()
    )

    if not board:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")

    # 조회수 증가
    board.views = (board.views or 0) + 1
    db.commit()

    # 답글 목록
    replies_db = (
        db.query(ProjectBoard)
        .options(
            joinedload(ProjectBoard.admin_writer),
            joinedload(ProjectBoard.customer_writer),
            joinedload(ProjectBoard.board_attachments),
        )
        .filter(ProjectBoard.parent_id == seq)
        .order_by(ProjectBoard.created_at.asc())
        .all()
    )

    def get_writer_name(item):
        if item.writer_type == "1" and item.admin_writer:
            return item.admin_writer.name
        elif item.writer_type == "2" and item.customer_writer:
            return item.customer_writer.name
        return None

    def format_attachments(attachments):
        return [
            {
                "id": att.seq,
                "name": att.filename,
                "file_size": att.file_size or 0,
                "uploaded_at": att.uploaded_at.isoformat() if att.uploaded_at else None,
            }
            for att in attachments
        ]

    def format_comment(comment):
        return {
            "id": comment.seq,
            "content": comment.content,
            "writer_name": get_writer_name(comment),
            "writer_type": comment.writer_type,
            "parent_id": comment.parent_id,
            "is_mine": (
                comment.writer_type == "2"
                and comment.customer_writer_id == current_user.seq
            ),
            "attachments": [
                {
                    "id": ca.seq,
                    "name": ca.filename,
                    "file_size": ca.file_size or 0,
                }
                for ca in comment.comment_attachments
            ],
            "created_at": comment.created_at.isoformat() if comment.created_at else None,
        }

    comments = [format_comment(c) for c in board.comments]

    replies = []
    for r in replies_db:
        replies.append({
            "id": r.seq,
            "title": r.title,
            "content": r.content,
            "writer_name": get_writer_name(r),
            "writer_type": r.writer_type,
            "status": r.status,
            "status_label": STATUS_LABELS.get(r.status, ""),
            "is_mine": r.writer_type == "2" and r.customer_writer_id == current_user.seq,
            "attachments": format_attachments(r.board_attachments),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })

    categories_list = [
        {
            "id": cat.seq,
            "name": cat.name,
            "icon": cat.icon,
            "color": cat.color,
        }
        for cat in board.categories
    ]

    return {
        "id": board.seq,
        "title": board.title,
        "content": board.content,
        "project_id": board.project_id,
        "project_name": board.project.title if board.project else None,
        "categories": categories_list,
        "writer_name": get_writer_name(board),
        "writer_type": board.writer_type,
        "status": board.status,
        "status_label": STATUS_LABELS.get(board.status, ""),
        "is_notice": board.is_notice,
        "views": board.views or 0,
        "is_mine": board.writer_type == "2" and board.customer_writer_id == current_user.seq,
        "attachments": format_attachments(board.board_attachments),
        "comments": comments,
        "replies": replies,
        "created_at": board.created_at.isoformat() if board.created_at else None,
        "updated_at": board.updated_at.isoformat() if board.updated_at else None,
    }


@router.post("")
async def create_project_board(
    title: str = Form(...),
    content: str = Form(...),
    project_id: int = Form(...),
    category_ids: Optional[str] = Form(None),
    status: str = Form("1"),
    files: Optional[List[UploadFile]] = File(None),
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id

    # 프로젝트 검증
    project = (
        db.query(Project)
        .filter(Project.seq == project_id, Project.company_id == company_id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")

    # 계약기간 검증
    today = date.today()
    if project.contract_termination_date and project.contract_termination_date < today:
        raise HTTPException(status_code=400, detail="계약기간이 만료된 프로젝트입니다.")

    # 카테고리 검증
    cat_ids = []
    if category_ids:
        cat_ids = [int(x) for x in category_ids.split(",") if x.strip()]

    categories = []
    if cat_ids:
        categories = (
            db.query(ProjectBoardCategory)
            .filter(
                ProjectBoardCategory.seq.in_(cat_ids),
                ProjectBoardCategory.project_id == project_id,
                ProjectBoardCategory.is_active == True,
            )
            .all()
        )

    new_board = ProjectBoard(
        company_id=company_id,
        project_id=project_id,
        title=title,
        content=content,
        customer_writer_id=current_user.seq,
        writer_type="2",
        status=status,
        views=0,
        is_notice=False,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )

    if categories:
        new_board.categories = categories

    db.add(new_board)
    db.flush()

    if files:
        for file in files:
            if file.filename:
                file_path, original_name, file_size = save_upload_file(file, UPLOAD_DIR)
                attachment = ProjectBoardAttachment(
                    board_id=new_board.seq,
                    file=file_path,
                    filename=original_name,
                    file_size=file_size,
                    uploaded_at=datetime.now(),
                )
                db.add(attachment)

    db.commit()
    db.refresh(new_board)

    return {"id": new_board.seq, "message": "게시글이 등록되었습니다."}


@router.put("/{seq}")
async def update_project_board(
    seq: int,
    title: str = Form(...),
    content: str = Form(...),
    project_id: int = Form(...),
    category_ids: Optional[str] = Form(None),
    status: str = Form("1"),
    delete_attachment_ids: Optional[str] = Form(None),
    files: Optional[List[UploadFile]] = File(None),
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id

    board = (
        db.query(ProjectBoard)
        .filter(
            ProjectBoard.seq == seq,
            ProjectBoard.company_id == company_id,
            ProjectBoard.writer_type == "2",
            ProjectBoard.customer_writer_id == current_user.seq,
        )
        .first()
    )

    if not board:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없거나 수정 권한이 없습니다.")

    board.title = title
    board.content = content
    board.project_id = project_id
    board.status = status
    board.updated_at = datetime.now()

    # 카테고리 M2M 업데이트
    cat_ids = []
    if category_ids:
        cat_ids = [int(x) for x in category_ids.split(",") if x.strip()]

    if cat_ids:
        categories = (
            db.query(ProjectBoardCategory)
            .filter(ProjectBoardCategory.seq.in_(cat_ids))
            .all()
        )
        board.categories = categories
    else:
        board.categories = []

    # 첨부파일 삭제
    if delete_attachment_ids:
        ids_to_delete = [int(x) for x in delete_attachment_ids.split(",") if x.strip()]
        for att_id in ids_to_delete:
            att = (
                db.query(ProjectBoardAttachment)
                .filter(
                    ProjectBoardAttachment.seq == att_id,
                    ProjectBoardAttachment.board_id == seq,
                )
                .first()
            )
            if att:
                full_path = os.path.join(MEDIA_ROOT, att.file)
                if os.path.exists(full_path):
                    os.remove(full_path)
                db.delete(att)

    # 새 첨부파일 추가
    if files:
        for file in files:
            if file.filename:
                file_path, original_name, file_size = save_upload_file(file, UPLOAD_DIR)
                attachment = ProjectBoardAttachment(
                    board_id=seq,
                    file=file_path,
                    filename=original_name,
                    file_size=file_size,
                    uploaded_at=datetime.now(),
                )
                db.add(attachment)

    db.commit()

    return {"id": seq, "message": "게시글이 수정되었습니다."}


@router.delete("/{seq}")
def delete_project_board(
    seq: int,
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id

    board = (
        db.query(ProjectBoard)
        .filter(
            ProjectBoard.seq == seq,
            ProjectBoard.company_id == company_id,
            ProjectBoard.writer_type == "2",
            ProjectBoard.customer_writer_id == current_user.seq,
        )
        .first()
    )

    if not board:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없거나 삭제 권한이 없습니다.")

    # 첨부파일 물리 삭제
    attachments = (
        db.query(ProjectBoardAttachment)
        .filter(ProjectBoardAttachment.board_id == seq)
        .all()
    )
    for att in attachments:
        full_path = os.path.join(MEDIA_ROOT, att.file)
        if os.path.exists(full_path):
            os.remove(full_path)

    db.delete(board)
    db.commit()

    return {"message": "게시글이 삭제되었습니다."}


# === 답글 ===


@router.post("/{seq}/reply")
async def create_project_board_reply(
    seq: int,
    title: str = Form(...),
    content: str = Form(...),
    status: str = Form("1"),
    files: Optional[List[UploadFile]] = File(None),
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id

    parent_board = (
        db.query(ProjectBoard)
        .filter(ProjectBoard.seq == seq, ProjectBoard.company_id == company_id)
        .first()
    )

    if not parent_board:
        raise HTTPException(status_code=404, detail="원글을 찾을 수 없습니다.")

    new_reply = ProjectBoard(
        company_id=company_id,
        project_id=parent_board.project_id,
        parent_id=seq,
        title=title,
        content=content,
        customer_writer_id=current_user.seq,
        writer_type="2",
        status=status,
        views=0,
        is_notice=False,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )

    db.add(new_reply)
    db.flush()

    if files:
        for file in files:
            if file.filename:
                file_path, original_name, file_size = save_upload_file(file, UPLOAD_DIR)
                attachment = ProjectBoardAttachment(
                    board_id=new_reply.seq,
                    file=file_path,
                    filename=original_name,
                    file_size=file_size,
                    uploaded_at=datetime.now(),
                )
                db.add(attachment)

    db.commit()
    db.refresh(new_reply)

    return {"id": new_reply.seq, "message": "답글이 등록되었습니다."}


# === 댓글 ===


@router.post("/{seq}/comments")
async def create_board_comment(
    seq: int,
    content: str = Form(...),
    parent_id: Optional[int] = Form(None),
    files: Optional[List[UploadFile]] = File(None),
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id

    board = (
        db.query(ProjectBoard)
        .filter(ProjectBoard.seq == seq, ProjectBoard.company_id == company_id)
        .first()
    )

    if not board:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")

    if parent_id:
        parent_comment = (
            db.query(ProjectBoardComment)
            .filter(
                ProjectBoardComment.seq == parent_id,
                ProjectBoardComment.board_id == seq,
            )
            .first()
        )
        if not parent_comment:
            raise HTTPException(status_code=404, detail="상위 댓글을 찾을 수 없습니다.")

    new_comment = ProjectBoardComment(
        board_id=seq,
        parent_id=parent_id,
        content=content,
        customer_writer_id=current_user.seq,
        writer_type="2",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )

    db.add(new_comment)
    db.flush()

    if files:
        for file in files:
            if file.filename:
                file_path, original_name, file_size = save_upload_file(file, COMMENT_UPLOAD_DIR)
                attachment = ProjectBoardCommentAttachment(
                    comment_id=new_comment.seq,
                    file=file_path,
                    filename=original_name,
                    file_size=file_size,
                    uploaded_at=datetime.now(),
                )
                db.add(attachment)

    db.commit()
    db.refresh(new_comment)

    return {"id": new_comment.seq, "message": "댓글이 등록되었습니다."}


@router.put("/comments/{seq}")
def update_board_comment(
    seq: int,
    content: str = Form(...),
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    comment = (
        db.query(ProjectBoardComment)
        .join(ProjectBoard, ProjectBoardComment.board_id == ProjectBoard.seq)
        .filter(
            ProjectBoardComment.seq == seq,
            ProjectBoard.company_id == current_user.company_id,
            ProjectBoardComment.writer_type == "2",
            ProjectBoardComment.customer_writer_id == current_user.seq,
        )
        .first()
    )

    if not comment:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없거나 수정 권한이 없습니다.")

    comment.content = content
    comment.updated_at = datetime.now()
    db.commit()

    return {"id": seq, "message": "댓글이 수정되었습니다."}


@router.delete("/comments/{seq}")
def delete_board_comment(
    seq: int,
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    comment = (
        db.query(ProjectBoardComment)
        .join(ProjectBoard, ProjectBoardComment.board_id == ProjectBoard.seq)
        .filter(
            ProjectBoardComment.seq == seq,
            ProjectBoard.company_id == current_user.company_id,
            ProjectBoardComment.writer_type == "2",
            ProjectBoardComment.customer_writer_id == current_user.seq,
        )
        .first()
    )

    if not comment:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없거나 삭제 권한이 없습니다.")

    # 댓글 첨부파일 삭제
    for att in comment.comment_attachments:
        full_path = os.path.join(MEDIA_ROOT, att.file)
        if os.path.exists(full_path):
            os.remove(full_path)

    db.delete(comment)
    db.commit()

    return {"message": "댓글이 삭제되었습니다."}


# === 첨부파일 다운로드 ===


@router.get("/attachments/{attachment_id}/download")
def download_board_attachment(
    attachment_id: int,
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    attachment = (
        db.query(ProjectBoardAttachment)
        .join(ProjectBoard, ProjectBoardAttachment.board_id == ProjectBoard.seq)
        .filter(
            ProjectBoardAttachment.seq == attachment_id,
            ProjectBoard.company_id == current_user.company_id,
        )
        .first()
    )

    if not attachment:
        raise HTTPException(status_code=404, detail="첨부파일을 찾을 수 없습니다.")

    full_path = os.path.join(MEDIA_ROOT, attachment.file)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")

    content_type, _ = mimetypes.guess_type(attachment.filename)
    if not content_type:
        content_type = "application/octet-stream"

    encoded_filename = quote(attachment.filename)
    return FileResponse(
        path=full_path,
        media_type=content_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"},
    )


@router.get("/comment-attachments/{attachment_id}/download")
def download_comment_attachment(
    attachment_id: int,
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    attachment = (
        db.query(ProjectBoardCommentAttachment)
        .join(ProjectBoardComment, ProjectBoardCommentAttachment.comment_id == ProjectBoardComment.seq)
        .join(ProjectBoard, ProjectBoardComment.board_id == ProjectBoard.seq)
        .filter(
            ProjectBoardCommentAttachment.seq == attachment_id,
            ProjectBoard.company_id == current_user.company_id,
        )
        .first()
    )

    if not attachment:
        raise HTTPException(status_code=404, detail="첨부파일을 찾을 수 없습니다.")

    full_path = os.path.join(MEDIA_ROOT, attachment.file)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")

    content_type, _ = mimetypes.guess_type(attachment.filename)
    if not content_type:
        content_type = "application/octet-stream"

    encoded_filename = quote(attachment.filename)
    return FileResponse(
        path=full_path,
        media_type=content_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"},
    )
