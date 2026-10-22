"""재무·만료·정리 job.

- tax_sales_sync: cms sync_tax_data(납부내역 → 매출 세금계산서) 이식. 기준일은 TAX_SYNC_START_DATE.
- purchase_budget_check: cms daily_purchase_budget_check(매입예산 경고, purchase_budget_alert 로 1회).
- estimate_expiry: 발송 상태 견적의 유효기간 D-3·D-1·D-day 담당자 메일. cms 는 자정·재실행 중복 → 09:00 + (견적, D-n) 선점.
- contract_expiry: 계약종료 30일 전 직원 메일(cms 는 '== +30일' → 하루 놓치면 누락). '30일 이내 + (프로젝트, 종료일) 선점'.
- maint_renewal_scan: 전환 후보(D-30) MaintRenewal 생성 + 담당자 의향 확인 메일(notified_at). cms 운영본 소스는 권한상 못 읽어
  maint_renewal_utils.ensure_renewals 기준으로 이식 — 켜기 전에 cms 메일 문구와 대조할 것.
- domain_expiry: 신규(cms 는 미발송 구조) — 활성 도메인/호스팅 만료 30·7일 전 직원 메일.
- fde_notice_check: 상주 계약 최소기간 종료 30일 전·종료 통보 미수신 알림.
- session_cleanup: 만료된 직원 세션 삭제 + 보관 기간 지난 데스크탑 알림 삭제.
"""
from datetime import date, datetime, time, timedelta
from html import escape

from sqlalchemy import or_

from app.core.config import settings
from app.jobs.core import JobContext, pre
from app.models.company import Company
from app.models.customer import (
    CustomAuthUser,
    Domain,
    Estimate,
    MaintRenewal,
    MaintSubscription,
    PaymentAlarm,
    PaymentHistory,
    Payment,
    Project,
    ProjectDomain,
    SalesTaxInvoice,
)
from app.services import billing as bl
from app.services.subscriptions import RENEWAL_OPEN, to_date
from app.utils.free_maint import is_in_free_maint
from app.utils.links import open_link

MANAGER_FIELDS = ("manager_select_contract_seq_id", "manager_select_planning_seq_id", "manager_select_frontend_seq_id",
                  "manager_select_backend_seq_id", "manager_select_design_seq_id", "manager_select_maintenance_seq_id")


def _staff_emails(db) -> list[str]:
    return [u.email for u in db.query(CustomAuthUser).filter(CustomAuthUser.is_active == True) if u.email and "@" in u.email]  # noqa: E712


def _admin_emails(db, *extra_ids) -> list[str]:
    """관리자(슈퍼유저·권한 1) + 지정한 직원(담당자). 비활성·메일 없는 계정은 뺀다."""
    ids = [i for i in extra_ids if i]
    cond = or_(CustomAuthUser.is_superuser == True, CustomAuthUser.previlege == "1")  # noqa: E712
    if ids:
        cond = or_(cond, CustomAuthUser.id.in_(ids))
    return sorted({u.email for u in db.query(CustomAuthUser).filter(CustomAuthUser.is_active == True, cond)  # noqa: E712
                   if u.email and "@" in u.email})


# ── 세금계산서 동기화 ─────────────────────────────────────────────────────

def run_tax_sales_sync(ctx: JobContext) -> None:
    db = ctx.db
    start = date.fromisoformat(settings.TAX_SYNC_START_DATE)
    excluded = db.query(Payment.seq).join(PaymentAlarm, Payment.payment_alarm_id == PaymentAlarm.seq).filter(PaymentAlarm.payment_type != "sales")
    rows = db.query(PaymentHistory).filter(PaymentHistory.payment_id.isnot(None), PaymentHistory.updated_at >= datetime.combine(start, time.min),
                                           ~PaymentHistory.payment_id.in_(excluded)).order_by(PaymentHistory.created_at, PaymentHistory.seq).all()
    updated = linked = created = 0
    claimed: set[int] = set()
    companies = {c.seq: c for c in db.query(Company)}
    for ph in rows:
        dep, prog, bal = int(ph.deposit_amount or 0), int(ph.progress_amount or 0), int(ph.balance_amount or 0)
        amount = dep + prog + bal
        received = amount if ph.payment_tf == "1" else 0
        pay_status = "paid" if received > 0 else "unpaid"
        issued = (dep <= 0 or ph.tax_invoice_date) and (prog <= 0 or ph.progress_tax_invoice_date) and (bal <= 0 or ph.balance_tax_invoice_date) and received > 0
        supply = round(amount / 1.1)
        tax = amount - supply
        inv = db.query(SalesTaxInvoice).filter(SalesTaxInvoice.source_payment_history_id == ph.seq, SalesTaxInvoice.is_deleted == False).first()  # noqa: E712
        if inv:
            changed = False
            if (inv.memo or "").startswith("[자동동기화]") and amount > 0 and (inv.supply_amount != supply or inv.tax_amount != tax):
                inv.supply_amount, inv.tax_amount, changed = supply, tax, True
            if inv.payment_status != pay_status:
                inv.payment_status, changed = pay_status, True
            if issued and inv.issue_status != "issued":
                inv.issue_status, changed = "issued", True
            elif not issued and inv.issue_status not in ("issued", "cancelled", "revised", "pending"):
                inv.issue_status, changed = "pending", True
            if changed:
                inv.updated_at = datetime.now()
                updated += 1
            continue
        if ph.payment_tf != "1" or amount <= 0:
            continue
        d = next((v for v in (ph.balance_tax_invoice_date, ph.progress_tax_invoice_date, ph.tax_invoice_date, ph.balance_date, ph.progress_date,
                              ph.deposit_date, ph.created_at) if v is not None), None)
        if d is None:
            continue
        d = to_date(d)
        match = None
        if ph.company_id is not None:
            best = None
            for c in db.query(SalesTaxInvoice).filter(SalesTaxInvoice.is_deleted == False, SalesTaxInvoice.source_payment_history_id.is_(None),  # noqa: E712
                                                      SalesTaxInvoice.client_id == ph.company_id, SalesTaxInvoice.issue_date >= d - timedelta(days=15),
                                                      SalesTaxInvoice.issue_date <= d + timedelta(days=15)).with_for_update():
                if c.id in claimed or (c.supply_amount or 0) + (c.tax_amount or 0) != amount:
                    continue
                gap = abs((c.issue_date - d).days)
                if best is None or gap < best:
                    match, best = c, gap
        if match:
            claimed.add(match.id)
            match.source_payment_history_id = ph.seq
            if match.payment_status != "paid":
                match.payment_status = "paid"
                match.payment_date = match.payment_date or d
            match.updated_at = datetime.now()
            linked += 1
            continue
        company = companies.get(ph.company_id)
        project = db.query(Project).filter(Project.seq == ph.project_id).first() if ph.project_id else None
        now = datetime.now()
        db.add(SalesTaxInvoice(issue_date=d, buyer_name=company.name if company else "", buyer_no=(getattr(company, "business_number", "") or "") if company else "",
                               client_id=ph.company_id, item=(project.title if project else None) or (company.name if company else ""), supply_amount=supply,
                               tax_amount=tax, payment_status="paid", payment_date=d, issue_status="issued" if issued else "pending", memo="[자동동기화]",
                               is_submitted=False, is_deleted=False, source_payment_history_id=ph.seq, created_at=now, updated_at=now))
        db.flush()
        created += 1
    ctx.log(f"매출 세금계산서 동기화: 갱신 {updated}, 연결 {linked}, 신규 {created} (기준일 {start})")


def run_purchase_budget_check(ctx: JobContext) -> None:
    today = ctx.now.date()
    if ctx.dry_run:
        items = [s for s in bl.purchase_budget_status(ctx.db, today.year, today.month) if s["level"]]
        ctx.log(f"(dry-run) 경고 단계 항목 {len(items)}건")
        return
    items = bl.notify_purchase_budget(ctx.db, today.year, today.month)
    ctx.log(f"{today:%Y-%m} 새 매입예산 경고 {len(items)}건" + "".join(f" · {s['label']} {s['rate']}%" for s in items))


# ── 만료 알림 ────────────────────────────────────────────────────────────

def run_estimate_expiry(ctx: JobContext) -> None:
    from app.services.estimate_calc import amounts
    db, today = ctx.db, ctx.now.date()
    sent = 0
    for e in db.query(Estimate).filter(Estimate.estimate_status == 2, Estimate.validity_period.isnot(None)).all():
        left = (to_date(e.validity_period) - today).days
        # 단계별 1회(D-3·D-1·당일). 하루 빠져도 같은 단계 안이면 다음 실행에서 보낸다
        stage = 0 if left == 0 else 1 if left == 1 else 3 if 2 <= left <= 3 else None
        if stage is None:
            continue
        manager = db.query(CustomAuthUser).filter(CustomAuthUser.id == e.estimate_manager_id).first() if e.estimate_manager_id else None
        if not manager or not manager.email:
            ctx.log(f"견적 {e.estimate_number}: 수신자 없음")
            continue
        if not ctx.claim("estimate_expiry", f"{e.seq}:{to_date(e.validity_period)}:D-{stage}"):
            continue
        urgency = "오늘" if left == 0 else "내일" if left == 1 else f"{left}일 후"
        subject = (f"[긴급] 견적서 유효기간 만료 당일 - {e.estimate_number}" if left == 0 else f"[알림] 견적서 유효기간 {left}일 남음 - {e.estimate_number}")
        company = db.query(Company).filter(Company.seq == e.company_id).first() if e.company_id else None
        html = (f"<h2>견적서 유효기간 만료 알림</h2><p>아래 견적서의 유효기간이 <b>{urgency}</b> 만료됩니다.</p><ul>"
                f"<li>견적번호: {escape(e.estimate_number or '')}</li><li>제목: {escape(e.estimate_title or '')}</li>"
                f"<li>업체명: {escape(company.name if company else '-')}</li><li>유효기간: {to_date(e.validity_period):%Y년 %m월 %d일}</li>"
                f"<li>총 견적금액: {amounts(e)['total']:,}원</li></ul><p>고객에게 연락하여 승인 여부를 확인하시기 바랍니다.</p>"
                f'<p><a href="{open_link(f"/managed/estimate/{e.seq}/", settings.STAFF_BASE_URL)}">견적서 확인하기</a></p>')
        try:
            ctx.send([manager.email], subject, html)
            sent += 1
        except Exception as ex:  # noqa: BLE001
            ctx.mark("estimate_expiry", f"{e.seq}:{to_date(e.validity_period)}:D-{stage}", "failed")
            ctx.log(f"✗ {e.estimate_number}: {ex}")
    ctx.log(f"견적 유효기간 알림 {sent}건")


def run_contract_expiry(ctx: JobContext) -> None:
    db, today = ctx.db, ctx.now.date()
    limit = today + timedelta(days=30)
    sent = 0
    for p in db.query(Project).filter(Project.point > 0, Project.contract_termination_date >= datetime.combine(today, time.min),
                                      Project.contract_termination_date <= datetime.combine(limit, time.max)).all():
        end = to_date(p.contract_termination_date)
        # 수신: 계약·유지보수 담당자 + 관리자(SPEC 10 W3 — 전 직원 발송 중단)
        emails = _admin_emails(db, p.manager_select_contract_seq_id, p.manager_select_maintenance_seq_id)
        if not emails or not ctx.claim("contract_expiry", f"{p.seq}:{end}"):
            continue
        company = db.query(Company).filter(Company.seq == p.company_id).first()
        text_ = (f"업체명: {company.name if company else '-'}\n프로젝트명: {p.title}\n계약일: {to_date(p.contract_date) or '-'}\n계약종료일: {end}\n"
                 f"계약기간: {p.contract_period_range or '-'}\n연장 회차: {p.extension_count or 0}회차\n월 포인트: {p.point or 0}P\n\n"
                 f"프로젝트: {open_link(f'/managed/project_update/{p.seq}', settings.STAFF_BASE_URL)}\n\n본 메일은 PACMS 시스템에서 자동 발송되었습니다.")
        try:
            ctx.send(emails, f"[계약만료 알림] {company.name if company else ''} - {p.title} ({end} 만료)", pre(text_))
            sent += 1
        except Exception as ex:  # noqa: BLE001
            ctx.mark("contract_expiry", f"{p.seq}:{end}", "failed")
            ctx.log(f"✗ 프로젝트 #{p.seq}: {ex}")
    ctx.log(f"계약 만료 알림 {sent}건")


def run_maint_renewal_scan(ctx: JobContext) -> None:
    """기준일(계약종료·무상종료 중 늦은 날, 유형 15 는 구독 종료일)이 오늘~D+30 인 프로젝트마다 전환 건 1개 + 담당자 메일."""
    db, today = ctx.db, ctx.now.date()
    end = today + timedelta(days=30)
    created = notified = 0
    lo, hi = datetime.combine(today, time.min), datetime.combine(end, time.max)
    ended = {r for (r,) in db.query(MaintRenewal.project_id).filter(MaintRenewal.status == "ended")}
    cands = db.query(Project).filter(Project.company_id.isnot(None), or_(Project.project_status.is_(None), Project.project_status != "3"),
                                     ~Project.project_type.in_(["5", "6", "12", "13", "14"]),
                                     or_(Project.contract_termination_date.between(lo, hi), Project.free_maint_end_date.between(today, end),
                                         Project.project_type == "15")).all()
    for p in cands:
        if p.seq in ended:
            continue
        if str(p.project_type) == "15":
            sub_end = db.query(MaintSubscription.end_date).filter(MaintSubscription.project_id == p.seq, MaintSubscription.end_date.isnot(None)).order_by(MaintSubscription.end_date.desc()).first()
            due = sub_end[0] if sub_end else to_date(p.contract_termination_date)
        else:
            due = max([d for d in (to_date(p.contract_termination_date), to_date(p.free_maint_end_date)) if d], default=None)
        if not due or not (today <= due <= end):
            continue
        covering = db.query(MaintSubscription.seq).filter(MaintSubscription.company_id == p.company_id, MaintSubscription.status.in_(["active", "beta"]),
                                                          or_(MaintSubscription.end_date.is_(None), MaintSubscription.end_date >= due))
        if str(p.project_type) == "15":
            covering = covering.filter(or_(MaintSubscription.project_id.is_(None), MaintSubscription.project_id != p.seq))
        if covering.first():
            continue
        r = db.query(MaintRenewal).filter(MaintRenewal.project_id == p.seq, MaintRenewal.due_date == due).first()
        if not r:
            pd = db.query(ProjectDomain).filter(ProjectDomain.project_id == p.seq).order_by(ProjectDomain.is_primary.desc(), ProjectDomain.seq).first()
            dom = db.query(Domain).filter(Domain.seq == pd.domain_id).first() if pd else db.query(Domain).filter(Domain.company_id == p.company_id).order_by(Domain.seq).first()
            ht = dom.hosting_type if dom and dom.hosting_type in ("I", "E") else None
            now = datetime.now()
            r = MaintRenewal(project_id=p.seq, company_id=p.company_id, due_date=due, status="pending", contract_months=12, domain_id=dom.seq if dom else None,
                             hosting_type=ht, hosting_provider=dom.hosting_provider if ht == "E" else None,
                             external_hosting_end_date=to_date(dom.hosting_end_date) if ht == "E" and dom else None, created_at=now, updated_at=now)
            db.add(r)
            db.flush()
            created += 1
        if r.notified_at or r.status not in RENEWAL_OPEN or not ctx.claim("maint_renewal_scan", f"notify:{r.seq}"):
            continue
        ids = {getattr(p, f) for f in MANAGER_FIELDS} - {None}
        emails = [u.email for u in db.query(CustomAuthUser).filter(CustomAuthUser.id.in_(ids or [0]), CustomAuthUser.is_active == True) if u.email] or _staff_emails(db)  # noqa: E712
        company = db.query(Company).filter(Company.seq == p.company_id).first()
        text_ = (f"계약 만료가 다가온 프로젝트의 유지보수 전환 의향을 확인해 주세요.\n\n업체: {company.name if company else ''}\n프로젝트: {p.title}\n"
                 f"계약종료일: {to_date(p.contract_termination_date) or '-'}\n무상 유지보수 종료일: {to_date(p.free_maint_end_date) or '-'}\n전환 기준일: {due}\n"
                 f"{'현재 무상 유지보수 기간입니다.' if is_in_free_maint(p, today) else ''}\n\n유지보수 전환: {open_link(f'/managed/maint-renewal/{r.seq}/', settings.STAFF_BASE_URL)}")
        try:
            ctx.send(emails, f"[유지보수 전환] {company.name if company else ''} {p.title} 의향 확인 요청 (기준일 {due})", pre(text_))
            r.notified_at = datetime.now()
            notified += 1
        except Exception as ex:  # noqa: BLE001
            ctx.mark("maint_renewal_scan", f"notify:{r.seq}", "failed")
            ctx.log(f"✗ 전환 #{r.seq}: {ex}")
    ctx.log(f"유지보수 전환 후보 생성 {created}건, 담당자 알림 {notified}건")


def run_domain_expiry(ctx: JobContext) -> None:
    db, today = ctx.db, ctx.now.date()
    emails = _staff_emails(db)
    sent = 0
    for d in db.query(Domain).all():
        label = (d.all_urls() or [None])[0] if hasattr(d, "all_urls") else None
        label = label or getattr(d, "domain_url", None) or f"도메인 #{d.seq}"
        # 사용중('A') 도메인만(SPEC 03 §3). SSL 은 사용(Y)일 때, 호스팅은 자체(I)일 때. 하위 상태가 비어 있으면 사용중으로 본다
        live = d.domain_status == "A"
        for kind, field, active in (("도메인", "domain_end_date", live),
                                    ("SSL", "domain_ssl_end_date", live and d.domain_ssl_tf == "Y" and d.domain_ssl_status in (None, "", "A")),
                                    ("호스팅", "hosting_end_date", live and d.hosting_type == "I" and d.hosting_status in (None, "", "A"))):
            end = to_date(getattr(d, field, None))
            if not end or not active:
                continue
            left = (end - today).days
            stage = "D-7" if 0 <= left <= 7 else "D-30" if 7 < left <= 30 else None  # 단계별 1회, 하루 빠져도 다음 실행에서 보냄
            if not stage:
                continue
            if not emails or not ctx.claim("domain_expiry", f"{d.seq}:{kind}:{end}:{stage}"):
                continue
            try:
                ctx.send(emails, f"[{kind} 만료 {stage}] {label} ({end})", pre(f"{kind} 만료일: {end} (남은 {left}일)\n\n{open_link(f'/managed/domain_update/{d.seq}/', settings.STAFF_BASE_URL)}"))
                sent += 1
            except Exception as ex:  # noqa: BLE001
                ctx.mark("domain_expiry", f"{d.seq}:{kind}:{end}:{stage}", "failed")
                ctx.log(f"✗ 도메인 #{d.seq}: {ex}")
    ctx.log(f"도메인·호스팅 만료 알림 {sent}건")


def run_fde_notice_check(ctx: JobContext) -> None:
    from app.models.fde import FdeEngagement
    db, today = ctx.db, ctx.now.date()
    emails = [u.email for u in db.query(CustomAuthUser).filter(CustomAuthUser.is_active == True, or_(CustomAuthUser.is_superuser == True, CustomAuthUser.previlege == "1")) if u.email]  # noqa: E712
    n = 0
    for e in db.query(FdeEngagement).filter(FdeEngagement.status == "active", FdeEngagement.plan_id == "fde-resident").all():
        target = e.end_date or e.min_end_date
        if not target or e.notice_received_at or not (0 <= (target - today).days <= 30):
            continue
        if not emails or not ctx.claim("fde_notice_check", f"{e.id}:{target}"):
            continue
        company = db.query(Company).filter(Company.seq == e.company_id).first()
        try:
            ctx.send(emails, f"[FDE] {company.name if company else ''} 상주 계약 종료 예정 {target} — 연장/종료 확인",
                     pre(f"상주 계약 #{e.id} 의 (최소)종료일이 {target} 입니다. 종료 통보가 기록되지 않았습니다.\n\n{open_link(f'/managed/fde/{e.id}', settings.STAFF_BASE_URL)}"))
            n += 1
        except Exception as ex:  # noqa: BLE001
            ctx.mark("fde_notice_check", f"{e.id}:{target}", "failed")
            ctx.log(f"  FDE #{e.id} 발송 실패: {ex}")
    ctx.log(f"FDE 종료 확인 알림 {n}건")


def run_session_cleanup(ctx: JobContext) -> None:
    from app.models.staff_auth import StaffSession
    q = ctx.db.query(StaffSession).filter(StaffSession.expires_at < ctx.now)
    n = q.count()
    if not ctx.dry_run:
        q.delete(synchronize_session=False)
    ctx.log(f"만료 직원 세션 삭제 {n}건")
    from app.models.desktop_notification import DesktopNotification
    from app.services.inbox import RETENTION_DAYS, purge_old
    if ctx.dry_run:
        n = ctx.db.query(DesktopNotification).filter(DesktopNotification.created_at < ctx.now - timedelta(days=RETENTION_DAYS)).count()
    else:
        n = purge_old(ctx.db, ctx.now)
    ctx.log(f"데스크탑 알림 {RETENTION_DAYS}일 지난 것 삭제 {n}건")


def run_free_maint_alerts(ctx: JobContext) -> None:
    """기존 app.jobs.free_maint_alerts 를 스케줄러로 편입(자체 세션·커밋)."""
    from app.jobs import free_maint_alerts as fm
    n = fm.run(ctx.now.date(), dry_run=ctx.dry_run)
    ctx.log(f"무상 유지보수 알림 {n}건")

