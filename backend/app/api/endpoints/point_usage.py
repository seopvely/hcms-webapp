import math
from datetime import datetime, date, timedelta
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_, and_
from io import BytesIO
import openpyxl
from urllib.parse import quote
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.manager import Manager
from app.models.customer import Project, PointHistory, Managelist, ManagelistComment, DevSubscription, MaintSubscription

HAS_DATEUTIL = False
try:
    from dateutil.relativedelta import relativedelta
    HAS_DATEUTIL = True
except ImportError:
    pass

router = APIRouter(prefix="/point-usage", tags=["point-usage"])


@router.get("/export")
def export_point_usage(
    project_id: int = Query(None),
    search_text: str = Query(""),
    date_from: str = Query(""),
    date_to: str = Query(""),
    point_type: str = Query(""),
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = datetime.now()

    maintenance_projects = (
        db.query(Project)
        .filter(Project.company_id == current_user.company_id, Project.point > 0, Project.contract_date <= now, Project.contract_termination_date >= now)
        .order_by(Project.created_at.desc())
        .all()
    )

    current_project = None
    if maintenance_projects:
        if project_id:
            current_project = next((p for p in maintenance_projects if p.seq == project_id), maintenance_projects[0])
        else:
            current_project = maintenance_projects[0]

    if not current_project:
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "포인트사용내역"
        ws.append(["날짜", "구분", "상태", "담당유형", "내용", "관련 요청", "포인트", "포인트구분"])
        buffer = BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        filename = f"포인트사용내역_없음_{datetime.now().strftime('%Y%m%d')}.xlsx"
        return Response(
            content=buffer.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"}
        )

    contract_start = current_project.contract_date
    contract_end = current_project.contract_termination_date

    history_query = (
        db.query(PointHistory)
        .outerjoin(Managelist, PointHistory.managelist_id == Managelist.seq)
        .filter(PointHistory.project_id == current_project.seq, PointHistory.created_at >= contract_start, PointHistory.created_at <= contract_end)
    )

    if search_text:
        history_query = history_query.filter(or_(PointHistory.content.ilike(f"%{search_text}%"), Managelist.title.ilike(f"%{search_text}%")))
    if date_from:
        try:
            history_query = history_query.filter(PointHistory.created_at >= datetime.strptime(date_from, "%Y-%m-%d"))
        except ValueError:
            pass
    if date_to:
        try:
            date_to_end = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1) - timedelta(seconds=1)
            history_query = history_query.filter(PointHistory.created_at <= date_to_end)
        except ValueError:
            pass
    if point_type:
        try:
            history_query = history_query.filter(PointHistory.point_type == int(point_type))
        except ValueError:
            pass

    point_histories = history_query.order_by(PointHistory.created_at.desc()).all()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "포인트사용내역"
    ws.append(["날짜", "구분", "상태", "담당유형", "내용", "관련 요청", "포인트", "포인트구분"])

    point_type_map = {"1": "충전", "2": "사용", "3": "책정"}
    status_map = {"1": "입력", "2": "실행"}
    worker_type_map = {"1": "계약", "2": "기획", "3": "디자인", "4": "프론트엔드", "5": "백엔드", "6": "유지보수"}
    point_category_map = {"1": "유지보수", "2": "개발"}

    for ph in point_histories:
        managelist_title = ""
        actual_worker_type = ph.worker_type
        if ph.managelist_id:
            if ph.managelist:
                managelist_title = ph.managelist.title or ""
            comment = (
                db.query(ManagelistComment)
                .filter(ManagelistComment.managelist_id == ph.managelist_id, ManagelistComment.point > 0)
                .order_by(ManagelistComment.created_at.desc())
                .first()
            )
            if comment and comment.worker_type:
                actual_worker_type = comment.worker_type

        ws.append([
            ph.created_at.strftime("%Y-%m-%d %H:%M:%S") if ph.created_at else "",
            point_type_map.get(str(ph.point_type) if ph.point_type else "", ""),
            status_map.get(str(ph.status) if ph.status else "", ""),
            worker_type_map.get(str(actual_worker_type) if actual_worker_type else "", "") if actual_worker_type else "",
            ph.content or "",
            managelist_title,
            abs(ph.point) if ph.point else 0,
            point_category_map.get(ph.point_category or "1", "유지보수"),
        ])

    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    project_title = current_project.title or "프로젝트"
    filename = f"포인트사용내역_{project_title}_{datetime.now().strftime('%Y%m%d')}.xlsx"
    return Response(
        content=buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"}
    )


@router.get("")
def get_point_usage(
    project_id: int = Query(None),
    search_text: str = Query(""),
    date_from: str = Query(""),
    date_to: str = Query(""),
    point_type: str = Query(""),
    point_category: str = Query(""),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = datetime.now()
    company_id = current_user.company_id

    maintenance_projects = (
        db.query(Project)
        .filter(Project.company_id == company_id, Project.point > 0, Project.contract_date <= now, Project.contract_termination_date >= now)
        .order_by(Project.created_at.desc())
        .all()
    )
    maint_sub = db.query(MaintSubscription).filter(
        MaintSubscription.company_id == company_id,
        MaintSubscription.status.in_(["active", "beta"])
    ).first()
    maintenance_customer = len(maintenance_projects) > 0 or maint_sub is not None

    current_project = None
    if maintenance_projects:
        if project_id:
            current_project = next((p for p in maintenance_projects if p.seq == project_id), maintenance_projects[0])
        else:
            current_project = maintenance_projects[0]

    # Always query dev subscription
    dev_sub = db.query(DevSubscription).filter(
        DevSubscription.company_id == company_id,
        DevSubscription.status.in_(["active", "beta"])
    ).first()
    dev_customer = dev_sub is not None

    # Always calculate dev summary
    if dev_sub:
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        used_dev = int(db.query(func.sum(func.abs(PointHistory.point))).filter(
            PointHistory.company_id == company_id, PointHistory.point_type == 2,
            PointHistory.status == 2, PointHistory.point_category == "2",
            PointHistory.created_at >= month_start,
        ).scalar() or 0)
        dev_total = dev_sub.dev_points_per_month
        dev_summary = {"total": dev_total, "used": used_dev, "remaining": max(0, dev_total - used_dev)}
    else:
        dev_summary = {"total": 0, "used": 0, "remaining": 0}

    response = {
        "maintenance_customer": maintenance_customer,
        "dev_customer": dev_customer,
        "current_project": None,
        "projects_with_balance": [],
        "period_start": "",
        "period_end": "",
        "total_points": 0,
        "used_points": 0,
        "remaining_points": 0,
        "maintenance_summary": {"total": 0, "used": 0, "remaining": 0},
        "dev_summary": dev_summary,
        "worker_stats": [],
        "point_histories": {"items": [], "total": 0, "page": page, "per_page": per_page, "total_pages": 0},
        "chart_data": [],
        "search_text": search_text,
        "date_from": date_from,
        "date_to": date_to,
        "point_type_filter": point_type
    }

    if not current_project and not dev_customer:
        return response

    # Maintenance-specific data
    contract_start = None
    contract_end = None
    if current_project:
        contract_start = current_project.contract_date
        contract_end = current_project.contract_termination_date

        contract_start_date = contract_start.date() if isinstance(contract_start, datetime) else contract_start
        contract_end_date = contract_end.date() if isinstance(contract_end, datetime) else contract_end

        contract_months = min((contract_end_date.year - contract_start_date.year) * 12 + (contract_end_date.month - contract_start_date.month), 6)
        total_points = current_project.point * max(contract_months, 1)

        used_points = int(db.query(func.sum(func.abs(PointHistory.point))).filter(
            PointHistory.project_id == current_project.seq, PointHistory.point_type == 2,
            PointHistory.status == 2, PointHistory.created_at >= contract_start, PointHistory.created_at <= contract_end
        ).scalar() or 0)
        remaining_points = total_points - used_points

        used_maintenance = int(db.query(func.sum(func.abs(PointHistory.point))).filter(
            PointHistory.project_id == current_project.seq, PointHistory.point_type == 2,
            PointHistory.status == 2, PointHistory.created_at >= contract_start, PointHistory.created_at <= contract_end,
            or_(PointHistory.point_category == "1", PointHistory.point_category.is_(None))
        ).scalar() or 0)
        maintenance_summary = {"total": total_points, "used": used_maintenance, "remaining": max(0, total_points - used_maintenance)}

        response["current_project"] = {
            "id": current_project.seq, "title": current_project.title,
            "monthly_point": current_project.point,
            "contract_date": contract_start.strftime("%Y-%m-%d") if isinstance(contract_start, datetime) else str(contract_start),
            "contract_termination_date": contract_end.strftime("%Y-%m-%d") if isinstance(contract_end, datetime) else str(contract_end)
        }
        response["period_start"] = contract_start_date.strftime("%Y-%m-%d")
        response["period_end"] = contract_end_date.strftime("%Y-%m-%d")
        response["total_points"] = total_points
        response["used_points"] = used_points
        response["remaining_points"] = remaining_points
        response["maintenance_summary"] = maintenance_summary

        for project in maintenance_projects:
            proj_start = project.contract_date
            proj_end = project.contract_termination_date
            proj_start_date = proj_start.date() if isinstance(proj_start, datetime) else proj_start
            proj_end_date = proj_end.date() if isinstance(proj_end, datetime) else proj_end
            proj_months = min((proj_end_date.year - proj_start_date.year) * 12 + (proj_end_date.month - proj_start_date.month), 6)
            proj_total = project.point * max(proj_months, 1)
            proj_used = int(db.query(func.sum(func.abs(PointHistory.point))).filter(
                PointHistory.project_id == project.seq, PointHistory.point_type == 2,
                PointHistory.status == 2, PointHistory.created_at >= proj_start, PointHistory.created_at <= proj_end
            ).scalar() or 0)
            response["projects_with_balance"].append({
                "id": project.seq, "title": project.title,
                "monthly_point": project.point, "remaining_points": proj_total - proj_used, "total_points": proj_total
            })

        point_histories_for_stats = db.query(PointHistory).filter(
            PointHistory.project_id == current_project.seq, PointHistory.point_type == 2,
            PointHistory.status == 2, PointHistory.created_at >= contract_start, PointHistory.created_at <= contract_end
        ).all()

        worker_stats_dict = {}
        for ph in point_histories_for_stats:
            if ph.managelist_id:
                comment = db.query(ManagelistComment).filter(
                    ManagelistComment.managelist_id == ph.managelist_id, ManagelistComment.point > 0
                ).order_by(ManagelistComment.created_at.desc()).first()
                if comment and comment.writer:
                    writer_name = comment.writer.name or comment.writer.username or "미지정"
                    worker_type = comment.worker_type or ph.worker_type or 0
                    key = (writer_name, worker_type)
                    if key not in worker_stats_dict:
                        worker_stats_dict[key] = {"writer_name": writer_name, "worker_type": worker_type, "total_used": 0, "usage_count": 0}
                    worker_stats_dict[key]["total_used"] += abs(ph.point)
                    worker_stats_dict[key]["usage_count"] += 1

        response["worker_stats"] = list(worker_stats_dict.values())

        chart_data = []
        for i in range(6):
            if HAS_DATEUTIL:
                month_start_c = contract_start_date + relativedelta(months=i)
                month_end_c = contract_start_date + relativedelta(months=i + 1)
            else:
                month_start_c = contract_start_date + timedelta(days=i * 30)
                month_end_c = contract_start_date + timedelta(days=(i + 1) * 30)

            month_usage = int(db.query(func.sum(func.abs(PointHistory.point))).filter(
                PointHistory.project_id == current_project.seq, PointHistory.point_type == 2, PointHistory.status == 2,
                PointHistory.created_at >= datetime.combine(month_start_c, datetime.min.time()),
                PointHistory.created_at < datetime.combine(month_end_c, datetime.min.time())
            ).scalar() or 0)
            chart_data.append({"month": month_start_c.strftime("%Y-%m"), "usage": month_usage})

        response["chart_data"] = chart_data

    # History query: combine maintenance (project-based) and dev (company-based) items
    history_base = (
        db.query(PointHistory)
        .outerjoin(Managelist, PointHistory.managelist_id == Managelist.seq)
    )

    base_conditions = []
    if current_project and point_category != "2":
        base_conditions.append(
            and_(
                PointHistory.project_id == current_project.seq,
                PointHistory.created_at >= contract_start,
                PointHistory.created_at <= contract_end,
                or_(PointHistory.point_category == "1", PointHistory.point_category.is_(None))
            )
        )
    if dev_sub and point_category != "1":
        base_conditions.append(
            and_(
                PointHistory.company_id == company_id,
                PointHistory.point_category == "2"
            )
        )

    if base_conditions:
        history_query = history_base.filter(or_(*base_conditions))
    else:
        history_query = history_base.filter(PointHistory.seq == -1)

    if search_text:
        history_query = history_query.filter(or_(PointHistory.content.ilike(f"%{search_text}%"), Managelist.title.ilike(f"%{search_text}%")))
    if date_from:
        try:
            history_query = history_query.filter(PointHistory.created_at >= datetime.strptime(date_from, "%Y-%m-%d"))
        except ValueError:
            pass
    if date_to:
        try:
            date_to_end = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1) - timedelta(seconds=1)
            history_query = history_query.filter(PointHistory.created_at <= date_to_end)
        except ValueError:
            pass
    if point_type:
        try:
            history_query = history_query.filter(PointHistory.point_type == int(point_type))
        except ValueError:
            pass

    total_count = history_query.count()
    total_pages = math.ceil(total_count / per_page)
    point_histories = history_query.order_by(PointHistory.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()

    history_items = []
    for ph in point_histories:
        managelist_title = ""
        actual_worker_type = ph.worker_type
        if ph.managelist_id:
            if ph.managelist:
                managelist_title = ph.managelist.title or ""
            comment = db.query(ManagelistComment).filter(
                ManagelistComment.managelist_id == ph.managelist_id, ManagelistComment.point > 0
            ).order_by(ManagelistComment.created_at.desc()).first()
            if comment and comment.worker_type:
                actual_worker_type = comment.worker_type
        history_items.append({
            "id": ph.seq,
            "created_at": ph.created_at.strftime("%Y-%m-%d %H:%M:%S") if ph.created_at else "",
            "content": ph.content or "",
            "point_type": ph.point_type,
            "point_category": ph.point_category or "1",
            "point": abs(ph.point) if ph.point else 0,
            "status": ph.status,
            "worker_type": actual_worker_type,
            "managelist_title": managelist_title
        })

    response["point_histories"]["items"] = history_items
    response["point_histories"]["total"] = total_count
    response["point_histories"]["total_pages"] = total_pages

    return response
