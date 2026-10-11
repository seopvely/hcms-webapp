"""포인트 충전 job — 모두 "다음 충전일(회차) + 밀린 회차 따라잡기 + 행 잠금/선점" 한 가지 패턴(SPEC 05 §10 이관 원칙).

- charge_maint_subscriptions: cms daily_maint_subscription_charge.py 그대로(가장 견고).
- charge_dev_subscriptions: cms 는 next_charge_date == 오늘 일 때만 → 하루 놓치면 영구 누락. 여기선 <= 오늘 따라잡기.
- charge_maint_projects: cms daily_point_charge.py(유형 9) 재작성 — 날짜 정확 일치 대신 회차 선점, 마지막 회차 개월 수를
  일수 올림으로(SPEC 05 B4), POINT_CHARGE_CATCHUP_FROM 이전 회차는 건드리지 않는다.
"""
from datetime import date, datetime, time, timedelta

from dateutil.relativedelta import relativedelta
from sqlalchemy import func, or_

from app.core.config import settings
from app.jobs.core import JobContext
from app.models.jobs import JobRun
from app.models.customer import ContractHistory, DevSubscription, MaintSubscription, PointHistory, Project
from app.services.subscriptions import DEV_PLAN_LABELS, months_between, to_date
from app.utils.maint_plans import PLAN_LABELS as MAINT_PLAN_LABELS

CYCLE = 6


def _points(ctx: JobContext, **kw) -> None:
    now = datetime.now()
    ctx.db.add(PointHistory(point_type="1", status="2", created_at=now, updated_at=now, edited_at=now, **kw))


def run_charge_maint_subscriptions(ctx: JobContext) -> None:
    db, today = ctx.db, ctx.now.date()
    n = 0
    ids = [s for (s,) in db.query(MaintSubscription.seq).filter(MaintSubscription.status.in_(["active", "beta"]), MaintSubscription.next_charge_date <= today)]
    for seq in ids:
        sub = db.query(MaintSubscription).filter(MaintSubscription.seq == seq).with_for_update().first()
        while sub.next_charge_date <= today:
            if sub.end_date and sub.next_charge_date > sub.end_date:
                ctx.log(f"  #{sub.seq}: 종료일 {sub.end_date} 이후 회차({sub.next_charge_date}) — 충전 생략")
                break
            charge = sub.next_charge_date
            k = 1
            while sub.start_date + relativedelta(months=CYCLE * k) <= charge:
                k += 1
            nxt = sub.start_date + relativedelta(months=CYCLE * k)
            months = CYCLE
            if sub.end_date:
                rd = relativedelta(sub.end_date + timedelta(days=1), charge)
                months = max(0, min(CYCLE, rd.years * 12 + rd.months + (1 if rd.days else 0)))
            pts = (sub.maintenance_points_per_month or 0) * months
            end = min(nxt - timedelta(days=1), sub.end_date) if sub.end_date else nxt - timedelta(days=1)
            if pts > 0:
                project_id = sub.project_id
                if not project_id:
                    last = db.query(PointHistory).filter(PointHistory.company_id == sub.company_id, PointHistory.content.like("[유지보수구독%"),
                                                         PointHistory.project_id.isnot(None)).order_by(PointHistory.seq.desc()).first()
                    project_id = last.project_id if last else None
                _points(ctx, company_id=sub.company_id, project_id=project_id, point=pts, point_category="1",
                        content=f"[유지보수구독 {MAINT_PLAN_LABELS.get(sub.plan_type, sub.plan_type)}] 유지보수 포인트 충전 "
                                f"({sub.maintenance_points_per_month}P × {months}개월, 충전일 {charge})",
                        contract_date=charge, contract_termination_date=end)
            sub.next_charge_date = nxt
            sub.updated_at = datetime.now()
            n += 1
            ctx.log(f"  #{sub.seq}: {pts}P ({months}개월, 충전일 {charge}) → 다음 {nxt}")
    ctx.log(f"유지보수구독 충전 {n}회차")


def run_charge_dev_subscriptions(ctx: JobContext) -> None:
    db, today = ctx.db, ctx.now.date()
    n = 0
    ids = [s for (s,) in db.query(DevSubscription.seq).filter(DevSubscription.status.in_(["active", "beta"]), DevSubscription.next_charge_date <= today)]
    for seq in ids:
        sub = db.query(DevSubscription).filter(DevSubscription.seq == seq).with_for_update().first()
        label = DEV_PLAN_LABELS.get(sub.plan_type, sub.plan_type)
        while sub.next_charge_date <= today:
            if sub.maintenance_points_per_month:
                _points(ctx, company_id=sub.company_id, point=sub.maintenance_points_per_month, point_category="1",
                        content=f"[개발구독 {label}] 유지보수 포인트 월 충전", contract_date=sub.start_date)
            if sub.dev_points_per_month:
                _points(ctx, company_id=sub.company_id, point=sub.dev_points_per_month, point_category="2",
                        content=f"[개발구독 {label}] 개발 포인트 월 충전", contract_date=sub.start_date)
            ctx.log(f"  #{sub.seq}: 충전일 {sub.next_charge_date}")
            # 시작일 기준 날짜 유지(31일 시작 구독이 밀리지 않게)
            k = 1
            while sub.start_date + relativedelta(months=k) <= sub.next_charge_date:
                k += 1
            sub.next_charge_date = sub.start_date + relativedelta(months=k)
            sub.updated_at = datetime.now()
            n += 1
    ctx.log(f"개발구독 충전 {n}회차")


def _monthly_point(db, project: Project, charge: date) -> int:
    """회차가 과거 계약 기간에 속하면 그 연장 이력의 월 포인트(cms get_monthly_point_for_date)."""
    for h in db.query(ContractHistory).filter(ContractHistory.project_id == project.seq).order_by(ContractHistory.extension_number):
        if charge <= to_date(h.contract_termination_date):
            return h.point or project.point
    return project.point


def _catchup_floor(db, today: date) -> date:
    """따라잡기 시작일: 설정값, 없으면 이 job 을 처음 실제로 돌린 날(그 뒤 놓친 회차는 다음 실행이 채운다)."""
    if settings.POINT_CHARGE_CATCHUP_FROM:
        return date.fromisoformat(settings.POINT_CHARGE_CATCHUP_FROM)
    first = db.query(func.min(JobRun.started_at)).filter(JobRun.job == "charge_maint_projects", JobRun.dry_run == False).scalar()  # noqa: E712
    return first.date() if first else today


def run_charge_maint_projects(ctx: JobContext) -> None:
    db, today = ctx.db, ctx.now.date()
    floor = _catchup_floor(db, today)
    n = 0
    projects = db.query(Project).filter(Project.project_type == "9", Project.contract_date.isnot(None), Project.point > 0,
                                        Project.contract_date <= datetime.combine(today, time.max),
                                        or_(Project.contract_termination_date.is_(None), Project.contract_termination_date >= datetime.combine(today, time.min))).all()
    for p in projects:
        start, end = to_date(p.contract_date), to_date(p.contract_termination_date)
        k = 0
        while True:
            charge = start + relativedelta(months=CYCLE * k)
            if charge > today or (end and charge > end):
                break
            if charge < floor:
                k += 1
                continue
            period = k + 1
            marker = f"{period}차 "
            done = db.query(PointHistory.seq).filter(PointHistory.project_id == p.seq, PointHistory.point_type == "1",
                                                     PointHistory.content.like(f"{marker}%정기 포인트 충전%")).first()
            if done or not ctx.claim("charge_maint_projects", f"{p.seq}:{charge}"):
                k += 1
                continue
            monthly = _monthly_point(db, p, charge)
            months = CYCLE if not end else min(CYCLE, months_between(charge, end) or 0)
            if months <= 0:
                break
            content = (f"{period}차 6개월 정기 포인트 충전 (월 {monthly} × 6개월)" if months == CYCLE
                       else f"{period}차 정기 포인트 충전 (월 {monthly} × {months}개월, 계약 종료까지)")
            _points(ctx, company_id=p.company_id, project_id=p.seq, point=monthly * months, contract_date=start,
                    contract_termination_date=end, content=content)
            n += 1
            ctx.log(f"  프로젝트 #{p.seq} {p.title}: {content}")
            k += 1
    ctx.log(f"유지보수 프로젝트 충전 {n}회차")
