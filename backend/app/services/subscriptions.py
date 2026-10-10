"""구독(개발·유지보수)·유지보수 전환 — cms pacms/maint_renewal_utils.py · managed/views_maint_renewal.py 이식.

cms 와 다른 점(의도적):
- 계약전환(유형 15)이 MaintRenewal 없이 와도 실패하지 않는다(SPEC 05 S5 — cms 는 renewal None 에서 AttributeError 로 전체 롤백).
- 요금 상수는 app/utils/maint_plans.py 한 곳(유지보수), 개발구독은 DEV_PLAN_DEFAULTS(여기).
"""

from datetime import date, datetime, time, timedelta

from dateutil.relativedelta import relativedelta

from sqlalchemy.orm import Session

from app.models.customer import (
    CustomAuthUser,
    DevSubscription,
    Domain,
    Estimate,
    EstimateItem,
    MaintRenewal,
    MaintSubscription,
    MaintSubscriptionService,
    PointHistory,
    Project,
    ProjectDomain,
)
from app.utils.maint_plans import PLAN_DEFAULTS as MAINT_PLAN_DEFAULTS
from app.utils.maint_plans import PLAN_LABELS as MAINT_PLAN_LABELS
from app.utils.maint_plans import plan_monthly_price, plan_services

DEV_PLAN_DEFAULTS = {
    "starter": {"maintenance": 15, "dev": 0, "price": 390000},
    "growth": {"maintenance": 20, "dev": 15, "price": 890000},
    "scale": {"maintenance": 30, "dev": 40, "price": 1790000},
}
DEV_PLAN_LABELS = {"starter": "STARTER", "growth": "GROWTH", "scale": "SCALE"}
SUB_STATUS = {"active": "활성", "inactive": "비활성", "beta": "베타"}
SERVICE_STATUS = {"pending": "준비중", "active": "제공중", "inactive": "중지"}
RENEWAL_STATUS = {"pending": "확인 필요", "contacted": "고객 안내", "accepted": "유지보수 희망", "declined": "유지보수 안 함",
                  "estimated": "견적 생성", "converted": "전환 완료", "ended": "프로젝트 종료", "closed": "연장으로 대체"}
RENEWAL_OPEN = ["pending", "contacted", "accepted", "estimated"]
RENEWAL_TABS = {"pending": ["pending"], "progress": ["contacted", "accepted", "estimated"], "done": ["converted"],
                "closed": ["declined", "ended", "closed"], "all": None}


def beta_price(price: int) -> int:
    return int(price * 0.7)  # cms 와 같이 절사(SPEC 05 R2)


def to_date(v):
    return v.date() if isinstance(v, datetime) else v


def midnight(d):
    return datetime.combine(d, time.min) if d else None


def months_between(start, end) -> int | None:
    """시작~종료(종료일 포함) 개월 수, 남는 일수가 있으면 올림(cms maint_renewal_utils.months_between)."""
    start, end = to_date(start), to_date(end)
    if not start or not end or end < start:
        return None
    rd = relativedelta(end + timedelta(days=1), start)
    return (rd.years * 12 + rd.months + (1 if rd.days else 0)) or None


def parse_months(v) -> int | None:
    try:
        n = int(str(v).strip())
    except (TypeError, ValueError):
        return None
    return n if 1 <= n <= 120 else None


def append_memo(obj, line: str) -> None:
    if not line:
        return
    stamped = f"[{datetime.now():%Y-%m-%d %H:%M}] {line}"
    obj.memo = f"{obj.memo}\n{stamped}" if obj.memo else stamped


def domain_label(domain: Domain | None) -> str:
    if not domain:
        return ""
    urls = domain.all_urls() if hasattr(domain, "all_urls") else []
    return (urls[0] if urls else None) or getattr(domain, "domain_url", None) or f"도메인 #{domain.seq}"


# ── 포인트 현황(회사 전체 누적 — cms 상세와 같은 기준) ───────────────────

def point_summary(db: Session, company_id: int, category: str) -> dict:
    rows = db.query(PointHistory).filter(PointHistory.company_id == company_id, PointHistory.status == "2",
                                         PointHistory.point_category == category).all()
    charged = sum(r.point or 0 for r in rows if str(r.point_type) == "1")
    used = abs(sum(r.point or 0 for r in rows if str(r.point_type) == "2"))
    return {"charged": charged, "used": used, "remaining": charged - used}


# ── 제공 서비스 ──────────────────────────────────────────────────────────

def register_plan_services(db: Session, sub: MaintSubscription, force: bool = False) -> int:
    """요금제 기본 서비스를 pending 으로 등록(cms register_plan_services). 반환: 생성 수."""
    existing = db.query(MaintSubscriptionService).filter(MaintSubscriptionService.subscription_id == sub.seq)
    if existing.count():
        if not force:
            return 0
        existing.delete(synchronize_session=False)
    renewal = db.query(MaintRenewal).filter(MaintRenewal.seq == sub.renewal_id).first() if sub.renewal_id else None
    domain = db.query(Domain).filter(Domain.seq == sub.domain_id).first() if sub.domain_id else None
    if not domain:
        for pid in (renewal.project_id if renewal else None, sub.project_id):
            if not pid:
                continue
            pd = db.query(ProjectDomain).filter(ProjectDomain.project_id == pid).order_by(ProjectDomain.is_primary.desc(), ProjectDomain.seq).first()
            if pd:
                domain = db.query(Domain).filter(Domain.seq == pd.domain_id).first()
                break
    if not domain and renewal and renewal.domain_id:
        domain = db.query(Domain).filter(Domain.seq == renewal.domain_id).first()
    hosting = sub.hosting_type or "I"
    now = datetime.now()
    order = 0
    for svc in plan_services(sub.plan_type, hosting):
        order += 1
        db.add(MaintSubscriptionService(subscription_id=sub.seq, service_code=svc["code"], name=svc["name"], spec=svc["spec"] or None,
                                        status="pending", domain_id=domain.seq if domain and svc["code"] in ("ssl", "sites") else None,
                                        start_date=sub.start_date, end_date=sub.end_date, order_no=order, created_at=now, updated_at=now))
    if hosting == "E":
        order += 1
        ext_end = (renewal.external_hosting_end_date if renewal else None) or (to_date(domain.hosting_end_date) if domain else None)
        db.add(MaintSubscriptionService(subscription_id=sub.seq, service_code="external_hosting", name="외부 호스팅",
                                        spec=sub.hosting_provider or (renewal.hosting_provider if renewal else None), status="pending",
                                        domain_id=domain.seq if domain else None, end_date=ext_end, memo="고객 직접 결제 (참고용)",
                                        order_no=order, created_at=now, updated_at=now))
    return order


# ── 유지보수 전환 견적 ───────────────────────────────────────────────────

def _services_text(services: list[dict]) -> str:
    return ", ".join(f"{s['name']} {s['spec']}".strip() for s in services)


def hosting_note(hosting_type, start=None, end=None, provider=None) -> str:
    start, end = to_date(start), to_date(end)
    if hosting_type == "E":
        note = f"호스팅: 외부({provider or '업체 미기재'}) — 고객 직접 결제"
        if end:
            note += f" / 외부 호스팅 만료일 {end:%Y-%m-%d}(참고)"
        return note
    if start and end:
        return f"호스팅: 한결랩 호스팅 ({start:%Y-%m-%d} ~ {end:%Y-%m-%d})"
    return "호스팅: 한결랩 호스팅"


def maint_estimate_rows(plan: str, hosting_type: str, months: int, h_start=None, h_end=None, provider=None) -> list[dict]:
    """cms maint_estimate_rows — 유지보수 행 + (내부 호스팅이면) 호스팅 행."""
    d = MAINT_PLAN_DEFAULTS.get(plan)
    if not d:
        raise ValueError(f"알 수 없는 요금제: {plan}")
    hosting_type = "E" if hosting_type == "E" else "I"
    from app.utils.maint_plans import PLAN_SERVICES
    all_s = PLAN_SERVICES.get(plan, [])
    maint_s = [s for s in all_s if not s["requires_internal_hosting"]]
    host_s = [s for s in all_s if s["requires_internal_hosting"]]
    label = plan.upper()
    note = hosting_note(hosting_type, h_start, h_end, provider)
    rows = [dict(item_order=1, category="유지보수", item_name=f"유지보수 ({label})",
                 specification=f"{_services_text(maint_s)}\n월 {d['maint_price']:,}원 × {months}개월", quantity=1, unit="식",
                 unit_price=d["maint_price"] * months, remarks=None if hosting_type == "I" else note)]
    if hosting_type == "I":
        h_start, h_end = to_date(h_start), to_date(h_end)
        period = f" ({h_start:%Y-%m-%d} ~ {h_end:%Y-%m-%d})" if h_start and h_end else ""
        storage = next((s["spec"] for s in all_s if s["code"] == "storage"), "")
        rows.append(dict(item_order=2, category="호스팅", item_name=f"호스팅 ({label}, {storage})",
                         specification=f"{_services_text(host_s)}\n월 {d['hosting_price']:,}원 × {months}개월{period}", quantity=1, unit="식",
                         unit_price=d["hosting_price"] * months, remarks=None))
    return rows


def create_renewal_estimate(db: Session, renewal: MaintRenewal, plan: str, months: int, hosting_type: str, provider: str | None,
                            h_start, h_end, staff: CustomAuthUser) -> Estimate:
    """cms create_renewal_estimate — 유형 15 견적(작성중) 생성 + renewal estimated."""
    from app.api.endpoints.managed.estimates import next_estimate_number
    from app.models.company import Company

    d = MAINT_PLAN_DEFAULTS.get(plan)
    if not d:
        raise ValueError(f"알 수 없는 요금제: {plan}")
    hosting_type = "E" if hosting_type == "E" else "I"
    provider = ((provider or "").strip() or None) if hosting_type == "E" else None
    project = db.query(Project).filter(Project.seq == renewal.project_id).first()
    company = db.query(Company).filter(Company.seq == (renewal.company_id or project.company_id)).first()
    today = date.today()
    start = (renewal.due_date or today) + timedelta(days=1)
    end = start + relativedelta(months=months) - timedelta(days=1)
    h_start, h_end = to_date(h_start), to_date(h_end)
    if hosting_type == "I":
        h_start, h_end = h_start or start, h_end or end
    else:
        h_end = h_end or renewal.external_hosting_end_date
    monthly = plan_monthly_price(plan, hosting_type)
    content = "\n".join([
        f"유지보수구독 {plan.upper()} 요금제 {months}개월 ({start:%Y-%m-%d} ~ {end:%Y-%m-%d})",
        f"월 {monthly:,}원 × {months}개월 (VAT 별도)",
        hosting_note(hosting_type, h_start, h_end, provider),
        f"제공 서비스: {_services_text(plan_services(plan, hosting_type))}",
        f"원 프로젝트: {project.title or ''} (기준일 {renewal.due_date:%Y-%m-%d})",
    ])
    now = datetime.now()
    e = Estimate(company_id=company.seq if company else None, project_id=None,
                 estimate_title=f"{company.name if company else ''} 유지보수구독 {plan.upper()} ({months}개월)".strip(),
                 estimate_number=next_estimate_number(db, today), estimate_manager_id=staff.id, estimate_type="유지보수구독",
                 written_date=today, estimate_date=today, validity_period=midnight(today + timedelta(days=30)), payment_terms="잔금 100%",
                 balance_pct=100, balance_due_date=start, delivery_terms="계약 후 즉시", tax_rate=10.0, estimate_content=content,
                 estimate_status="1", project_type="15", contract_date=midnight(start), contract_termination_date=midnight(end),
                 contract_period_range=f"{months}개월", point=d["maintenance"], maint_subscription_plan=plan,
                 maint_hosting_type=hosting_type, maint_hosting_provider=provider, maint_domain_id=renewal.domain_id,
                 maint_hosting_start_date=h_start, maint_hosting_end_date=h_end, created_at=now, updated_at=now)
    db.add(e)
    db.flush()
    for row in maint_estimate_rows(plan, hosting_type, months, h_start, h_end, provider):
        db.add(EstimateItem(estimate_id=e.seq, is_separate=False, created_at=now, updated_at=now, **row))
    renewal.estimate_id = e.seq
    renewal.status = "estimated"
    renewal.chosen_plan = plan
    renewal.contract_months = months
    renewal.hosting_type = hosting_type
    renewal.hosting_provider = provider
    if hosting_type == "E" and h_end:
        renewal.external_hosting_end_date = h_end
    if not renewal.handled_by_id:
        renewal.handled_by_id = staff.id
    renewal.updated_at = now
    return e


def free_maint_remaining(project: Project, today: date | None = None) -> bool:
    from app.utils.free_maint import is_in_free_maint
    today = today or date.today()
    return is_in_free_maint(project, today) or bool(project.free_maint_end_date and to_date(project.free_maint_end_date) >= today)


def end_project_from_renewal(db: Session, renewal: MaintRenewal, staff: CustomAuthUser, memo: str = "") -> None:
    """유지보수 안 함 → 원 프로젝트 완료('2')·요청 불가, 유형 15 면 구독 비활성."""
    now = datetime.now()
    renewal.status = "ended"
    renewal.responded_at = now
    renewal.handled_by_id = staff.id
    append_memo(renewal, f"프로젝트 종료 처리{': ' + memo.strip() if memo and memo.strip() else ''}")
    renewal.updated_at = now
    project = db.query(Project).filter(Project.seq == renewal.project_id).first()
    project.project_status = "2"
    project.maintenance_request_enabled = False
    project.updated_at = now
    if str(project.project_type) == "15":
        db.query(MaintSubscription).filter(MaintSubscription.project_id == project.seq).update(
            {MaintSubscription.status: "inactive", MaintSubscription.updated_at: now}, synchronize_session=False)


# ── 계약전환(유형 13·15) ─────────────────────────────────────────────────

def convert_dev_subscription(db: Session, e: Estimate, project: Project, staff: CustomAuthUser) -> None:
    """cms 계약전환 유형 13 블록 — DevSubscription(active) + 초기 포인트(마커 '초기 유지보수/개발 포인트 충전')."""
    plan = e.dev_subscription_plan
    d = DEV_PLAN_DEFAULTS.get(plan or "")
    if not d:
        return
    now = datetime.now()
    start = to_date(e.contract_date) or date.today()
    sub = DevSubscription(company_id=e.company_id, plan_type=plan, status="active", start_date=start,
                          next_charge_date=start + relativedelta(months=1), is_beta=False, maintenance_points_per_month=d["maintenance"],
                          dev_points_per_month=d["dev"], monthly_price=d["price"], source_estimate_id=e.seq, created_at=now, updated_at=now)
    db.add(sub)
    for cat, key, label in (("1", "maintenance", "유지보수"), ("2", "dev", "개발")):
        if d[key] > 0:
            db.add(PointHistory(company_id=e.company_id, project_id=project.seq, point=d[key], point_type="1", status="2", point_category=cat,
                                content=f"[개발구독 {DEV_PLAN_LABELS[plan]}] 초기 {label} 포인트 충전", writer_id=staff.id,
                                created_at=now, updated_at=now, edited_at=now))


def convert_maint_subscription(db: Session, e: Estimate, project: Project, staff: CustomAuthUser) -> None:
    """cms 계약전환 유형 15 블록 — 도메인 연결/생성 + ProjectDomain + MaintSubscription + 기본 서비스 + 초기 포인트 + 전환 건 converted."""
    plan = e.maint_subscription_plan
    d = MAINT_PLAN_DEFAULTS.get(plan or "")
    if not d:
        return
    now = datetime.now()
    start = to_date(e.contract_date) or date.today()
    end = to_date(e.contract_termination_date)
    renewal = db.query(MaintRenewal).filter(MaintRenewal.estimate_id == e.seq).order_by(MaintRenewal.seq).first()
    hosting = e.maint_hosting_type or (renewal.hosting_type if renewal else None) or "I"
    provider = (e.maint_hosting_provider or (renewal.hosting_provider if renewal else None)) if hosting == "E" else None
    if not project.point and d["maintenance"]:
        project.point = d["maintenance"]
    domain = None
    for did in (e.maint_domain_id, renewal.domain_id if renewal else None):
        if did:
            domain = db.query(Domain).filter(Domain.seq == did).first()
            if domain:
                break
    if not domain:
        domain = db.query(Domain).filter(Domain.company_id == e.company_id).order_by(Domain.seq).first()
    if not domain:
        domain = Domain(company_id=e.company_id, created_at=now, updated_at=now,
                        domain_remarks=f"유지보수구독 계약전환 시 자동 생성 (견적서: {e.estimate_number}) — 도메인 주소 입력 필요")
        db.add(domain)
        db.flush()
    if hosting == "I":
        domain.hosting_type, domain.hosting_provider, domain.hosting_status = "I", None, "A"
        domain.hosting_start_date = midnight(e.maint_hosting_start_date or start)
        domain.hosting_end_date = midnight(e.maint_hosting_end_date or end)
    else:
        domain.hosting_type = "E"
        domain.hosting_provider = provider or domain.hosting_provider
        ext_end = (renewal.external_hosting_end_date if renewal else None) or e.maint_hosting_end_date
        if ext_end:
            domain.hosting_end_date = midnight(ext_end)
    domain.updated_at = now
    url = (domain.all_urls() or [None])[0] if hasattr(domain, "all_urls") else None
    if not db.query(ProjectDomain).filter(ProjectDomain.project_id == project.seq, ProjectDomain.domain_id == domain.seq).first():
        db.add(ProjectDomain(project_id=project.seq, domain_id=domain.seq, domain_url=url, is_primary=True, created_at=now, updated_at=now))
    months = months_between(start, end) if end else None
    first_cycle = min(6, months) if months else 6
    sub = MaintSubscription(company_id=e.company_id, plan_type=plan, status="active", start_date=start,
                            next_charge_date=start + relativedelta(months=6), is_beta=False, maintenance_points_per_month=d["maintenance"],
                            monthly_price=plan_monthly_price(plan, hosting), source_estimate_id=e.seq, project_id=project.seq, end_date=end,
                            renewal_id=renewal.seq if renewal else None, hosting_type=hosting, hosting_provider=provider, domain_id=domain.seq,
                            created_at=now, updated_at=now)
    db.add(sub)
    db.flush()
    register_plan_services(db, sub)
    if renewal:
        renewal.status = "converted"
        renewal.new_project_id = project.seq
        renewal.updated_at = now
        old = db.query(Project).filter(Project.seq == renewal.project_id).first()
        if old and str(old.project_type) == "15":
            db.query(MaintSubscription).filter(MaintSubscription.project_id == old.seq, MaintSubscription.seq != sub.seq).update(
                {MaintSubscription.status: "inactive", MaintSubscription.updated_at: now}, synchronize_session=False)
    if d["maintenance"] > 0:
        db.add(PointHistory(company_id=e.company_id, project_id=project.seq, point=d["maintenance"] * first_cycle, point_type="1", status="2",
                            point_category="1",
                            content=f"[유지보수구독 {MAINT_PLAN_LABELS[plan]}] 초기 유지보수 포인트 충전 ({d['maintenance']}P × {first_cycle}개월)",
                            writer_id=staff.id, contract_date=start, created_at=now, updated_at=now, edited_at=now))


def requests_query(db: Session, kind: str):
    from app.models.customer import Managelist
    col = Managelist.dev_subscription_id if kind == "dev" else Managelist.maint_subscription_id
    return db.query(Managelist).filter(col.isnot(None))


def plan_label(kind: str, plan: str | None) -> str:
    return (DEV_PLAN_LABELS if kind == "dev" else MAINT_PLAN_LABELS).get(plan or "", plan or "")


