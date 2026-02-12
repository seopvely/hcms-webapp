from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, case, and_
from datetime import datetime, timedelta

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.manager import Manager
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
    news_companies,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("")
def get_dashboard(
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id
    company_name = current_user.company.name if current_user.company else ""

    # Stat counts
    maintenance_count = (
        db.query(func.count(Managelist.seq))
        .filter(Managelist.company_id == company_id)
        .scalar()
        or 0
    )
    task_count = (
        db.query(func.count(Inditask.seq))
        .filter(Inditask.company_id == company_id)
        .scalar()
        or 0
    )

    # News visible to this company: published AND (no company filter OR company in list)
    news_with_company = (
        db.query(News.seq)
        .join(news_companies, news_companies.c.news_id == News.seq)
        .filter(
            News.is_published == True,
            news_companies.c.company_id == company_id,
        )
    )
    news_no_company = (
        db.query(News.seq)
        .outerjoin(news_companies, news_companies.c.news_id == News.seq)
        .filter(
            News.is_published == True,
            news_companies.c.news_id == None,
        )
    )
    news_ids = news_with_company.union(news_no_company).subquery()
    news_count = db.query(func.count()).select_from(news_ids).scalar() or 0

    estimate_count = (
        db.query(func.count(Estimate.seq))
        .filter(Estimate.company_id == company_id)
        .scalar()
        or 0
    )

    # Recent activities: last 5 from maintenance + inquiries combined
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
        activities.append(
            {
                "id": m.id,
                "title": m.title,
                "date": m.date.isoformat() if m.date else None,
                "type": "maintenance",
                "status": m.status,
            }
        )
    for i in recent_inquiries:
        activities.append(
            {
                "id": i.id,
                "title": i.title,
                "date": i.date.isoformat() if i.date else None,
                "type": "inquiry",
                "status": i.status,
            }
        )
    activities.sort(key=lambda x: x["date"] or "", reverse=True)
    recent_activities = activities[:5]

    # Maintenance stats
    current_month_start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    pending_requests = db.query(func.count(Managelist.seq)).filter(
        Managelist.company_id == company_id, Managelist.status == 1
    ).scalar() or 0

    in_progress_requests = db.query(func.count(Managelist.seq)).filter(
        Managelist.company_id == company_id, Managelist.status.in_([2, 3])
    ).scalar() or 0

    completed_requests = db.query(func.count(Managelist.seq)).filter(
        Managelist.company_id == company_id, Managelist.status == 4
    ).scalar() or 0

    monthly_requests = db.query(func.count(Managelist.seq)).filter(
        Managelist.company_id == company_id,
        Managelist.created_at >= current_month_start
    ).scalar() or 0

    # Response rate
    total_inquiries = db.query(func.count(Inquiry.seq)).filter(
        Inquiry.company_id == company_id
    ).scalar() or 0

    answered_inquiries = db.query(func.count(Inquiry.seq)).filter(
        Inquiry.company_id == company_id, Inquiry.status == 2
    ).scalar() or 0

    total_managelist_count = db.query(func.count(Managelist.seq)).filter(
        Managelist.company_id == company_id
    ).scalar() or 0

    # Managelist with at least one comment = answered
    answered_managelist = db.query(func.count(func.distinct(ManagelistComment.managelist_id))).filter(
        ManagelistComment.managelist_id.in_(
            db.query(Managelist.seq).filter(Managelist.company_id == company_id)
        )
    ).scalar() or 0

    total_all = total_inquiries + total_managelist_count
    total_answered = answered_inquiries + answered_managelist
    response_rate = round((total_answered / total_all * 100), 1) if total_all > 0 else 0

    # Worker stats
    six_months_ago = datetime.now() - timedelta(days=180)
    worker_types = [
        (1, "계약"), (2, "기획"), (3, "디자인"),
        (4, "프론트엔드"), (5, "백엔드"), (6, "유지보수")
    ]

    worker_stats = []
    for wt_code, wt_name in worker_types:
        completed_count = db.query(func.count(func.distinct(ManagelistComment.managelist_id))).filter(
            ManagelistComment.managelist_id.in_(
                db.query(Managelist.seq).filter(
                    Managelist.company_id == company_id,
                    Managelist.status == 4
                )
            ),
            ManagelistComment.worker_type == wt_code,
            ManagelistComment.created_at >= six_months_ago
        ).scalar() or 0

        in_progress_count = db.query(func.count(func.distinct(ManagelistComment.managelist_id))).filter(
            ManagelistComment.managelist_id.in_(
                db.query(Managelist.seq).filter(
                    Managelist.company_id == company_id,
                    Managelist.status.in_([2, 3])
                )
            ),
            ManagelistComment.worker_type == wt_code
        ).scalar() or 0

        if completed_count > 0 or in_progress_count > 0:
            worker_stats.append({
                "name": wt_name,
                "completed_count": completed_count,
                "in_progress_count": in_progress_count,
            })

    # Latest news (5 items, filtered by company)
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
    latest_news_items = visible_news_with_company.union(visible_news_no_company).order_by(News.created_at.desc()).limit(5).all()

    latest_news = []
    for n in latest_news_items:
        latest_news.append({
            "id": n.seq,
            "title": n.title,
            "category": n.category,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        })

    # Monthly payment
    monthly_payment_result = db.query(
        func.coalesce(func.sum(Payment.payment_amount), 0).label("total_amount"),
        func.count(Payment.seq).label("count")
    ).filter(
        Payment.company_id == company_id,
        Payment.payment_date >= current_month_start.date()
    ).first()

    monthly_payment = {
        "total_amount": monthly_payment_result.total_amount if monthly_payment_result else 0,
        "count": monthly_payment_result.count if monthly_payment_result else 0,
    }

    # Point summary
    total_points = (
        db.query(func.coalesce(func.sum(PointHistory.point), 0))
        .filter(
            PointHistory.company_id == company_id,
            PointHistory.point_type == 1,  # 충전
            PointHistory.status == 2,  # 실행
        )
        .scalar()
        or 0
    )
    used_points = (
        db.query(func.coalesce(func.sum(PointHistory.point), 0))
        .filter(
            PointHistory.company_id == company_id,
            PointHistory.point_type == 2,  # 사용
            PointHistory.status == 2,  # 실행
        )
        .scalar()
        or 0
    )
    remaining_points = total_points - abs(used_points)
    # Fix: Calculate remaining rate instead of usage rate
    point_percent = (
        round((remaining_points / total_points) * 100, 1) if total_points > 0 else 0
    )

    PROJECT_TYPE_MAP = {
        '1': '웹사이트',
        '2': '모바일앱',
        '3': '웹앱',
        '4': '웹사이트+모바일앱',
        '5': '도메인',
        '6': '보안서버',
        '7': '쇼핑몰',
        '8': '운영',
        '9': '유지보수',
        '10': '서버관리',
        '11': '서버마이그레이션',
        '12': '호스팅',
    }

    # Project progress: active projects
    active_projects = (
        db.query(Project)
        .filter(
            Project.company_id == company_id,
            Project.project_status != "완료",
        )
        .all()
    )
    project_progress = []
    for proj in active_projects:
        total_tasks = (
            db.query(func.count(Managelist.seq))
            .filter(Managelist.project_id == proj.seq)
            .scalar()
            or 0
        )
        completed_tasks = (
            db.query(func.count(Managelist.seq))
            .filter(Managelist.project_id == proj.seq, Managelist.status == 4)
            .scalar()
            or 0
        )
        progress = (
            round((completed_tasks / total_tasks) * 100) if total_tasks > 0 else 0
        )
        project_progress.append(
            {
                "id": proj.seq,
                "title": proj.title,
                "status": proj.project_status,
                "total_tasks": total_tasks,
                "completed_tasks": completed_tasks,
                "progress": progress,
                "contract_date": proj.contract_date.isoformat() if proj.contract_date else None,
                "contract_termination_date": proj.contract_termination_date.isoformat() if proj.contract_termination_date else None,
                "project_type": PROJECT_TYPE_MAP.get(proj.project_type, proj.project_type),
                "monthly_point": proj.point or 0,
            }
        )

    return {
        "user": {
            "name": current_user.name,
            "company_name": company_name,
        },
        "stat_cards": {
            "maintenance_count": maintenance_count,
            "task_count": task_count,
            "news_count": news_count,
            "estimate_count": estimate_count,
        },
        "recent_activities": recent_activities,
        "maintenance_stats": {
            "pending": pending_requests,
            "in_progress": in_progress_requests,
            "completed": completed_requests,
            "monthly_requests": monthly_requests,
        },
        "response_rate": response_rate,
        "worker_stats": worker_stats,
        "latest_news": latest_news,
        "monthly_payment": monthly_payment,
        "point_summary": {
            "total_points": total_points,
            "used_points": abs(used_points),
            "remaining_points": remaining_points,
            "point_percent": point_percent,
        },
        "project_progress": project_progress,
    }
