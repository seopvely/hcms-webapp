"""유지보수 포인트 잔여·사용량 — 고객·직원 화면 공용(SPEC 02 §3, 05 R9: point_cycle 단일 기준).

사용량 = PointHistory 사용(point_type 2)·실행(status 2) 의 |point| 합, 기간은 6개월 주기 [query_start, query_end).
"""
from datetime import date, datetime, timedelta

from dateutil.relativedelta import relativedelta
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.customer import PointHistory, Project
from app.utils.point_cycle import CYCLE_MONTHS, _as_date, _months_between, get_point_cycle


def cycle_used_points(db: Session, cycle: dict, project_id: int | None = None, company_id: int | None = None,
                      maintenance_only: bool = False) -> int:
    q = db.query(func.sum(func.abs(PointHistory.point))).filter(
        PointHistory.point_type == 2, PointHistory.status == 2,
        PointHistory.created_at >= cycle["query_start"], PointHistory.created_at < cycle["query_end"],
    )
    if project_id is not None:
        q = q.filter(PointHistory.project_id == project_id)
    if company_id is not None:
        q = q.filter(PointHistory.company_id == company_id)
    if maintenance_only:
        q = q.filter(or_(PointHistory.point_category == "1", PointHistory.point_category.is_(None)))
    return int(q.scalar() or 0)


def calculate_remaining_points(project: Project, db: Session, company_id: int) -> int:
    """현재 6개월 주기의 잔여 포인트. 계약 기간 밖이면 0, 0 미만이면 0."""
    if not project.point or project.point <= 0:
        return 0
    cycle = get_point_cycle(project)
    if not cycle:
        return 0
    today = datetime.now().date()
    if today < _as_date(project.contract_date) or today > _as_date(project.contract_termination_date):
        return 0
    return max(0, cycle["total_points"] - cycle_used_points(db, cycle, project.seq, company_id))


def subscription_cycle(sub, today: date | None = None) -> dict | None:
    """유지보수구독의 현재 충전 주기(충전 job 과 같은 6개월 단위, 종료일에서 자른다)."""
    start = _as_date(sub.start_date)
    if not start:
        return None
    today = today or datetime.now().date()
    k = 0
    while start + relativedelta(months=CYCLE_MONTHS * (k + 1)) <= today:
        k += 1
    c_start = start + relativedelta(months=CYCLE_MONTHS * k)
    end_excl = start + relativedelta(months=CYCLE_MONTHS * (k + 1))
    if sub.end_date:
        end_excl = min(end_excl, _as_date(sub.end_date) + timedelta(days=1))
    months = max(min(_months_between(c_start, end_excl - timedelta(days=1)), CYCLE_MONTHS), 1)
    return {
        "start": c_start, "end": end_excl - timedelta(days=1), "months": months,
        "query_start": datetime.combine(c_start, datetime.min.time()),
        "query_end": datetime.combine(end_excl, datetime.min.time()),
        "total_points": months * (sub.maintenance_points_per_month or 0),
    }
