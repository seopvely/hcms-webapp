"""무상 유지보수 기간 판별 (PACMS가 Project.free_maint_* 를 관리).

계약만료일 다음날부터 N개월간 무상 유지보수 — 기간 중 유지보수 요청은 포인트를 차감하지 않는다.
"""
from datetime import date, datetime, timedelta
from typing import List, Optional

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.models.customer import Project

# 무상 종료 후 전환 유도(플랜 신청/연장 문의)를 노출하는 기간
FREE_ENDED_CTA_DAYS = 60
# 무상 기간 중 종료 임박 경고(전환 CTA 노출) 기준
FREE_ENDING_SOON_DAYS = 30


def as_date(value):
    return value.date() if isinstance(value, datetime) else value


def _today(today: Optional[date] = None) -> date:
    return today or datetime.now().date()


def is_stopped(project: Project) -> bool:
    return str(project.project_status or "") == "3"


def is_contract_active(project: Project, today: Optional[date] = None) -> bool:
    """계약기간 중 + 월 포인트가 있는 유지보수 계약"""
    start, end = as_date(project.contract_date), as_date(project.contract_termination_date)
    if not start or not end or not project.point or project.point <= 0:
        return False
    return start <= _today(today) <= end


def is_in_free_maint(project: Project, today: Optional[date] = None) -> bool:
    """무상 유지보수 기간(계약만료 후 N개월) 여부 - 중지 프로젝트 제외"""
    if is_stopped(project):
        return False
    start, end = as_date(project.free_maint_start_date), as_date(project.free_maint_end_date)
    if not start or not end:
        return False
    return start <= _today(today) <= end


def free_maint_q(today: Optional[date] = None):
    """무상 유지보수 기간 중인 프로젝트 조건"""
    today = _today(today)
    return and_(
        Project.free_maint_start_date <= today,
        Project.free_maint_end_date >= today,
        or_(Project.project_status.is_(None), Project.project_status != "3"),
    )


def contract_active_q(now: Optional[datetime] = None):
    """계약기간 중인 유지보수 프로젝트 조건 (기존 대시보드/포인트 화면 기준)"""
    now = now or datetime.now()
    return and_(Project.point > 0, Project.contract_date <= now, Project.contract_termination_date >= now)


def free_maint_state(project: Project, today: Optional[date] = None) -> dict:
    """프로젝트의 무상 유지보수 상태.

    state:
      free_upcoming — 계약기간 중이며 만료 후 무상 예정
      free_maint    — 무상 유지보수 기간 중
      free_ended    — 무상 종료 후 FREE_ENDED_CTA_DAYS 이내 (전환 유도 대상)
      None          — 무상 유지보수 없음 / 종료 후 오래 지남 / 중지
    """
    today = _today(today)
    start, end = as_date(project.free_maint_start_date), as_date(project.free_maint_end_date)
    result = {
        "state": None,
        "start_date": start.isoformat() if start else None,
        "end_date": end.isoformat() if end else None,
        "days_left": None,
        "days_since_end": None,
        "months": project.free_maint_months,
        "scope": project.free_maint_scope,
    }
    if not start or not end or is_stopped(project):
        return result
    if today < start:
        result["state"] = "free_upcoming"
    elif today <= end:
        result["state"] = "free_maint"
        result["days_left"] = (end - today).days
    elif today <= end + timedelta(days=FREE_ENDED_CTA_DAYS):
        # 계약이 다시 연장되었으면(새 계약기간 중) 전환 유도 대상 아님
        if not is_contract_active(project, today):
            result["state"] = "free_ended"
            result["days_since_end"] = (today - end).days
    return result


def find_free_maint_projects(db: Session, company_id: int, today: Optional[date] = None) -> List[Project]:
    """무상 유지보수 기간 중인 프로젝트 전체 (늦게 끝나는 순)"""
    return (
        db.query(Project)
        .filter(Project.company_id == company_id, free_maint_q(today))
        .order_by(Project.free_maint_end_date.desc())
        .all()
    )


def find_free_ended_projects(db: Session, company_id: int, today: Optional[date] = None) -> List[Project]:
    """최근(FREE_ENDED_CTA_DAYS 이내) 무상 유지보수가 끝난 프로젝트 전체 (최근 종료 순)"""
    today = _today(today)
    candidates = (
        db.query(Project)
        .filter(
            Project.company_id == company_id,
            Project.free_maint_end_date < today,
            Project.free_maint_end_date >= today - timedelta(days=FREE_ENDED_CTA_DAYS),
        )
        .order_by(Project.free_maint_end_date.desc())
        .all()
    )
    return [p for p in candidates if free_maint_state(p, today)["state"] == "free_ended"]


def has_maintenance_access(db: Session, company_id: int) -> bool:
    """유지보수 고객: 포인트 계약기간 중이거나 무상 유지보수 기간 중인 프로젝트가 있다(cms has_maintenance_access)."""
    return db.query(Project.seq).filter(
        Project.company_id == company_id, or_(contract_active_q(), free_maint_q())
    ).first() is not None
