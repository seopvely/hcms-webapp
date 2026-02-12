import math
from datetime import datetime, date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.manager import Manager
from app.models.customer import Project, PointHistory, Managelist, ManagelistComment

HAS_DATEUTIL = False
try:
    from dateutil.relativedelta import relativedelta
    HAS_DATEUTIL = True
except ImportError:
    pass

router = APIRouter(prefix="/point-usage", tags=["point-usage"])


@router.get("")
def get_point_usage(
    project_id: int = Query(None),
    search_text: str = Query(""),
    date_from: str = Query(""),
    date_to: str = Query(""),
    point_type: str = Query(""),  # 1=충전, 2=사용, 3=책정
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get point usage history for maintenance projects.
    """
    now = datetime.now()

    # Get all active maintenance projects for the company
    maintenance_projects = (
        db.query(Project)
        .filter(
            Project.company_id == current_user.company_id,
            Project.point > 0,
            Project.contract_date <= now,
            Project.contract_termination_date >= now,
        )
        .order_by(Project.created_at.desc())
        .all()
    )

    maintenance_customer = len(maintenance_projects) > 0

    # Select current project
    current_project = None
    if maintenance_projects:
        if project_id:
            current_project = next(
                (p for p in maintenance_projects if p.seq == project_id),
                maintenance_projects[0]
            )
        else:
            current_project = maintenance_projects[0]

    # Initialize response structure
    response = {
        "maintenance_customer": maintenance_customer,
        "current_project": None,
        "projects_with_balance": [],
        "period_start": "",
        "period_end": "",
        "total_points": 0,
        "used_points": 0,
        "remaining_points": 0,
        "worker_stats": [],
        "point_histories": {
            "items": [],
            "total": 0,
            "page": page,
            "per_page": per_page,
            "total_pages": 0
        },
        "chart_data": [],
        "search_text": search_text,
        "date_from": date_from,
        "date_to": date_to,
        "point_type_filter": point_type
    }

    if not current_project:
        return response

    # Calculate contract details
    contract_start = current_project.contract_date
    contract_end = current_project.contract_termination_date

    # Calculate contract months (minimum 6)
    if isinstance(contract_start, datetime):
        contract_start_date = contract_start.date()
    else:
        contract_start_date = contract_start

    if isinstance(contract_end, datetime):
        contract_end_date = contract_end.date()
    else:
        contract_end_date = contract_end

    contract_months = (contract_end_date.year - contract_start_date.year) * 12 + \
                      (contract_end_date.month - contract_start_date.month)
    contract_months = min(contract_months, 6)

    # Calculate total points
    total_points = current_project.point * max(contract_months, 1)

    # Calculate used points
    used_points_query = (
        db.query(func.sum(func.abs(PointHistory.point)))
        .filter(
            PointHistory.project_id == current_project.seq,
            PointHistory.point_type == 2,
            PointHistory.status == 2,
            PointHistory.created_at >= contract_start,
            PointHistory.created_at <= contract_end
        )
        .scalar()
    )
    used_points = int(used_points_query or 0)
    remaining_points = total_points - used_points

    # Build current project info
    response["current_project"] = {
        "id": current_project.seq,
        "title": current_project.title,
        "monthly_point": current_project.point,
        "contract_date": contract_start.strftime("%Y-%m-%d") if isinstance(contract_start, datetime) else str(contract_start),
        "contract_termination_date": contract_end.strftime("%Y-%m-%d") if isinstance(contract_end, datetime) else str(contract_end)
    }

    response["period_start"] = contract_start_date.strftime("%Y-%m-%d")
    response["period_end"] = contract_end_date.strftime("%Y-%m-%d")
    response["total_points"] = total_points
    response["used_points"] = used_points
    response["remaining_points"] = remaining_points

    # Build projects with balance
    for project in maintenance_projects:
        proj_contract_start = project.contract_date
        proj_contract_end = project.contract_termination_date

        if isinstance(proj_contract_start, datetime):
            proj_start_date = proj_contract_start.date()
        else:
            proj_start_date = proj_contract_start

        if isinstance(proj_contract_end, datetime):
            proj_end_date = proj_contract_end.date()
        else:
            proj_end_date = proj_contract_end

        proj_months = (proj_end_date.year - proj_start_date.year) * 12 + \
                     (proj_end_date.month - proj_start_date.month)
        proj_months = min(proj_months, 6)
        proj_total = project.point * max(proj_months, 1)

        proj_used_query = (
            db.query(func.sum(func.abs(PointHistory.point)))
            .filter(
                PointHistory.project_id == project.seq,
                PointHistory.point_type == 2,
                PointHistory.status == 2,
                PointHistory.created_at >= proj_contract_start,
                PointHistory.created_at <= proj_contract_end
            )
            .scalar()
        )
        proj_used = int(proj_used_query or 0)
        proj_remaining = proj_total - proj_used

        response["projects_with_balance"].append({
            "id": project.seq,
            "title": project.title,
            "monthly_point": project.point,
            "remaining_points": proj_remaining,
            "total_points": proj_total
        })

    # Worker stats
    point_histories_for_stats = (
        db.query(PointHistory)
        .filter(
            PointHistory.project_id == current_project.seq,
            PointHistory.point_type == 2,
            PointHistory.status == 2,
            PointHistory.created_at >= contract_start,
            PointHistory.created_at <= contract_end
        )
        .all()
    )

    # Group by writer from comments
    worker_stats_dict = {}
    for ph in point_histories_for_stats:
        if ph.managelist_id:
            # Find the comment with point > 0 for this managelist
            comment = (
                db.query(ManagelistComment)
                .filter(
                    ManagelistComment.managelist_id == ph.managelist_id,
                    ManagelistComment.point > 0
                )
                .order_by(ManagelistComment.created_at.desc())
                .first()
            )

            if comment and comment.writer:
                writer_name = comment.writer.name or comment.writer.username or "미지정"
                worker_type = comment.worker_type or ph.worker_type or 0

                key = (writer_name, worker_type)
                if key not in worker_stats_dict:
                    worker_stats_dict[key] = {
                        "writer_name": writer_name,
                        "worker_type": worker_type,
                        "total_used": 0,
                        "usage_count": 0
                    }

                worker_stats_dict[key]["total_used"] += abs(ph.point)
                worker_stats_dict[key]["usage_count"] += 1

    response["worker_stats"] = list(worker_stats_dict.values())

    # Point history list with filtering and pagination
    history_query = (
        db.query(PointHistory)
        .outerjoin(Managelist, PointHistory.managelist_id == Managelist.seq)
        .filter(
            PointHistory.project_id == current_project.seq,
            PointHistory.created_at >= contract_start,
            PointHistory.created_at <= contract_end
        )
    )

    # Search filter
    if search_text:
        history_query = history_query.filter(
            or_(
                PointHistory.content.ilike(f"%{search_text}%"),
                Managelist.title.ilike(f"%{search_text}%")
            )
        )

    # Date filters
    if date_from:
        try:
            date_from_dt = datetime.strptime(date_from, "%Y-%m-%d")
            history_query = history_query.filter(PointHistory.created_at >= date_from_dt)
        except ValueError:
            pass

    if date_to:
        try:
            date_to_dt = datetime.strptime(date_to, "%Y-%m-%d")
            date_to_end = date_to_dt + timedelta(days=1) - timedelta(seconds=1)
            history_query = history_query.filter(PointHistory.created_at <= date_to_end)
        except ValueError:
            pass

    # Point type filter
    if point_type:
        try:
            point_type_int = int(point_type)
            history_query = history_query.filter(PointHistory.point_type == point_type_int)
        except ValueError:
            pass

    # Count total
    total_count = history_query.count()
    total_pages = math.ceil(total_count / per_page)

    # Order and paginate
    history_query = history_query.order_by(PointHistory.created_at.desc())
    offset = (page - 1) * per_page
    point_histories = history_query.offset(offset).limit(per_page).all()

    # Build history items
    history_items = []
    for ph in point_histories:
        managelist_title = ""
        actual_worker_type = ph.worker_type

        if ph.managelist_id:
            if ph.managelist:
                managelist_title = ph.managelist.title or ""

            # Get actual worker type from comment
            comment = (
                db.query(ManagelistComment)
                .filter(
                    ManagelistComment.managelist_id == ph.managelist_id,
                    ManagelistComment.point > 0
                )
                .order_by(ManagelistComment.created_at.desc())
                .first()
            )

            if comment and comment.worker_type:
                actual_worker_type = comment.worker_type

        history_items.append({
            "id": ph.seq,
            "created_at": ph.created_at.strftime("%Y-%m-%d %H:%M:%S") if ph.created_at else "",
            "content": ph.content or "",
            "point_type": ph.point_type,
            "point": abs(ph.point) if ph.point else 0,
            "status": ph.status,
            "worker_type": actual_worker_type,
            "managelist_title": managelist_title
        })

    response["point_histories"]["items"] = history_items
    response["point_histories"]["total"] = total_count
    response["point_histories"]["total_pages"] = total_pages

    # Chart data: last 6 months from contract start
    chart_data = []
    for i in range(6):
        if HAS_DATEUTIL:
            month_start = contract_start_date + relativedelta(months=i)
            month_end = contract_start_date + relativedelta(months=i + 1)
        else:
            month_start = contract_start_date + timedelta(days=i * 30)
            month_end = contract_start_date + timedelta(days=(i + 1) * 30)

        month_usage_query = (
            db.query(func.sum(func.abs(PointHistory.point)))
            .filter(
                PointHistory.project_id == current_project.seq,
                PointHistory.point_type == 2,
                PointHistory.status == 2,
                PointHistory.created_at >= datetime.combine(month_start, datetime.min.time()),
                PointHistory.created_at < datetime.combine(month_end, datetime.min.time())
            )
            .scalar()
        )
        month_usage = int(month_usage_query or 0)

        chart_data.append({
            "month": month_start.strftime("%Y-%m"),
            "usage": month_usage
        })

    response["chart_data"] = chart_data

    return response
