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
from app.utils.point_cycle import get_point_cycle
from app.utils.free_maint import as_date, contract_active_q, free_maint_q, free_maint_state

HAS_DATEUTIL = False
try:
    from dateutil.relativedelta import relativedelta
    HAS_DATEUTIL = True
except ImportError:
    pass

router = APIRouter(prefix="/point-usage", tags=["point-usage"])


def _maintenance_projects(db: Session, company_id: int, now: datetime):
    """포인트 화면 대상 프로젝트: 계약기간 중인 유지보수 계약 + 무상 유지보수 기간 중인 프로젝트"""
    active = (
        db.query(Project)
        .filter(Project.company_id == company_id, contract_active_q(now))
        .order_by(Project.created_at.desc())
        .all()
    )
    active_ids = {p.seq for p in active}
    free = [
        p for p in (
            db.query(Project)
            .filter(Project.company_id == company_id, free_maint_q(now.date()))
            .order_by(Project.free_maint_end_date.desc())
            .all()
        )
        if p.seq not in active_ids
    ]
    return active, free


def _history_range(project: Project):
    """포인트/요청 내역 조회 범위 [start, end) — 계약 시작일 ~ max(계약 종료일, 무상 종료일) 당일까지"""
    start = as_date(project.contract_date)
    end = as_date(project.contract_termination_date)
    free_end = as_date(project.free_maint_end_date)
    if free_end and (not end or free_end > end):
        end = free_end
    start_dt = datetime.combine(start, datetime.min.time()) if start else datetime.min
    end_dt = datetime.combine(end + timedelta(days=1), datetime.min.time()) if end else datetime.max
    return start_dt, end_dt


def _free_request_query(db: Session, project: Project, search_text: str, date_from: str, date_to: str):
    """무상 유지보수 요청(포인트 미차감) — 내역에 '무상(0P)' 행으로 표시"""
    start_dt, end_dt = _history_range(project)
    q = db.query(Managelist).filter(
        Managelist.project_id == project.seq,
        Managelist.is_free_maint.is_(True),
        Managelist.created_at >= start_dt,
        Managelist.created_at < end_dt,
    )
    if search_text:
        q = q.filter(or_(Managelist.title.ilike(f"%{search_text}%"), Managelist.contents.ilike(f"%{search_text}%")))
    if date_from:
        try:
            q = q.filter(Managelist.created_at >= datetime.strptime(date_from, "%Y-%m-%d"))
        except ValueError:
            pass
    if date_to:
        try:
            q = q.filter(Managelist.created_at < datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1))
        except ValueError:
            pass
    return q


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

    active_projects, free_projects = _maintenance_projects(db, current_user.company_id, now)
    maintenance_projects = active_projects + free_projects

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

    history_start, history_end = _history_range(current_project)

    history_query = (
        db.query(PointHistory)
        .outerjoin(Managelist, PointHistory.managelist_id == Managelist.seq)
        .filter(PointHistory.project_id == current_project.seq, PointHistory.created_at >= history_start, PointHistory.created_at < history_end)
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
    free_requests = [] if point_type else _free_request_query(db, current_project, search_text, date_from, date_to).all()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "포인트사용내역"
    ws.append(["날짜", "구분", "상태", "담당유형", "내용", "관련 요청", "포인트", "포인트구분"])

    point_type_map = {"1": "충전", "2": "사용", "3": "책정"}
    status_map = {"1": "입력", "2": "실행"}
    worker_type_map = {"1": "계약", "2": "기획", "3": "디자인", "4": "프론트엔드", "5": "백엔드", "6": "유지보수"}
    point_category_map = {"1": "유지보수", "2": "개발"}

    rows = []
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

        rows.append((ph.created_at or datetime.min, [
            ph.created_at.strftime("%Y-%m-%d %H:%M:%S") if ph.created_at else "",
            point_type_map.get(str(ph.point_type) if ph.point_type else "", ""),
            status_map.get(str(ph.status) if ph.status else "", ""),
            worker_type_map.get(str(actual_worker_type) if actual_worker_type else "", "") if actual_worker_type else "",
            ph.content or "",
            managelist_title,
            abs(ph.point) if ph.point else 0,
            point_category_map.get(ph.point_category or "1", "유지보수"),
        ]))

    for m in free_requests:
        rows.append((m.created_at or datetime.min, [
            m.created_at.strftime("%Y-%m-%d %H:%M:%S") if m.created_at else "",
            "무상",
            "",
            "",
            "무상 유지보수 기간 요청 (포인트 미차감)",
            m.title or "",
            0,
            "유지보수",
        ]))

    rows.sort(key=lambda r: r[0], reverse=True)
    for _, row in rows:
        ws.append(row)

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

    active_projects, free_projects = _maintenance_projects(db, company_id, now)
    maintenance_projects = active_projects + free_projects
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
    is_free_project = current_project is not None and current_project.seq not in {p.seq for p in active_projects}
    if is_free_project:
        # 무상 유지보수 기간 — 포인트를 차감하지 않으므로 주기 포인트 대신 무상 기간 정보를 내려준다
        state = free_maint_state(current_project, now.date())
        contract_start, contract_end = current_project.contract_date, current_project.contract_termination_date
        response["current_project"] = {
            "id": current_project.seq, "title": current_project.title,
            "monthly_point": current_project.point,
            "contract_date": as_date(contract_start).isoformat() if contract_start else None,
            "contract_termination_date": as_date(contract_end).isoformat() if contract_end else None,
        }
        response["period_start"] = as_date(contract_start).isoformat() if contract_start else ""
        response["period_end"] = state["end_date"] or ""
        response["free_maint"] = {
            "start_date": state["start_date"],
            "end_date": state["end_date"],
            "days_left": state["days_left"],
            "scope": state["scope"],
        }

    for project in maintenance_projects:
        if project in free_projects:
            response["projects_with_balance"].append({
                "id": project.seq, "title": project.title, "monthly_point": project.point,
                "remaining_points": 0, "total_points": 0,
                "free_maint": True,
                "free_maint_end_date": as_date(project.free_maint_end_date).isoformat() if project.free_maint_end_date else None,
            })

    if current_project and not is_free_project:
        contract_start = current_project.contract_date
        contract_end = current_project.contract_termination_date

        contract_start_date = contract_start.date() if isinstance(contract_start, datetime) else contract_start
        contract_end_date = contract_end.date() if isinstance(contract_end, datetime) else contract_end

        # 포인트는 계약 시작일 기준 6개월 주기마다 초기화 — 총/사용/잔여는 현재 주기 안에서만 계산
        cycle = get_point_cycle(current_project)
        cycle_start, cycle_end = cycle["query_start"], cycle["query_end"]
        total_points = cycle["total_points"]

        used_points = int(db.query(func.sum(func.abs(PointHistory.point))).filter(
            PointHistory.project_id == current_project.seq, PointHistory.point_type == 2,
            PointHistory.status == 2, PointHistory.created_at >= cycle_start, PointHistory.created_at < cycle_end
        ).scalar() or 0)
        remaining_points = total_points - used_points

        used_maintenance = int(db.query(func.sum(func.abs(PointHistory.point))).filter(
            PointHistory.project_id == current_project.seq, PointHistory.point_type == 2,
            PointHistory.status == 2, PointHistory.created_at >= cycle_start, PointHistory.created_at < cycle_end,
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
        response["cycle"] = {
            "index": cycle["index"] + 1,
            "count": cycle["count"],
            "start": cycle["start"].strftime("%Y-%m-%d"),
            "end": cycle["end"].strftime("%Y-%m-%d"),
            "next_reset": cycle["next_reset"].strftime("%Y-%m-%d") if cycle["next_reset"] else None,
        }
        response["total_points"] = total_points
        response["used_points"] = used_points
        response["remaining_points"] = remaining_points
        response["maintenance_summary"] = maintenance_summary

        for project in active_projects:
            proj_cycle = get_point_cycle(project)
            proj_total = proj_cycle["total_points"]
            proj_used = int(db.query(func.sum(func.abs(PointHistory.point))).filter(
                PointHistory.project_id == project.seq, PointHistory.point_type == 2,
                PointHistory.status == 2, PointHistory.created_at >= proj_cycle["query_start"], PointHistory.created_at < proj_cycle["query_end"]
            ).scalar() or 0)
            response["projects_with_balance"].append({
                "id": project.seq, "title": project.title,
                "monthly_point": project.point, "remaining_points": proj_total - proj_used, "total_points": proj_total
            })

        point_histories_for_stats = db.query(PointHistory).filter(
            PointHistory.project_id == current_project.seq, PointHistory.point_type == 2,
            PointHistory.status == 2, PointHistory.created_at >= cycle_start, PointHistory.created_at < cycle_end
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
        for i in range(cycle["months"]):
            month_start_c = cycle["start"] + relativedelta(months=i)
            month_end_c = cycle["start"] + relativedelta(months=i + 1)

            month_usage = int(db.query(func.sum(func.abs(PointHistory.point))).filter(
                PointHistory.project_id == current_project.seq, PointHistory.point_type == 2, PointHistory.status == 2,
                PointHistory.created_at >= datetime.combine(month_start_c, datetime.min.time()),
                PointHistory.created_at < datetime.combine(month_end_c, datetime.min.time())
            ).scalar() or 0)
            chart_data.append({"month": month_start_c.strftime("%Y-%m"), "usage": month_usage})

        response["chart_data"] = chart_data

    response["projects_with_balance"].sort(key=lambda p: bool(p.get("free_maint")))

    # History query: combine maintenance (project-based) and dev (company-based) items
    history_base = (
        db.query(PointHistory)
        .outerjoin(Managelist, PointHistory.managelist_id == Managelist.seq)
    )

    base_conditions = []
    if current_project and point_category != "2":
        history_start, history_end = _history_range(current_project)
        base_conditions.append(
            and_(
                PointHistory.project_id == current_project.seq,
                PointHistory.created_at >= history_start,
                PointHistory.created_at < history_end,
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

    # 무상 유지보수 요청(포인트 미차감)을 '무상(0P)' 행으로 함께 표시 — 포인트 구분 필터가 없을 때만
    free_query = None
    if current_project and point_category != "2" and not point_type:
        free_query = _free_request_query(db, current_project, search_text, date_from, date_to)

    if free_query is None:
        total_count = history_query.count()
        point_histories = history_query.order_by(PointHistory.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
        free_by_seq = {}
        page_rows = [("ph", ph.seq) for ph in point_histories]
    else:
        # 두 내역을 (날짜, 종류, id)로 합쳐 정렬 후 페이지만큼 잘라서 상세 조회
        keys = [(c or datetime.min, "ph", i) for i, c in history_query.with_entities(PointHistory.seq, PointHistory.created_at).all()]
        keys += [(c or datetime.min, "free", i) for i, c in free_query.with_entities(Managelist.seq, Managelist.created_at).all()]
        keys.sort(key=lambda k: k[0], reverse=True)
        total_count = len(keys)
        page_keys = keys[(page - 1) * per_page: page * per_page]
        page_rows = [(kind, i) for _, kind, i in page_keys]
        ph_ids = [i for kind, i in page_rows if kind == "ph"]
        free_ids = [i for kind, i in page_rows if kind == "free"]
        point_histories = db.query(PointHistory).filter(PointHistory.seq.in_(ph_ids)).all() if ph_ids else []
        free_by_seq = {m.seq: m for m in db.query(Managelist).filter(Managelist.seq.in_(free_ids)).all()} if free_ids else {}
    total_pages = math.ceil(total_count / per_page)
    ph_by_seq = {ph.seq: ph for ph in point_histories}

    history_items = []
    for kind, row_id in page_rows:
        if kind == "free":
            m = free_by_seq.get(row_id)
            if not m:
                continue
            history_items.append({
                "id": f"free-{m.seq}",
                "created_at": m.created_at.strftime("%Y-%m-%d %H:%M:%S") if m.created_at else "",
                "content": "무상 유지보수 기간 요청 (포인트 미차감)",
                "point_type": None,
                "point_category": "1",
                "point": 0,
                "status": None,
                "worker_type": None,
                "managelist_title": m.title or "",
                "managelist_id": m.seq,
                "is_free_maint": True,
            })
            continue
        ph = ph_by_seq.get(row_id)
        if not ph:
            continue
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
