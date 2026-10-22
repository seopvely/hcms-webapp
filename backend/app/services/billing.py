"""과금 계산 — cms pacms/templatetags/my_filter.py(납부 상태)·managed/plan_utils.py(매출계획·미수금) 이식.

같은 입력에서 cms 와 같은 숫자가 나와야 한다(SPEC 05 §10 R1~R13). 이식하면서 바꾼 점:
- 구독 매출 계획은 MaintSubscription.end_date 이후 달을 넣지 않는다(SPEC 05 §5 '구독 end_date 반영').
- 그 외 식·반올림은 원본 그대로(VAT ÷1.1 ROUND_HALF_UP, 월납 round(), 6개월 초과 미수금 제외 등).
"""
import calendar as cal
import json
import re
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from dateutil.relativedelta import relativedelta
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.ai_dev_subscription import AIDevSubscription
from app.models.company import Company
from app.models.customer import (
    DevSubscription,
    MaintSubscription,
    Outsourcing,
    OutsourcingPayment,
    OutsourcingVendor,
    Payment,
    PaymentAlarm,
    PaymentAlarmHistory,
    PaymentHistory,
    PlanBudget,
    Project,
    PurchaseTaxInvoice,
    SalesLead,
    TithePurchaseCheck,
)

VAT_RATE = Decimal("1.1")
TITHE_RATE = Decimal("0.1")
PIPELINE_WEIGHTS = {"contact": Decimal("0.1"), "meeting": Decimal("0.2"), "proposal": Decimal("0.3"),
                    "estimate": Decimal("0.4"), "negotiation": Decimal("0.6")}
LIVE_SUB = ("active", "beta")
RECEIVABLE_MAX_OVERDUE_MONTHS = 6
EXPENSE_CATEGORIES = ["외주비", "광고선전비", "서버비", "도메인/호스팅비", "소프트웨어 구독료", "통신비", "사무용품비", "소모품비",
                      "접대비", "복리후생비", "회의비", "출장비", "교통비", "차량유지비", "장비구입비", "임차료", "수수료",
                      "교육훈련비", "개발작업", "기타"]
PAYMENT_TYPES = {"1": "선납", "2": "중도금", "3": "월납", "4": "자동이체", "5": "건별", "6": "잔금"}
CYCLE_LABELS = {"monthly": "매월", "yearly": "매년", "custom": "사용자지정", "once": "당월만"}


def to_supply(x) -> int:
    return int((Decimal(str(x or 0)) / VAT_RATE).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _round_half_up(x) -> int:
    return int(Decimal(str(x)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _clamp(y, m, d):
    return min(d, cal.monthrange(y, m)[1])


def _d(v):
    return v.date() if isinstance(v, datetime) else v


def s(v) -> str:
    return "" if v is None else str(v)


# ── 결제일 알람 날짜 ─────────────────────────────────────────────────────

def next_payment_date(alarm: PaymentAlarm, from_date: date | None = None) -> date | None:
    """cms PaymentAlarm.calculate_next_payment_date."""
    today = from_date or date.today()
    cycle = alarm.cycle_type or ("monthly" if alarm.payment_type == "sales" else "")
    if cycle == "monthly":
        y, m = today.year, today.month
        cand = date(y, m, _clamp(y, m, alarm.payment_day))
        if cand <= today:
            y, m = (y + 1, 1) if m == 12 else (y, m + 1)
            cand = date(y, m, _clamp(y, m, alarm.payment_day))
        return cand
    if cycle == "yearly":
        pm = alarm.payment_month or 1
        y = today.year
        cand = date(y, pm, _clamp(y, pm, alarm.payment_day))
        if cand <= today:
            cand = date(y + 1, pm, _clamp(y + 1, pm, alarm.payment_day))
        return cand
    if cycle == "custom":
        months = alarm.cycle_months or 1
        cand = alarm.start_date
        while cand <= today:
            mm = cand.month - 1 + months
            y, m = cand.year + mm // 12, mm % 12 + 1
            cand = date(y, m, _clamp(y, m, alarm.payment_day))
        return cand
    if cycle == "once":
        y, m = alarm.start_date.year, alarm.start_date.month
        cand = date(y, m, _clamp(y, m, alarm.payment_day))
        return cand if cand > today else None
    return None


def expand_alarm_dates(alarm: PaymentAlarm, start: date, end: date, cycle: str | None = None) -> list[date]:
    """cms plan_utils.expand_alarm_dates. cycle 을 주면 알람의 주기 대신 쓴다(이번 달 카드의 'once' 기본값)."""
    a_start, a_end = alarm.start_date, alarm.end_date
    out = []
    cycle = cycle or alarm.cycle_type or ("monthly" if alarm.payment_type == "sales" else "") or ("once" if alarm.payment_type == "outsourcing" else "")
    if cycle == "monthly":
        cur = a_start.replace(day=1)
        limit = end + timedelta(days=1)
        while cur <= limit:
            c = date(cur.year, cur.month, _clamp(cur.year, cur.month, alarm.payment_day))
            if c >= a_start and (a_end is None or c <= a_end) and start <= c <= end:
                out.append(c)
            cur += relativedelta(months=1)
    elif cycle == "yearly":
        month = alarm.payment_month or 1
        for y in range(start.year - 1, end.year + 2):
            c = date(y, month, _clamp(y, month, alarm.payment_day))
            if c >= a_start and (a_end is None or c <= a_end) and start <= c <= end:
                out.append(c)
    elif cycle == "custom" and alarm.cycle_months:
        cur = a_start
        while cur <= end:
            c = date(cur.year, cur.month, _clamp(cur.year, cur.month, alarm.payment_day))
            if (a_end is None or c <= a_end) and start <= c <= end:
                out.append(c)
            cur += relativedelta(months=alarm.cycle_months)
    elif cycle == "once":
        c = date(a_start.year, a_start.month, _clamp(a_start.year, a_start.month, alarm.payment_day))
        if (a_end is None or c <= a_end) and start <= c <= end:
            out.append(c)
    return out


# ── 납부 상태 ────────────────────────────────────────────────────────────

def extra_items(p: Payment) -> list[dict]:
    try:
        items = json.loads(p.extra_items) if isinstance(p.extra_items, str) and p.extra_items else p.extra_items
    except ValueError:
        return []
    if not isinstance(items, list):
        return []
    out = []
    for it in items:
        if not isinstance(it, dict):
            continue
        try:
            amount = int(it.get("amount") or 0)
        except (TypeError, ValueError):
            amount = 0
        month = (it.get("month") or "").strip()
        out.append({"name": it.get("name") or "", "amount": amount, "month": month if re.fullmatch(r"\d{4}-\d{2}", month) else None})
    return out


def _paid_amount(h: PaymentHistory) -> int:
    """납부일이 입력된 계약금/중도금/잔금만 입금으로 본다(cms confirmed_paid_total)."""
    return int((h.deposit_amount or 0) if h.deposit_date else 0) + int((h.progress_amount or 0) if h.progress_date else 0) + \
        int((h.balance_amount or 0) if h.balance_date else 0)


class PaymentContext:
    """납부 상태 계산에 쓰는 이력을 한 번에 읽어 둔다(목록에서 행마다 쿼리하지 않게)."""

    def __init__(self, db: Session, payment_ids: list[int] | None = None):
        q = db.query(PaymentHistory)
        if payment_ids is not None:
            q = q.filter(PaymentHistory.payment_id.in_(payment_ids or [0]))
        self.histories: dict[int, list[PaymentHistory]] = {}
        for h in q:
            self.histories.setdefault(h.payment_id, []).append(h)
        self.projects = {}

    def confirmed(self, pid: int) -> list[PaymentHistory]:
        return [h for h in self.histories.get(pid, []) if s(h.payment_tf) == "1"]


def monthly_summary(p: Payment, project: Project | None, ctx: PaymentContext, now: datetime | None = None) -> dict:
    """cms monthly_payment_summary (월납 누계 충당)."""
    now = now or datetime.now()
    total_amount = int(p.payment_amount or p.production_price or 0)
    extras = extra_items(p)
    extra_total = sum(i["amount"] for i in extras)
    confirmed = ctx.confirmed(p.seq)
    total_paid = sum(_paid_amount(h) for h in confirmed)
    if total_amount <= 0:
        return {"state": "no_amount", "months": [], "total_due": 0, "total_paid": total_paid, "remaining": 0, "single_period": True}
    start = project.contract_date if project else None
    end = project.contract_termination_date if project else None
    start = datetime.combine(start, datetime.min.time()) if isinstance(start, date) and not isinstance(start, datetime) else start
    end = datetime.combine(end, datetime.min.time()) if isinstance(end, date) and not isinstance(end, datetime) else end
    single = not (start and end)
    if single:
        base = p.payment_date or p.created_at or now
        due_list = [(base.strftime("%Y-%m"), total_amount)]
    else:
        if start > now:
            return {"state": "not_started", "months": [], "total_due": 0, "total_paid": total_paid, "remaining": 0, "single_period": False}
        delta = relativedelta(end + timedelta(days=1), start)
        term = delta.years * 12 + delta.months or 1
        monthly_base = max(0, total_amount - extra_total)
        monthly_amount = int(round(monthly_base / term))
        cursor = start.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last = min(now, end).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end_month = end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        labels = []
        while cursor <= last and len(labels) < term:
            labels.append(cursor.strftime("%Y-%m"))
            cursor = cursor + relativedelta(months=1)
        closed = len(labels) >= term or last >= end_month
        alloc: dict[str, int] = {}
        if labels:
            for it in extras:
                if not it["amount"]:
                    continue
                if not it["month"] or it["month"] < labels[0]:
                    target = labels[0]
                elif it["month"] > labels[-1]:
                    if not closed:
                        continue
                    target = labels[-1]
                else:
                    target = it["month"]
                alloc[target] = alloc.get(target, 0) + it["amount"]
        due_list, acc = [], 0
        for i, label in enumerate(labels, start=1):
            cum = monthly_base if i == term else monthly_amount * i
            due_list.append((label, cum - acc + alloc.get(label, 0)))
            acc = cum
    valid = {l for l, _ in due_list}
    targeted, pool = {}, 0
    for h in confirmed:
        amt = _paid_amount(h)
        if not amt:
            continue
        tm = (h.target_month or "").strip()
        if tm and re.fullmatch(r"\d{4}-\d{2}", tm) and tm in valid:
            targeted[tm] = targeted.get(tm, 0) + amt
        else:
            pool += amt
    applied, remaining_pool = {}, pool
    for label, due in due_list:
        t = targeted.get(label, 0)
        if t:
            a = min(t, max(0, due))
            applied[label] = a
            remaining_pool += t - a
    months = []
    for label, due in due_list:
        if due <= 0:
            months.append({"label": label, "due": due, "paid": 0, "state": "paid"})
            continue
        from_t = applied.get(label, 0)
        from_p = max(0, min(remaining_pool, due - from_t))
        remaining_pool -= from_p
        paid = from_t + from_p
        months.append({"label": label, "due": due, "paid": paid, "state": "paid" if paid >= due else "partial" if paid > 0 else "unpaid"})
    overall = "unpaid" if any(m["state"] == "unpaid" for m in months) else "partial" if any(m["state"] == "partial" for m in months) else "paid"
    total_due = sum(m["due"] for m in months)
    return {"state": overall, "months": months, "total_due": total_due, "total_paid": total_paid,
            "remaining": max(0, total_due - sum(m["paid"] for m in months)), "single_period": single}


def payment_status(p: Payment, project: Project | None, ctx: PaymentContext) -> tuple[str, str]:
    """(문구, 색 코드) — cms my_payment_status2 / my_payment_status3. 색 1 파랑 완납 / 2 빨강 / 3 초록 대기 / 4 보라 부분."""
    pt, st = s(p.payment_type), s(p.payment_status)
    if pt == "3":
        sm = monthly_summary(p, project, ctx)
        color = {"paid": "1", "partial": "4", "not_started": "3", "no_amount": "3"}.get(sm["state"], "2")
        if sm["state"] == "not_started":
            return "납부 시작 전", color
        if sm["state"] == "no_amount":
            return "결제금액 미입력", color
        partial = [m for m in sm["months"] if m["state"] == "partial"]
        unpaid = [m["label"] for m in sm["months"] if m["state"] == "unpaid"]
        if not partial and not unpaid:
            last = sm["months"][-1]["label"] if sm["months"] else datetime.now().strftime("%Y-%m")
            return f"{last} 월납결제완료", color
        parts = [f"{m['label']} 부분입금({m['paid']:,}/{m['due']:,})" for m in partial]
        if unpaid:
            parts.append(f"{unpaid[0]}~{unpaid[-1]} {len(unpaid)}개월 미납" if len(unpaid) >= 4 else ", ".join(unpaid) + " 미납")
        text = ", ".join(parts)
        if sm["remaining"] > 0:
            text += f" (미수 {sm['remaining']:,})"
        return text, color
    hist = ctx.histories.get(p.seq, [])
    confirmed = ctx.confirmed(p.seq)
    paid = sum(_paid_amount(h) for h in confirmed)
    billed = p.payment_amount if p.payment_amount is not None else p.production_price
    # 문구
    if confirmed and st == "1":
        text = f"{int(billed) - paid:,} 미납" if billed and paid < int(billed) else "결제완료"
    elif hist and st == "2":
        text = "결제실패"
    elif confirmed and st == "3" and paid == int(billed or 0):
        text = "결제완료"
    elif hist and st == "3" and paid < int(billed or 0):
        text = f"{int(billed) - paid:,} 미납"
    else:
        text = "결제대기"
    # 색
    if confirmed:
        color = ("4" if paid > 0 else "3") if billed and paid < int(billed) else "1"
    elif hist and st == "2":
        color = "2"
    else:
        color = "3"
    return text, color


# ── 매출 실적·미수금·매출계획 ─────────────────────────────────────────────

def revenue_histories(db: Session):
    """월별수익과 같은 기준: 입금확인 납부내역 − 매입/외주 알람 연동분."""
    excluded = db.query(Payment.seq).join(PaymentAlarm, Payment.payment_alarm_id == PaymentAlarm.seq).filter(
        PaymentAlarm.payment_type.in_(["purchase", "outsourcing"]))
    return db.query(PaymentHistory).filter(PaymentHistory.payment_tf == "1").filter(
        or_(PaymentHistory.payment_id.is_(None), ~PaymentHistory.payment_id.in_(excluded)))


def _month_bounds(y, m):
    return datetime(y, m, 1), datetime(y, m, cal.monthrange(y, m)[1], 23, 59, 59)


def monthly_revenue(db: Session, year: int) -> list[dict]:
    """월별수익(부가세 포함): 월별 계약금/중도금/잔금 입금 합."""
    rows = revenue_histories(db).all()
    out = []
    for m in range(1, 13):
        ms, me = _month_bounds(year, m)
        r = {"month": m}
        for f in ("deposit", "progress", "balance"):
            r[f] = sum(int(getattr(h, f"{f}_amount") or 0) for h in rows
                       if getattr(h, f"{f}_date") and ms <= getattr(h, f"{f}_date") <= me)
        r["total"] = r["deposit"] + r["progress"] + r["balance"]
        out.append(r)
    return out


def sales_actual_month_total(rows: list[PaymentHistory], year: int, month: int) -> int:
    ms, me = _month_bounds(year, month)
    total = 0
    for f in ("deposit", "progress", "balance"):
        sub = sum(int(getattr(h, f"{f}_amount") or 0) for h in rows if getattr(h, f"{f}_date") and ms <= getattr(h, f"{f}_date") <= me)
        total += to_supply(sub)
    return total


def receivables(db: Session, today: date) -> tuple[list[dict], list[dict]]:
    """cms _prepayment_receivables — 납부리스트 미납액(부가세 포함), 6개월 넘게 지난 건은 excluded."""
    cutoff = today - relativedelta(months=RECEIVABLE_MAX_OVERDUE_MONTHS)
    alarms = {a.seq: a for a in db.query(PaymentAlarm)}
    payments = [p for p in db.query(Payment).filter(or_(Payment.project_type.is_(None), Payment.project_type != "5"))
                if not (p.payment_alarm_id and alarms.get(p.payment_alarm_id) and (
                    alarms[p.payment_alarm_id].payment_type in ("purchase", "outsourcing")
                    or (alarms[p.payment_alarm_id].payment_type == "sales" and alarms[p.payment_alarm_id].valid_status == "valid")))]
    ctx = PaymentContext(db, [p.seq for p in payments])
    projects = {pr.seq: pr for pr in db.query(Project).filter(Project.seq.in_({p.project_id for p in payments if p.project_id} or {0}))}
    companies = {c.seq: c.name for c in db.query(Company)}
    items, excluded = [], []
    for p in payments:
        project = projects.get(p.project_id)
        base = {"payment_seq": p.seq, "company": companies.get(p.company_id, ""), "project": (project.title or "") if project else "",
                "type_label": PAYMENT_TYPES.get(s(p.payment_type), "")}
        entries = []
        if s(p.payment_type) == "3":
            sm = monthly_summary(p, project, ctx)
            if sm["state"] not in ("unpaid", "partial"):
                continue
            for m in sm["months"]:
                if m["state"] in ("unpaid", "partial") and m["due"] > m["paid"]:
                    y, mo = map(int, m["label"].split("-"))
                    entries.append((f"{m['label']}분", date(y, mo, 1), m["due"] - m["paid"]))
        else:
            billed = int((p.payment_amount if p.payment_amount is not None else p.production_price) or 0)
            confirmed = ctx.confirmed(p.seq)
            paid = sum(_paid_amount(h) for h in confirmed)
            hist = ctx.histories.get(p.seq, [])
            outstanding = 0
            if s(p.payment_status) == "1" and confirmed:
                outstanding = billed - paid
            elif s(p.payment_status) == "3" and hist and paid < billed:
                outstanding = billed - paid
            if outstanding <= 0:
                continue
            fallback = (project.contract_termination_date if s(p.payment_type) == "6" else project.contract_date) if project else None
            expected = _d(p.payment_date) or _d(fallback) or _d(p.created_at) or today
            entries.append((base["type_label"], expected, outstanding))
        for label, expected, amount in entries:
            item = dict(base, label=label, expected_date=expected, amount_vat=int(amount), overdue=expected < today)
            (excluded if expected < cutoff else items).append(item)
    return items, excluded


def build_sales_plan(db: Session, year: int, today: date | None = None, include_tithe: bool = True) -> dict:
    """cms plan_utils.build_sales_plan (공급가 기준)."""
    today = today or date.today()
    cur = (today.year, today.month)
    ys, ye = date(year, 1, 1), date(year, 12, 31)
    months = [{
        "month": m, "is_past": (year, m) < cur, "is_current": (year, m) == cur, "is_future": (year, m) > cur,
        "sales_target": 0, "sales_plan": 0, "sales_plan_remaining": 0, "sales_actual": 0, "pipeline": 0,
        "purchase_target": 0, "purchase_target_base": 0, "purchase_target_by_cat": {c: 0 for c in EXPENSE_CATEGORIES},
        "purchase_plan": 0, "purchase_plan_remaining": 0, "tithe_purchase": 0, "purchase_actual": 0,
        "purchase_actual_by_cat": {c: 0 for c in EXPENSE_CATEGORIES}, "outsourcing_plan": 0, "receivable": 0,
        "receivable_items": [], "purchase_plan_total": 0, "purchase_from_target": False, "sales_items": [],
        "sales_actual_items": [], "pipeline_items": [], "purchase_items": [], "purchase_invoices": [], "outsourcing_items": [],
    } for m in range(1, 13)]

    def M(m):
        return months[m - 1]

    for b in db.query(PlanBudget).filter(PlanBudget.year == year):
        if not 1 <= b.month <= 12:
            continue
        r = M(b.month)
        if b.kind == "sales":
            r["sales_target"] += b.amount
        elif b.kind == "purchase":
            r["purchase_target"] += b.amount
            if b.category:
                r["purchase_target_by_cat"][b.category] = r["purchase_target_by_cat"].get(b.category, 0) + b.amount
            else:
                r["purchase_target_base"] += b.amount

    sales_alarm_ids = [a for (a,) in db.query(PaymentAlarm.seq).filter(PaymentAlarm.payment_type == "sales")]
    confirmed_by_alarm: dict[int, set] = {}
    for aid, pdate in db.query(PaymentAlarmHistory.payment_alarm_id, PaymentAlarmHistory.payment_date).filter(
            PaymentAlarmHistory.payment_alarm_id.in_(sales_alarm_ids or [0]), PaymentAlarmHistory.status == "confirmed",
            PaymentAlarmHistory.payment_date.isnot(None)):
        confirmed_by_alarm.setdefault(aid, set()).add(pdate)
    project_company = {p.seq: (p.company.name if p.company else "") for p in db.query(Project)}
    for a in db.query(PaymentAlarm).filter(PaymentAlarm.payment_type == "sales").filter(
            or_(PaymentAlarm.valid_status == "valid", PaymentAlarm.seq.in_(list(confirmed_by_alarm) or [0]))):
        amt = to_supply(a.amount)
        conf = confirmed_by_alarm.get(a.seq, set())
        dates = expand_alarm_dates(a, ys, ye) if a.valid_status == "valid" else sorted(d for d in conf if ys <= d <= ye)
        for d in dates:
            r = M(d.month)
            r["sales_plan"] += amt
            r["sales_items"].append({"source": "alarm", "source_label": "결제알람", "seq": a.seq, "title": a.title,
                                     "company": project_company.get(a.project_id, ""), "date": d, "amount": amt, "paid": d in conf})

    companies = {c.seq: c.name for c in db.query(Company)}
    for model, label in ((DevSubscription, "개발구독"), (MaintSubscription, "유지보수구독"), (AIDevSubscription, "AI개발팀구독")):
        for sub in db.query(model).filter(model.status.in_(LIVE_SUB)):
            if not sub.monthly_price or not sub.start_date:
                continue
            amt = to_supply(sub.monthly_price)
            end = getattr(sub, "end_date", None)
            for m in range(1, 13):
                if (year, m) < (sub.start_date.year, sub.start_date.month):
                    continue
                if end and (year, m) > (end.year, end.month):
                    continue
                d = date(year, m, _clamp(year, m, sub.start_date.day))
                r = M(m)
                r["sales_plan"] += amt
                r["sales_items"].append({"source": "subscription", "source_label": label, "seq": sub.seq,
                                         "title": f"{label} {(sub.plan_type or '').upper()}", "company": companies.get(sub.company_id, ""),
                                         "date": d, "amount": amt})

    rev = revenue_histories(db).all()
    for m in range(1, 13):
        M(m)["sales_actual"] = sales_actual_month_total(rev, year, m)
    projects = {p.seq: p.title for p in db.query(Project.seq, Project.title)}
    for f, flabel in (("deposit", "계약금"), ("progress", "중도금"), ("balance", "잔금")):
        for h in rev:
            d, amount = getattr(h, f"{f}_date"), getattr(h, f"{f}_amount")
            if not amount or not d or not (datetime(year, 1, 1) <= d <= datetime(year, 12, 31, 23, 59, 59)):
                continue
            M(d.month)["sales_actual_items"].append({"seq": h.seq, "payment_seq": h.payment_id, "company": companies.get(h.company_id, ""),
                                                     "project": projects.get(h.project_id) or "", "field": flabel, "date": _d(d),
                                                     "amount": to_supply(amount), "amount_vat": amount})

    paid_by_month = {r["month"]: {i["payment_seq"] for i in r["sales_actual_items"] if i["payment_seq"]} for r in months}
    rec_items, rec_excluded = receivables(db, today)
    for item in rec_items:
        if item["overdue"]:
            if year != today.year:
                continue
            target = date(year, today.month, 1)
        else:
            target = item["expected_date"].replace(day=1)
        carried = False
        if target.year == year and item["payment_seq"] in paid_by_month.get(target.month, set()):
            target += relativedelta(months=1)
            carried = True
        if target.year != year or (year, target.month) < cur:
            continue
        amt = to_supply(item["amount_vat"])
        M(target.month)["receivable"] += amt
        M(target.month)["receivable_items"].append(dict(item, amount=amt, carried=carried))

    for lead in db.query(SalesLead).filter(SalesLead.expected_close_date >= ys, SalesLead.expected_close_date <= ye,
                                           SalesLead.status.in_(list(PIPELINE_WEIGHTS))):
        base = to_supply(lead.expected_amount)
        if base <= 0:
            continue
        w = PIPELINE_WEIGHTS[lead.status]
        weighted = _round_half_up(Decimal(base) * w)
        r = M(lead.expected_close_date.month)
        r["pipeline"] += weighted
        r["pipeline_items"].append({"seq": lead.seq, "title": lead.title, "company": lead.client_company or companies.get(lead.company_id, ""),
                                    "status": lead.status, "weight": int(w * 100), "date": lead.expected_close_date,
                                    "amount": base, "weighted": weighted})

    realized = {}
    for inv in db.query(PurchaseTaxInvoice).filter(PurchaseTaxInvoice.is_deleted == False, PurchaseTaxInvoice.issue_date >= ys,  # noqa: E712
                                                   PurchaseTaxInvoice.issue_date <= ye).order_by(PurchaseTaxInvoice.issue_date, PurchaseTaxInvoice.id):
        r = M(inv.issue_date.month)
        r["purchase_actual"] += inv.supply_amount or 0
        catk = inv.expense_category or "기타"
        r["purchase_actual_by_cat"][catk] = r["purchase_actual_by_cat"].get(catk, 0) + (inv.supply_amount or 0)
        r["purchase_invoices"].append({"id": inv.id, "date": inv.issue_date, "supplier": inv.supplier_name, "item": inv.item,
                                       "category": catk, "amount": inv.supply_amount or 0, "alarm_id": inv.source_payment_alarm_id})
        if inv.source_payment_alarm_id:
            realized.setdefault((inv.source_payment_alarm_id, inv.issue_date.month), inv)

    tithe_checked = {(m, a) for m, a in db.query(TithePurchaseCheck.month, TithePurchaseCheck.payment_alarm_id).filter(
        TithePurchaseCheck.year == year, TithePurchaseCheck.checked == True)}  # noqa: E712
    for a in db.query(PaymentAlarm).filter(PaymentAlarm.payment_type == "purchase", PaymentAlarm.valid_status == "valid"):
        amt = to_supply(a.amount)
        for d in expand_alarm_dates(a, ys, ye):
            r = M(d.month)
            inv = realized.get((a.seq, d.month)) if (d.year, d.month) <= cur else None
            r["purchase_plan"] += amt
            if not inv:
                r["purchase_plan_remaining"] += amt
            checked = (d.month, a.seq) in tithe_checked
            if checked:
                r["tithe_purchase"] += amt
            r["purchase_items"].append({"tithe_checked": checked, "seq": a.seq, "title": a.title, "cycle": CYCLE_LABELS.get(a.cycle_type or "", ""),
                                        "date": d, "amount": amt, "realized": bool(inv), "realized_amount": inv.supply_amount if inv else None})

    vendors = {v.seq: v.name for v in db.query(OutsourcingVendor)}
    for o in db.query(Outsourcing).filter(Outsourcing.status == "active"):
        if o.amount is None:
            continue
        pays = db.query(OutsourcingPayment).filter(OutsourcingPayment.outsourcing_id == o.seq).all()
        paid = sum((Decimal(p.amount) for p in pays), Decimal(0))
        remaining = to_supply(o.amount) - to_supply(paid)
        if remaining <= 0:
            continue
        future = sorted(p.expected_paid_date for p in pays if p.expected_paid_date and p.expected_paid_date >= today)
        planned = future[0] if future else o.end_date
        overdue = planned is not None and planned < today
        if overdue:
            if year != today.year:
                continue
            tm = today.month
        else:
            if planned is None or planned.year != year:
                continue
            tm = planned.month
        r = M(tm)
        r["outsourcing_plan"] += remaining
        r["outsourcing_items"].append({"seq": o.seq, "vendor": vendors.get(o.vendor_id, ""), "project": projects.get(o.project_id) or "",
                                       "date": planned, "overdue": overdue, "amount": to_supply(o.amount), "paid": to_supply(paid),
                                       "remaining": remaining})

    def rate(n, d):
        return round(n / d * 100, 1) if d else None

    for r in months:
        if r["is_future"]:
            r["sales_plan_remaining"] = sum(i["amount"] for i in r["sales_items"] if not i.get("paid"))
        elif r["is_current"]:
            r["sales_plan_remaining"] = sum(i["amount"] for i in r["sales_items"] if i["date"] > today and not i.get("paid"))
        else:
            r["sales_plan_remaining"] = 0
            r["purchase_plan_remaining"] = 0
        if r["is_past"]:
            r["sales_expected"], r["purchase_expected"] = r["sales_actual"], r["purchase_actual"]
            r["profit"] = r["sales_actual"] - r["purchase_actual"]
            r["sales_achievement"] = rate(r["sales_actual"], r["sales_target"])
            r["purchase_rate"] = rate(r["purchase_actual"], r["purchase_target"])
        elif r["is_future"]:
            r["sales_expected"] = r["sales_plan_remaining"] + r["receivable"]
            r["purchase_plan_total"] = r["purchase_plan"] + r["outsourcing_plan"]
            r["purchase_from_target"] = r["purchase_target"] > r["purchase_plan_total"]
            r["purchase_expected"] = max(r["purchase_target"], r["purchase_plan_total"])
            r["profit"] = r["sales_expected"] - r["purchase_expected"]
            r["sales_achievement"] = rate(r["sales_expected"], r["sales_target"])
            r["purchase_rate"] = rate(r["purchase_expected"], r["purchase_target"])
        else:
            r["sales_expected"] = r["sales_actual"] + r["sales_plan_remaining"] + r["receivable"]
            r["purchase_expected"] = r["purchase_actual"] + r["purchase_plan_remaining"] + r["outsourcing_plan"]
            r["profit"] = r["sales_expected"] - r["purchase_expected"]
            r["sales_achievement"] = rate(r["sales_actual"], r["sales_target"])
            r["purchase_rate"] = rate(r["purchase_actual"], r["purchase_target"])
        r["sales_expected_achievement"] = rate(r["sales_expected"], r["sales_target"])
        r["profit_before_tithe"] = r["profit"]
        r["tithe_base"] = max(r["sales_expected"] - r["tithe_purchase"], 0)
        r["tithe"] = _round_half_up(Decimal(r["tithe_base"]) * TITHE_RATE) if include_tithe else 0
        r["profit"] = r["profit_before_tithe"] - r["tithe"]
        for k in ("sales_items", "purchase_items"):
            r[k].sort(key=lambda i: (i["date"], i["title"]))
        r["sales_actual_items"].sort(key=lambda i: (i["date"], i["seq"]))
        r["receivable_items"].sort(key=lambda i: (i["expected_date"], i["payment_seq"]))

    keys = ["sales_target", "sales_plan", "receivable", "sales_actual", "sales_expected", "pipeline", "purchase_target",
            "purchase_target_base", "purchase_plan", "purchase_plan_remaining", "purchase_actual", "outsourcing_plan",
            "purchase_expected", "profit_before_tithe", "tithe_purchase", "tithe_base", "tithe", "profit"]
    totals = {k: sum(r[k] for r in months) for k in keys}
    totals["sales_achievement"] = rate(totals["sales_expected"], totals["sales_target"])
    totals["purchase_rate"] = rate(totals["purchase_expected"], totals["purchase_target"])
    return {
        "year": year, "today": today, "months": months, "totals": totals, "categories": EXPENSE_CATEGORIES,
        "receivable_excluded": {"count": len(rec_excluded), "amount": sum(to_supply(i["amount_vat"]) for i in rec_excluded),
                                "amount_vat": sum(i["amount_vat"] for i in rec_excluded), "months": RECEIVABLE_MAX_OVERDUE_MONTHS,
                                "items": sorted(rec_excluded, key=lambda i: i["expected_date"])},
    }


def recent_sales_average(db: Session, today: date, n_months: int = 3):
    """최근 n개 완료월 매출 실적(공급가) 월평균."""
    first = today.replace(day=1)
    rev = revenue_histories(db).all()
    monthly = []
    for i in range(n_months, 0, -1):
        d = first - relativedelta(months=i)
        monthly.append((d, sales_actual_month_total(rev, d.year, d.month)))
    avg = _round_half_up(Decimal(sum(v for _, v in monthly)) / Decimal(n_months))
    return avg, first - relativedelta(months=n_months), first - timedelta(days=1), monthly


# ── 월별 손익·자금흐름 ───────────────────────────────────────────────────

def _invoiced_outsourcing_ids(db: Session) -> set:
    """매입계산서가 이미 잡힌 외주건 — 외주 지급을 따로 더하면 중복이라 뺀다."""
    return {o for (o,) in db.query(PurchaseTaxInvoice.source_outsourcing_id).filter(
        PurchaseTaxInvoice.is_deleted == False, PurchaseTaxInvoice.source_outsourcing_id.isnot(None))}  # noqa: E712


def _cash_flows_between(db: Session, start: date, end: date) -> dict[date, dict]:
    """일자별 현금 유입·유출(부가세 포함). 유입은 입금확인 납부내역, 유출은 매입계산서 발행일·외주 지급일."""
    flows: dict[date, dict] = {}

    def add(d, key, amount):
        if d and amount and start <= d <= end:
            flows.setdefault(d, {"in": 0, "out_purchase": 0, "out_outsourcing": 0})[key] += int(amount)

    for h in revenue_histories(db):
        for f in ("deposit", "progress", "balance"):
            add(_d(getattr(h, f"{f}_date")), "in", getattr(h, f"{f}_amount"))
    for inv in db.query(PurchaseTaxInvoice).filter(PurchaseTaxInvoice.is_deleted == False, PurchaseTaxInvoice.issue_date >= start,  # noqa: E712
                                                   PurchaseTaxInvoice.issue_date <= end):
        add(inv.issue_date, "out_purchase", (inv.supply_amount or 0) + (inv.tax_amount or 0))
    invoiced = _invoiced_outsourcing_ids(db)
    for p in db.query(OutsourcingPayment).filter(OutsourcingPayment.paid_date >= start, OutsourcingPayment.paid_date <= end):
        if p.outsourcing_id not in invoiced:
            add(_d(p.paid_date), "out_outsourcing", p.amount)
    return flows


# 매입 세금계산서가 빠짐없이 쌓이기 시작한 달. 그 전 달은 몇 건만 있어 손익 화면에서 「매입 데이터 없음」으로 흐리게 표시한다.
PURCHASE_DATA_START = date(2026, 7, 1)


def build_pl_cashflow(db: Session, year: int, today: date | None = None) -> dict:
    """손익은 공급가(build_sales_plan 실적 + 외주 지급), 자금흐름은 부가세 포함. 잔액은 기준잔액(cash_balance_snapshot)부터 추정."""
    from app.models.cash import CashBalanceSnapshot

    today = today or date.today()
    plan = build_sales_plan(db, year, today)
    ys, ye = date(year, 1, 1), date(year, 12, 31)
    snaps = db.query(CashBalanceSnapshot).filter(CashBalanceSnapshot.as_of_date <= ye).order_by(CashBalanceSnapshot.as_of_date).all()
    before = [s for s in snaps if s.as_of_date <= ys]
    used = ([before[-1]] if before else []) + [s for s in snaps if s.as_of_date > ys]
    flow_start = min([ys] + [s.as_of_date for s in used])
    flows = _cash_flows_between(db, flow_start, ye)

    def net_between(a: date, b: date) -> int:
        return sum(v["in"] - v["out_purchase"] - v["out_outsourcing"] for d, v in flows.items() if a <= d <= b)

    data_start = PURCHASE_DATA_START
    months, cumulative = [], 0
    for r in plan["months"]:
        m = r["month"]
        ms, me = date(year, m, 1), date(year, m, cal.monthrange(year, m)[1])
        cash = {"in": 0, "out_purchase": 0, "out_outsourcing": 0}
        for d, v in flows.items():
            if ms <= d <= me:
                for k in cash:
                    cash[k] += v[k]
        cash["net"] = cash["in"] - cash["out_purchase"] - cash["out_outsourcing"]
        cumulative += cash["net"]
        cash["cumulative"] = cumulative
        snap = next((s for s in reversed(used) if s.as_of_date <= me), None)
        cash["balance_est"] = None if r["is_future"] or not snap else int(snap.amount) + net_between(snap.as_of_date, me)
        cash["balance_from"] = snap.as_of_date if snap and cash["balance_est"] is not None else None

        outsourcing_paid = to_supply(cash["out_outsourcing"])
        cost = r["purchase_actual"] + outsourcing_paid
        pl = {"sales_actual": r["sales_actual"], "purchase_actual": r["purchase_actual"],
              "purchase_actual_by_cat": {c: v for c, v in r["purchase_actual_by_cat"].items() if v},
              "outsourcing_paid": outsourcing_paid, "cost": cost,
              "tithe": _round_half_up(Decimal(max(r["sales_actual"] - r["tithe_purchase"], 0)) * TITHE_RATE)}
        pl["profit"] = pl["sales_actual"] - cost - pl["tithe"]
        expected = None if r["is_past"] else {"sales": r["sales_expected"], "purchase": r["purchase_expected"], "profit": r["profit"]}
        months.append({"month": m, "is_past": r["is_past"], "is_current": r["is_current"], "is_future": r["is_future"],
                       "purchase_missing": ms < data_start, "pl": pl, "expected": expected, "cash": cash})

    pl_keys = ("sales_actual", "purchase_actual", "outsourcing_paid", "cost", "tithe", "profit")
    cash_keys = ("in", "out_purchase", "out_outsourcing", "net")
    totals = {"pl": {k: sum(x["pl"][k] for x in months) for k in pl_keys},
              "pl_by_cat": {c: sum(x["pl"]["purchase_actual_by_cat"].get(c, 0) for x in months) for c in EXPENSE_CATEGORIES},
              "cash": {k: sum(x["cash"][k] for x in months) for k in cash_keys}}
    totals["pl_by_cat"] = {c: v for c, v in totals["pl_by_cat"].items() if v}
    latest = next((x["cash"] for x in reversed(months) if x["cash"]["balance_est"] is not None), None)
    return {"year": year, "today": today, "months": months, "totals": totals, "categories": EXPENSE_CATEGORIES,
            "purchase_data_start": data_start, "latest_balance": latest and {"amount": latest["balance_est"], "from": latest["balance_from"]},
            "snapshots": [{"id": s.id, "as_of_date": s.as_of_date, "amount": s.amount, "memo": s.memo or ""} for s in used],
            "year_options": list(range(today.year - 3, today.year + 2))}


def recent_purchase_category_average(db: Session, today: date, n_months: int = 3):
    """최근 n개 완료월 매입 세금계산서 공급가 분류별 월평균."""
    end = today.replace(day=1) - timedelta(days=1)
    start = today.replace(day=1) - relativedelta(months=n_months)
    rows = db.query(PurchaseTaxInvoice.expense_category, func.sum(PurchaseTaxInvoice.supply_amount)).filter(
        PurchaseTaxInvoice.is_deleted == False, PurchaseTaxInvoice.issue_date >= start,  # noqa: E712
        PurchaseTaxInvoice.issue_date <= end).group_by(PurchaseTaxInvoice.expense_category)
    result = {}
    for catk, total in rows:
        avg = _round_half_up(Decimal(total or 0) / Decimal(n_months))
        if avg > 0:
            result[catk or "기타"] = result.get(catk or "기타", 0) + avg
    return result, start, end


def sync_sales_alarm(db: Session, alarm: PaymentAlarm, today: date | None = None) -> int:
    """cms sync_sales_alarm_payments — 납부내역 입금확인을 매출 알람 회차에 반영. 반환: 새로 확인된 회차 수."""
    if alarm.payment_type != "sales":
        return 0
    today = today or date.today()
    all_fields = [("deposit_date", "deposit_amount"), ("progress_date", "progress_amount"), ("balance_date", "balance_amount")]
    by_sub = {"1": all_fields[:1], "2": all_fields[1:2], "6": all_fields[2:]}

    def paid_months(rows, fields):
        out = {}
        for ph in rows:
            for df, af in fields:
                d = getattr(ph, df)
                if d and (getattr(ph, af) or 0) > 0:
                    out.setdefault((d.year, d.month), ph.seq)
        return out

    linked_payment_ids = [p for (p,) in db.query(Payment.seq).filter(Payment.payment_alarm_id == alarm.seq)]
    linked = db.query(PaymentHistory).filter(PaymentHistory.payment_id.in_(linked_payment_ids or [0]), PaymentHistory.payment_tf == "1").all()
    paid = paid_months(linked, all_fields)
    if alarm.project_id:
        alarm_payment_ids = db.query(Payment.seq).filter(Payment.payment_alarm_id.isnot(None))
        rows = db.query(PaymentHistory).filter(PaymentHistory.project_id == alarm.project_id, PaymentHistory.payment_tf == "1").filter(
            or_(PaymentHistory.payment_id.is_(None), ~PaymentHistory.payment_id.in_(alarm_payment_ids))).all()
        for k, v in paid_months(rows, by_sub.get(alarm.payment_sub_type or "", all_fields)).items():
            paid.setdefault(k, v)
    if not paid:
        return 0
    range_end = today.replace(day=1) + relativedelta(months=1) - timedelta(days=1)
    if alarm.next_payment_date and alarm.next_payment_date > range_end:
        range_end = alarm.next_payment_date
    occurrences = expand_alarm_dates(alarm, alarm.start_date.replace(day=1), range_end)
    confirmed = {d for (d,) in db.query(PaymentAlarmHistory.payment_date).filter(
        PaymentAlarmHistory.payment_alarm_id == alarm.seq, PaymentAlarmHistory.status == "confirmed")}
    new, paid_occ = 0, set()
    now = datetime.now()
    for occ in occurrences:
        ph_seq = paid.get((occ.year, occ.month))
        if not ph_seq:
            continue
        paid_occ.add(occ)
        if occ in confirmed:
            continue
        db.add(PaymentAlarmHistory(payment_alarm_id=alarm.seq, sent_at=now, status="confirmed", payment_date=occ, recipient_count=0,
                                   recipients=f"매출동기화 입금확인 (PaymentHistory #{ph_seq})", created_at=now))
        new += 1
    for ph in linked:
        if ph.payment_id:
            db.query(Payment).filter(Payment.seq == ph.payment_id, Payment.payment_status == "3").update(
                {Payment.payment_status: "1"}, synchronize_session=False)
    if not paid_occ:
        return new
    if (alarm.cycle_type or "monthly") == "once":
        if alarm.valid_status != "invalid":
            alarm.valid_status = "invalid"
            alarm.updated_at = now
    else:
        nxt, moved = alarm.next_payment_date, False
        while nxt and nxt in paid_occ:
            nxt = next_payment_date(alarm, nxt)
            moved = True
        if moved:
            alarm.next_payment_date = nxt
            alarm.updated_at = now
    return new


# ── 매입 예산 경고(cms plan_utils.purchase_budget_status · budget_alerts) ───────────

BUDGET_WARN_RATE, BUDGET_OVER_RATE = 80, 100
BUDGET_LEVEL_LABELS = {"warn": "경고", "over": "초과"}


def purchase_budget_status(db: Session, year: int, month: int) -> list[dict]:
    """해당 월 매입 목표 대비 실적(공급가). 월 전체(category='')가 첫 항목, 분류는 집행률 높은 순."""
    targets, total_target = {}, 0
    for b in db.query(PlanBudget).filter(PlanBudget.year == year, PlanBudget.month == month, PlanBudget.kind == "purchase"):
        total_target += b.amount
        if b.category:
            targets[b.category] = targets.get(b.category, 0) + b.amount
    ms, me = date(year, month, 1), date(year, month, cal.monthrange(year, month)[1])
    actuals = {}
    for catk, total in db.query(PurchaseTaxInvoice.expense_category, func.sum(PurchaseTaxInvoice.supply_amount)).filter(
            PurchaseTaxInvoice.is_deleted == False, PurchaseTaxInvoice.issue_date >= ms, PurchaseTaxInvoice.issue_date <= me  # noqa: E712
    ).group_by(PurchaseTaxInvoice.expense_category):
        actuals[catk or "기타"] = actuals.get(catk or "기타", 0) + int(total or 0)

    def entry(catk, label, target, actual):
        rate = round(actual / target * 100, 1) if target else None
        level = None if rate is None else "over" if rate >= BUDGET_OVER_RATE else "warn" if rate >= BUDGET_WARN_RATE else None
        return {"category": catk, "label": label, "target": target, "actual": actual, "rate": rate, "level": level}

    out = [entry("", "월 전체", total_target, sum(actuals.values()))] if total_target > 0 else []
    for catk in sorted(targets, key=lambda c: -(actuals.get(c, 0) / targets[c] if targets[c] else 0)):
        if targets[catk] > 0:
            out.append(entry(catk, catk, targets[catk], actuals.get(catk, 0)))
    return out


def budget_warning_messages(db: Session, year: int, month: int, categories: set | None = None) -> list[str]:
    msgs = []
    for s_ in purchase_budget_status(db, year, month):
        if not s_["level"] or (categories is not None and s_["category"] and s_["category"] not in categories):
            continue
        msgs.append(f"{year}년 {month}월 {s_['label']} 매입 집행률 {s_['rate']}% ({BUDGET_LEVEL_LABELS[s_['level']]}: "
                    f"목표 {s_['target']:,}원 / 실적 {s_['actual']:,}원)")
    return msgs


def notify_purchase_budget(db: Session, year: int, month: int) -> list[dict]:
    """새로 경고/초과에 도달한 항목을 기록(purchase_budget_alert)하고 에이전트에게 메일 — 같은 단계는 한 번만."""
    from app.core.config import settings
    from app.models.customer import CustomAuthUser, PurchaseBudgetAlert
    from app.services.email import send_email_sync

    logged = {(a.category, a.level) for a in db.query(PurchaseBudgetAlert).filter(PurchaseBudgetAlert.year == year, PurchaseBudgetAlert.month == month)}
    new = [x for x in purchase_budget_status(db, year, month) if x["level"] and (
        (x["level"] == "over" and (x["category"], "over") not in logged)
        or (x["level"] == "warn" and (x["category"], "warn") not in logged and (x["category"], "over") not in logged))]
    if not new:
        return []
    recipients = [u.email for u in db.query(CustomAuthUser).filter(CustomAuthUser.group == "agent", CustomAuthUser.is_active == True) if u.email]  # noqa: E712
    error = ""
    if recipients:
        has_over = any(x["level"] == "over" for x in new)
        lines = [f"{year}년 {month}월 매입 목표 대비 집행률이 기준에 도달했습니다.", ""]
        lines += [f"- [{BUDGET_LEVEL_LABELS[x['level']]}] {x['label']}: {x['rate']}% (목표 {x['target']:,}원 / 실적 {x['actual']:,}원)" for x in new]
        lines += ["", "※ 경고 = 목표의 80% 이상, 초과 = 100% 이상. 금액은 공급가(부가세 제외) 기준입니다.",
                  f"매출·매입계획에서 확인: {settings.STAFF_BASE_URL}/managed/sales-plan/?year={year}&month={month}", "", "PACMS 시스템",
                  date.today().strftime("%Y-%m-%d")]
        from html import escape
        try:
            send_email_sync(recipients, f"[PACMS] {year}년 {month}월 매입 예산 {'초과' if has_over else '경고'} 알림",
                            "<pre style='font-family:inherit'>" + escape("\n".join(lines)) + "</pre>")
        except Exception as e:  # noqa: BLE001 — 메일 실패가 등록을 막지 않게
            error = str(e)
    now = datetime.now()
    for x in new:
        for lv in (["over", "warn"] if x["level"] == "over" else ["warn"]):
            if (x["category"], lv) in logged:
                continue
            db.add(PurchaseBudgetAlert(year=year, month=month, category=x["category"], level=lv, target=x["target"], actual=x["actual"],
                                       rate=x["rate"], recipients=", ".join(recipients) if lv == x["level"] else "(초과 발송 시 함께 기록)",
                                       error_message=error, created_at=now))
    return new
