from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, case, and_, or_
from datetime import datetime, timedelta

from app.api.endpoints.estimates import CUSTOMER_VISIBLE_ESTIMATE_STATUSES
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.manager import Manager
from app.utils.point_cycle import get_point_cycle
from app.utils.maint_plans import hosting_label, plans_payload
from app.utils.free_maint import (
    FREE_ENDING_SOON_DAYS,
    contract_active_q,
    find_free_ended_projects,
    find_free_maint_projects,
    free_maint_state,
    has_maintenance_access,
)
from app.models.customer import (
    Managelist,
    ManagelistComment,
    Inditask,
    News,
    Estimate,
    Inquiry,
    InquiryAnswer,
    Payment,
    PointHistory,
    Project,
    DevSubscription,
    MaintSubscription,
    MaintRenewal,
    news_companies,
)
from app.services.points import cycle_used_points, subscription_cycle

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("")
def get_dashboard(
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id
    company_name = current_user.company.name if current_user.company else ""

    maintenance_count = (
        db.query(func.count(Managelist.seq))
        .filter(Managelist.company_id == company_id)
        .scalar() or 0
    )
    task_count = (
        db.query(func.count(Inditask.seq))
        .filter(Inditask.company_id == company_id)
        .scalar() or 0
    )

    news_with_company = (
        db.query(News.seq)
        .join(news_companies, news_companies.c.news_id == News.seq)
        .filter(News.is_published == True, news_companies.c.company_id == company_id)
    )
    news_no_company = (
        db.query(News.seq)
        .outerjoin(news_companies, news_companies.c.news_id == News.seq)
        .filter(News.is_published == True, news_companies.c.news_id == None)
    )
    news_ids = news_with_company.union(news_no_company).subquery()
    news_q = db.query(News).filter(News.seq.in_(db.query(news_ids)))
    has_maint_news = has_maintenance_access(db, company_id)
    if not has_maint_news:  # 유지보수 소식은 유지보수 고객에게만(news 목록과 같은 규칙)
        news_q = news_q.filter(or_(News.category.is_(None), News.category != "maintenance"))
    news_count = news_q.count()

    # 견적 목록과 동일하게 작성중(사내 작업 단계) 견적서는 집계에서 제외한다.
    estimate_count = (
        db.query(func.count(Estimate.seq))
        .filter(
            Estimate.company_id == company_id,
            Estimate.estimate_status.in_(CUSTOMER_VISIBLE_ESTIMATE_STATUSES),
        )
        .scalar() or 0
    )

    recent_maintenance = (
        db.query(
            Managelist.seq.label("id"),
            Managelist.title.label("title"),
            Managelist.created_at.label("date"),
            Managelist.status.label("status"),
        )
        .filter(Managelist.company_id == company_id)
        .order_by(Managelist.created_at.desc())
        .limit(5)
        .all()
    )
    recent_inquiries = (
        db.query(
            Inquiry.seq.label("id"),
            Inquiry.title.label("title"),
            Inquiry.created_at.label("date"),
            Inquiry.status.label("status"),
        )
        .filter(Inquiry.company_id == company_id)
        .order_by(Inquiry.created_at.desc())
        .limit(5)
        .all()
    )

    activities = []
    for m in recent_maintenance:
        activities.append({"id": m.id, "title": m.title, "date": m.date.isoformat() if m.date else None, "type": "maintenance", "status": m.status})
    for i in recent_inquiries:
        activities.append({"id": i.id, "title": i.title, "date": i.date.isoformat() if i.date else None, "type": "inquiry", "status": i.status})
    activities.sort(key=lambda x: x["date"] or "", reverse=True)
    recent_activities = activities[:5]

    current_month_start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    pending_requests = db.query(func.count(Managelist.seq)).filter(Managelist.company_id == company_id, Managelist.status == 1).scalar() or 0
    in_progress_requests = db.query(func.count(Managelist.seq)).filter(Managelist.company_id == company_id, Managelist.status.in_([2, 3])).scalar() or 0
    completed_requests = db.query(func.count(Managelist.seq)).filter(Managelist.company_id == company_id, Managelist.status == 4).scalar() or 0
    monthly_requests = db.query(func.count(Managelist.seq)).filter(Managelist.company_id == company_id, Managelist.created_at >= current_month_start).scalar() or 0

    total_inquiries = db.query(func.count(Inquiry.seq)).filter(Inquiry.company_id == company_id).scalar() or 0
    answered_inquiries = db.query(func.count(Inquiry.seq)).filter(Inquiry.company_id == company_id, Inquiry.status == 2).scalar() or 0
    total_managelist_count = db.query(func.count(Managelist.seq)).filter(Managelist.company_id == company_id).scalar() or 0
    answered_managelist = db.query(func.count(func.distinct(ManagelistComment.managelist_id))).filter(
        ManagelistComment.managelist_id.in_(db.query(Managelist.seq).filter(Managelist.company_id == company_id))
    ).scalar() or 0

    total_all = total_inquiries + total_managelist_count
    total_answered = answered_inquiries + answered_managelist
    response_rate = round((total_answered / total_all * 100), 1) if total_all > 0 else 0

    six_months_ago = datetime.now() - timedelta(days=180)
    worker_types = [(1, "계약"), (2, "기획"), (3, "디자인"), (4, "프론트엔드"), (5, "백엔드"), (6, "유지보수")]

    worker_stats = []
    for wt_code, wt_name in worker_types:
        completed_count = db.query(func.count(func.distinct(ManagelistComment.managelist_id))).filter(
            ManagelistComment.managelist_id.in_(db.query(Managelist.seq).filter(Managelist.company_id == company_id, Managelist.status == 4)),
            ManagelistComment.worker_type == wt_code,
            ManagelistComment.created_at >= six_months_ago
        ).scalar() or 0
        in_progress_count = db.query(func.count(func.distinct(ManagelistComment.managelist_id))).filter(
            ManagelistComment.managelist_id.in_(db.query(Managelist.seq).filter(Managelist.company_id == company_id, Managelist.status.in_([2, 3]))),
            ManagelistComment.worker_type == wt_code
        ).scalar() or 0
        if completed_count > 0 or in_progress_count > 0:
            worker_stats.append({"name": wt_name, "completed_count": completed_count, "in_progress_count": in_progress_count})

    visible_news_with_company = (
        db.query(News)
        .join(news_companies, news_companies.c.news_id == News.seq)
        .filter(News.is_published == True, news_companies.c.company_id == company_id)
    )
    visible_news_no_company = (
        db.query(News)
        .outerjoin(news_companies, news_companies.c.news_id == News.seq)
        .filter(News.is_published == True, news_companies.c.news_id == None)
    )
    latest_news_q = visible_news_with_company.union(visible_news_no_company)
    if not has_maint_news:
        latest_news_q = latest_news_q.filter(or_(News.category.is_(None), News.category != "maintenance"))
    latest_news_items = latest_news_q.order_by(News.created_at.desc()).limit(5).all()
    latest_news = [{"id": n.seq, "title": n.title, "category": n.category, "created_at": n.created_at.isoformat() if n.created_at else None} for n in latest_news_items]

    monthly_payment_result = db.query(
        func.coalesce(func.sum(Payment.payment_amount), 0).label("total_amount"),
        func.count(Payment.seq).label("count")
    ).filter(Payment.company_id == company_id, Payment.payment_date >= current_month_start.date()).first()

    monthly_payment = {
        "total_amount": monthly_payment_result.total_amount if monthly_payment_result else 0,
        "count": monthly_payment_result.count if monthly_payment_result else 0,
    }

    now = datetime.now()
    active_project = (
        db.query(Project)
        .filter(Project.company_id == company_id, contract_active_q(now))
        .order_by(Project.created_at.desc())
        .first()
    )

    if active_project:
        # 6개월 주기 초기화 — 현재 주기 기준 (point-usage 와 동일)
        cycle = get_point_cycle(active_project)
        total_points = cycle["total_points"]
        used_points = cycle_used_points(db, cycle, active_project.seq)
        remaining_points = total_points - used_points
    else:
        total_points = used_points = remaining_points = 0

    point_percent = round((remaining_points / total_points) * 100, 1) if total_points > 0 else 0

    # 무상 유지보수 — 무상 기간 중이거나 최근 종료된 프로젝트 안내 (다른 계약이 진행 중이어도 표시, 프로젝트마다 한 장씩)
    free_maints = []
    today = now.date()
    for free_project in find_free_maint_projects(db, company_id, today) + find_free_ended_projects(db, company_id, today):
        state = free_maint_state(free_project, today)
        free_maints.append({
            "project_id": free_project.seq,
            "project_title": free_project.title,
            "state": state["state"],
            "start_date": state["start_date"],
            "end_date": state["end_date"],
            "days_left": state["days_left"],
            "days_since_end": state["days_since_end"],
            "scope": state["scope"],
            "ending_soon": state["state"] == "free_maint" and state["days_left"] <= FREE_ENDING_SOON_DAYS,
        })

    # 유지보수 전환 안내 — 직원이 고객 안내를 보낸(contacted) 건 + 최근 14일 내 응답한 건(접수 문구 유지)
    renewal_rows = (
        db.query(MaintRenewal)
        .filter(
            MaintRenewal.company_id == company_id,
            (MaintRenewal.status == "contacted")
            | (
                MaintRenewal.status.in_(["accepted", "declined", "estimated"])
                & MaintRenewal.contacted_at.isnot(None)
                & (MaintRenewal.responded_at >= now - timedelta(days=14))
            ),
        )
        .order_by(MaintRenewal.due_date)
        .all()
    )
    maint_renewals = [
        {
            "id": r.seq,
            "project_id": r.project_id,
            "project_title": r.project.title if r.project else "",
            "due_date": r.due_date.isoformat(),
            "days_left": (r.due_date - today).days,
            "status": r.status,
            "responded": r.status != "contacted",
            "chosen_plan": r.chosen_plan,
            "hosting_type": r.hosting_type,
        }
        for r in renewal_rows
    ]

    # 유지보수 구독 정보
    maint_sub = (
        db.query(MaintSubscription)
        .filter(MaintSubscription.company_id == company_id, MaintSubscription.status.in_(["active", "beta"]))
        .order_by(MaintSubscription.created_at.desc())
        .first()
    )

    has_maint_subscription = maint_sub is not None
    maint_plan_type = maint_sub.plan_type if maint_sub else None
    maint_monthly_points = maint_sub.maintenance_points_per_month if maint_sub else 0
    maint_sub_points_used = 0
    maint_sub_points_remaining = 0

    if maint_sub and maint_monthly_points > 0:
        # 구독 충전 주기(6개월) 기준 — 충전 job 과 같은 기간(SPEC A7/D10)
        sub_cycle = subscription_cycle(maint_sub, now.date())
        if sub_cycle:
            maint_sub_points_used = cycle_used_points(db, sub_cycle, company_id=company_id, maintenance_only=True)
            maint_sub_points_remaining = max(0, sub_cycle["total_points"] - maint_sub_points_used)

    MAINT_PLAN_LABELS = {"basic": "BASIC", "growth": "GROWTH", "business": "BUSINESS"}

    PROJECT_TYPE_MAP = {'1': '웹사이트', '2': '모바일앱', '3': '웹앱', '4': '웹사이트+모바일앱', '5': '도메인', '6': '보안서버', '7': '쇼핑몰', '8': '운영', '9': '유지보수', '10': '서버관리', '11': '서버마이그레이션', '12': '호스팅', '13': '개발구독'}

    # project_status: '1'=진행중, '2'=완료, '3'=중지(계약철회 시 PACMS가 3으로 변경)
    # 진행률에는 진행중('1')만 노출한다. NULL은 NOT IN 특성상 기존과 동일하게 제외된다.
    active_projects = db.query(Project).filter(
        Project.company_id == company_id,
        Project.project_status.notin_(["2", "3"]),
    ).all()
    project_progress = []
    today = now.date()

    def _as_date(value):
        return value.date() if isinstance(value, datetime) else value

    for proj in active_projects:
        total_tasks = db.query(func.count(Managelist.seq)).filter(Managelist.project_id == proj.seq).scalar() or 0
        completed_tasks = db.query(func.count(Managelist.seq)).filter(Managelist.project_id == proj.seq, Managelist.status == 4).scalar() or 0

        contract_date = _as_date(proj.contract_date)
        contract_termination_date = _as_date(proj.contract_termination_date)
        if contract_date and contract_termination_date:
            total_days = (contract_termination_date - contract_date).days
            elapsed_days = (today - contract_date).days
            if total_days > 0:
                progress = round(max(0, min(elapsed_days, total_days)) / total_days * 100)
            else:
                progress = 100 if elapsed_days >= 0 else 0
        else:
            progress = 0

        project_progress.append({
            "id": proj.seq, "title": proj.title, "status": proj.project_status,
            "total_tasks": total_tasks, "completed_tasks": completed_tasks, "progress": progress,
            "contract_date": proj.contract_date.isoformat() if proj.contract_date else None,
            "contract_termination_date": proj.contract_termination_date.isoformat() if proj.contract_termination_date else None,
            "project_type": PROJECT_TYPE_MAP.get(proj.project_type, proj.project_type),
            "monthly_point": proj.point or 0,
            "free_maint_state": free_maint_state(proj, today)["state"],
            "free_maint_end_date": proj.free_maint_end_date.isoformat() if proj.free_maint_end_date else None,
        })

    # 개발 구독 정보
    dev_sub = (
        db.query(DevSubscription)
        .filter(DevSubscription.company_id == company_id, DevSubscription.status.in_(["active", "beta"]))
        .first()
    )

    has_dev_subscription = dev_sub is not None
    dev_plan_type = dev_sub.plan_type if dev_sub else None
    dev_points_total = dev_sub.dev_points_per_month if dev_sub else 0
    maint_points_total = dev_sub.maintenance_points_per_month if dev_sub else 0
    dev_points_used = 0
    dev_points_remaining = 0
    maint_points_used = 0
    maint_points_remaining = 0

    if dev_sub:
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if dev_points_total > 0:
            used_dev = db.query(func.sum(func.abs(PointHistory.point))).filter(
                PointHistory.company_id == company_id, PointHistory.point_type == 2,
                PointHistory.status == 2, PointHistory.point_category == "2",
                PointHistory.created_at >= month_start,
            ).scalar() or 0
            dev_points_used = int(used_dev)
            dev_points_remaining = max(0, dev_points_total - dev_points_used)
        if maint_points_total > 0:
            used_maint = db.query(func.sum(func.abs(PointHistory.point))).filter(
                PointHistory.company_id == company_id, PointHistory.point_type == 2,
                PointHistory.status == 2, PointHistory.point_category == "1",
                PointHistory.created_at >= month_start,
            ).scalar() or 0
            maint_points_used = int(used_maint)
            maint_points_remaining = max(0, maint_points_total - maint_points_used)

    PLAN_LABELS = {"starter": "STARTER", "growth": "GROWTH", "scale": "SCALE"}

    return {
        "user": {"name": current_user.name, "company_name": company_name},
        "stat_cards": {"maintenance_count": maintenance_count, "task_count": task_count, "news_count": news_count, "estimate_count": estimate_count},
        "recent_activities": recent_activities,
        "maintenance_stats": {"pending": pending_requests, "in_progress": in_progress_requests, "completed": completed_requests, "monthly_requests": monthly_requests},
        "response_rate": response_rate,
        "worker_stats": worker_stats,
        "latest_news": latest_news,
        "monthly_payment": monthly_payment,
        "point_summary": {"total_points": total_points, "used_points": abs(used_points), "remaining_points": remaining_points, "point_percent": point_percent},
        "project_progress": project_progress,
        "free_maints": free_maints,
        "dev_subscription": {
            "has_dev_subscription": has_dev_subscription,
            "dev_plan_type": dev_plan_type,
            "plan_label": PLAN_LABELS.get(dev_plan_type, "") if dev_plan_type else "",
            "dev_points_total": dev_points_total,
            "dev_points_used": dev_points_used,
            "dev_points_remaining": dev_points_remaining,
            "maint_points_total": maint_points_total,
            "maint_points_used": maint_points_used,
            "maint_points_remaining": maint_points_remaining,
        },
        "maint_subscription": {
            "has_maint_subscription": has_maint_subscription,
            "plan_type": maint_plan_type,
            "plan_label": MAINT_PLAN_LABELS.get(maint_plan_type, "") if maint_plan_type else "",
            "monthly_points": maint_monthly_points,
            "points_used": maint_sub_points_used,
            "points_remaining": maint_sub_points_remaining,
            "hosting_type": maint_sub.hosting_type if maint_sub else None,
            "hosting_label": hosting_label(maint_sub.hosting_type, maint_sub.hosting_provider, maint_sub.start_date, maint_sub.end_date) if maint_sub else None,
        },
        "maint_renewals": maint_renewals,
        "maint_plans": plans_payload() if maint_renewals else None,
    }
