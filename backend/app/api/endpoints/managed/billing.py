"""재무 (/api/managed/billing) — 납부리스트·납부내역·결제일알람·월별수익·매출매입계획. 관리자 전용(D12).

cms 와 다른 점(의도적):
- 납부내역 수정이 결제일(Payment.payment_date)을 빈 값으로 덮어쓰지 않는다(값을 보냈을 때만 반영).
- 삭제는 POST 이고, DB FK 가 RESTRICT 라 cms(Django CASCADE/SET_NULL)가 하던 정리를 직접 한다.
- cms 의 잔금 자동계산 분기(register)는 저장에 반영되지 않는 죽은 코드라 옮기지 않았다(결과 동일).
"""
import json
import re
from datetime import date, datetime, time, timedelta

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import bindparam, or_, text
from sqlalchemy.orm import Session

from app.api.endpoints.managed.common import page_response, require_write
from app.core.deps import require_staff_admin
from app.db.session import get_db
from app.models.company import Company
from app.models.customer import (
    CustomAuthUser,
    OutsourcingPayment,
    Payment,
    PaymentAlarm,
    PaymentAlarmHistory,
    PaymentHistory,
    PlanBudget,
    Project,
)
from app.services import billing as bl
from app.services import staff_auth
from app.services.email import send_email_sync

router = APIRouter(prefix="/billing", tags=["managed-billing"], dependencies=[Depends(require_staff_admin)])
WRITE = require_write("billing")

PROJECT_TYPES = {"1": "웹사이트", "2": "모바일앱", "3": "웹앱", "4": "웹사이트+모바일앱", "5": "도메인", "6": "보안서버", "7": "쇼핑몰",
                 "8": "운영", "9": "유지보수", "10": "서버관리", "11": "서버마이그레이션", "12": "호스팅", "13": "개발구독",
                 "14": "AI개발팀구축", "15": "유지보수구독", "16": "FDE"}
PAYMENT_METHODS = {"1": "카드", "2": "계좌이체", "3": "휴대폰"}
PAYMENT_STATUS = {"1": "결제완료", "2": "결제실패", "3": "결제대기"}
ALARM_TYPES = {"purchase": "매입", "sales": "매출", "outsourcing": "외주비"}
SUB_TYPES = {"1": "계약금", "2": "중도금", "6": "잔금"}
EXTRA_PRESETS = ["도메인구입비", "호스팅비", "보안서버(SSL)", "서버비", "기타"]
s = bl.s


def _iso(v):
    return v.isoformat() if v else None


def _excluded_alarm_ids(db: Session):
    return db.query(PaymentAlarm.seq).filter(PaymentAlarm.payment_type.in_(["purchase", "outsourcing"]))


def _names(db: Session, company_ids, project_ids):
    companies = dict(db.query(Company.seq, Company.name).filter(Company.seq.in_(set(company_ids) or {0})))
    projects = {p.seq: p for p in db.query(Project).filter(Project.seq.in_(set(project_ids) or {0}))}
    return companies, projects


# ── 선택 목록 ────────────────────────────────────────────────────────────

@router.get("/options")
def options(db: Session = Depends(get_db)):
    companies = [{"seq": c.seq, "name": c.name} for c in db.query(Company).order_by(Company.name)]
    agents = [{"id": u.id, "name": u.name or u.username, "email": u.email}
              for u in db.query(CustomAuthUser).filter(CustomAuthUser.group == "agent", CustomAuthUser.is_active == True)  # noqa: E712
              .order_by(CustomAuthUser.name)]
    return {"companies": companies, "agents": agents, "project_types": PROJECT_TYPES, "payment_types": bl.PAYMENT_TYPES,
            "payment_methods": PAYMENT_METHODS, "payment_status": PAYMENT_STATUS, "alarm_types": ALARM_TYPES,
            "sub_types": SUB_TYPES, "cycles": bl.CYCLE_LABELS, "extra_presets": EXTRA_PRESETS, "categories": bl.EXPENSE_CATEGORIES}


@router.get("/options/projects")
def option_projects(company_id: int, db: Session = Depends(get_db)):
    return [{"seq": p.seq, "title": p.title} for p in db.query(Project).filter(Project.company_id == company_id).order_by(Project.title)]


@router.get("/options/payments")
def option_payments(project_id: int, db: Session = Depends(get_db)):
    return [{"seq": p.seq, "payment_type": s(p.payment_type), "type_label": bl.PAYMENT_TYPES.get(s(p.payment_type), ""),
             "payment_amount": p.payment_amount} for p in db.query(Payment).filter(Payment.project_id == project_id)]


@router.get("/options/sales-alarms")
def option_sales_alarms(project_id: int, db: Session = Depends(get_db)):
    rows = db.query(PaymentAlarm).filter(PaymentAlarm.project_id == project_id, PaymentAlarm.payment_type == "sales",
                                         PaymentAlarm.valid_status == "valid").order_by(PaymentAlarm.created_at.desc())
    return [{"seq": a.seq, "title": a.title, "payment_sub_type": a.payment_sub_type or "", "sub_type_label": SUB_TYPES.get(a.payment_sub_type or "", ""),
             "amount": int(a.amount) if a.amount else 0, "cycle_display": bl.CYCLE_LABELS.get(a.cycle_type or "", "주기없음")} for a in rows]


@router.get("/options/remaining")
def option_remaining(payment_id: int, db: Session = Depends(get_db)):
    """cms get_payment_remaining — 월납은 미납이면 총액 1/12, 그 외는 청구액 − 확인 입금액."""
    p = db.query(Payment).filter(Payment.seq == payment_id).first()
    if not p:
        raise HTTPException(404, "납부 정보를 찾을 수 없습니다.")
    ctx = bl.PaymentContext(db, [p.seq])
    if s(p.payment_type) == "3":
        project = db.query(Project).filter(Project.seq == p.project_id).first() if p.project_id else None
        remaining = bl.monthly_summary(p, project, ctx)["remaining"]
        if remaining > 0:
            total = int(p.payment_amount if p.payment_amount is not None else (p.production_price or 0))
            remaining = int(round(total / 12))
    else:
        billed = p.payment_amount if p.payment_amount is not None else p.production_price
        remaining = max(0, int(billed or 0) - sum(bl._paid_amount(h) for h in ctx.confirmed(p.seq)))
    return {"remaining": remaining, "payment_type": s(p.payment_type)}


@router.get("/summary")
def summary(db: Session = Depends(get_db)):
    """직원 대시보드 재무 카드(관리자): 이번 달 매출·매입·외주(부가세 포함) + 미수금."""
    today = date.today()
    rec, exc = bl.receivables(db, today)
    return dict(_this_month_totals(db, today), receivable_vat=sum(i["amount_vat"] for i in rec), receivable_count=len(rec),
                receivable_excluded_vat=sum(i["amount_vat"] for i in exc))


# ── 납부리스트 (payment) ─────────────────────────────────────────────────

def _payment_row(p: Payment, companies, projects, ctx, alarms) -> dict:
    project = projects.get(p.project_id)
    text_, color = bl.payment_status(p, project, ctx)
    return {"seq": p.seq, "company_id": p.company_id, "company": companies.get(p.company_id, ""),
            "project_id": p.project_id, "project": project.title if project else "",
            "project_type": s(p.project_type), "project_type_label": PROJECT_TYPES.get(s(p.project_type), ""),
            "payment_type": s(p.payment_type), "payment_type_label": bl.PAYMENT_TYPES.get(s(p.payment_type), ""),
            "payment_method": s(p.payment_method), "payment_status": s(p.payment_status),
            "payment_date": _iso(p.payment_date), "payment_amount": p.payment_amount, "production_price": p.production_price,
            "invoice_tf": p.invoice_tf, "history_remarks": p.history_remarks, "payment_alarm_id": p.payment_alarm_id,
            "payment_alarm_title": alarms.get(p.payment_alarm_id, ""), "extra_items": bl.extra_items(p),
            "status_text": text_, "status_color": color, "created_at": _iso(p.created_at)}


@router.get("/payments")
def list_payments(q: str | None = None, page: int = Query(1, ge=1), per_page: int = Query(50, le=200), db: Session = Depends(get_db)):
    query = db.query(Payment).filter(or_(Payment.project_type.is_(None), Payment.project_type != "5")).filter(
        or_(Payment.payment_alarm_id.is_(None), ~Payment.payment_alarm_id.in_(_excluded_alarm_ids(db))))
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Payment.company_id.in_(db.query(Company.seq).filter(Company.name.like(like))),
                                 Payment.project_id.in_(db.query(Project.seq).filter(Project.title.like(like)))))
    total = query.count()
    rows = query.order_by(Payment.created_at.desc(), Payment.seq.desc()).offset((page - 1) * per_page).limit(per_page).all()
    companies, projects = _names(db, [p.company_id for p in rows if p.company_id], [p.project_id for p in rows if p.project_id])
    ctx = bl.PaymentContext(db, [p.seq for p in rows])
    alarms = dict(db.query(PaymentAlarm.seq, PaymentAlarm.title).filter(PaymentAlarm.seq.in_({p.payment_alarm_id for p in rows} - {None} or {0})))
    items = [_payment_row(p, companies, projects, ctx, alarms) for p in rows]
    out = page_response(items, total, page, per_page)
    if page == 1 and not q:
        rec, exc = bl.receivables(db, date.today())
        out["receivable"] = {"amount_vat": sum(i["amount_vat"] for i in rec), "count": len(rec),
                             "excluded_amount_vat": sum(i["amount_vat"] for i in exc), "excluded_count": len(exc)}
    return out


@router.get("/payments/{seq}")
def get_payment(seq: int, db: Session = Depends(get_db)):
    p = db.query(Payment).filter(Payment.seq == seq).first()
    if not p:
        raise HTTPException(404, "납부 정보를 찾을 수 없습니다.")
    companies, projects = _names(db, [p.company_id] if p.company_id else [], [p.project_id] if p.project_id else [])
    ctx = bl.PaymentContext(db, [p.seq])
    alarms = dict(db.query(PaymentAlarm.seq, PaymentAlarm.title).filter(PaymentAlarm.seq == (p.payment_alarm_id or 0)))
    row = _payment_row(p, companies, projects, ctx, alarms)
    extras = row["extra_items"]
    row["base_amount"] = (p.payment_amount or 0) - sum(i["amount"] for i in extras) if p.payment_amount is not None else None
    project = projects.get(p.project_id)
    if s(p.payment_type) == "3" and project and project.contract_date and project.contract_termination_date and p.payment_amount:
        delta = relativedelta(project.contract_termination_date + timedelta(days=1), project.contract_date)
        months = delta.years * 12 + delta.months
        row["monthly_info"] = {"contract_date": _iso(project.contract_date), "end_date": _iso(project.contract_termination_date),
                               "months": months, "monthly_amount": round(row["base_amount"] / months) if months > 0 else row["base_amount"],
                               "schedule": bl.monthly_summary(p, project, ctx)["months"]}
    row["histories"] = [_history_row(h, {}, {}, {p.seq: p}) for h in sorted(ctx.histories.get(p.seq, []), key=lambda h: h.created_at or datetime.min, reverse=True)]
    return row


class ExtraItem(BaseModel):
    name: str
    amount: int | str | None = 0
    month: str | None = None


class PaymentBody(BaseModel):
    company_id: int | None = None
    project_id: int | None = None
    project_type: str | None = None
    payment_type: str | None = None
    payment_method: str | None = None
    payment_status: str | None = None
    payment_date: date | None = None
    base_amount: int | str | None = None
    extra_items: list[ExtraItem] = []
    production_price: int | str | None = None
    invoice_tf: str | None = None
    history_remarks: str | None = None
    payment_alarm_id: int | None = None


def _to_int(v) -> int:
    v = str(v if v is not None else "").replace(",", "").strip()
    try:
        return int(float(v)) if v else 0
    except ValueError:
        return 0


def _apply_payment(p: Payment, body: PaymentBody) -> None:
    """cms _prepare_payment_post — 결제금액 = 기본금액 + 추가비용 합계, 둘 다 없으면 NULL."""
    items = []
    for it in body.extra_items:
        name = (it.name or "").strip()
        if not name:
            continue
        month = (it.month or "").strip()
        items.append({"name": name, "amount": _to_int(it.amount), "month": month if re.fullmatch(r"\d{4}-\d{2}", month) else ""})
    raw_base = str(body.base_amount if body.base_amount is not None else "").strip()
    p.payment_amount = None if raw_base == "" and not items else _to_int(raw_base) + sum(i["amount"] for i in items)
    p.extra_items = json.dumps(items, ensure_ascii=False)
    pp = str(body.production_price if body.production_price is not None else "").replace(",", "").strip()
    p.production_price = _to_int(pp) if pp else None
    for f in ("company_id", "project_id", "project_type", "payment_type", "payment_method", "payment_status", "invoice_tf",
              "history_remarks", "payment_alarm_id"):
        v = getattr(body, f)
        setattr(p, f, v if v not in ("",) else None)
    p.payment_date = datetime.combine(body.payment_date, time.min) if body.payment_date else None
    for f, allowed in (("project_type", PROJECT_TYPES), ("payment_type", bl.PAYMENT_TYPES), ("payment_method", PAYMENT_METHODS),
                       ("payment_status", PAYMENT_STATUS), ("invoice_tf", {"1": 1, "2": 2})):
        if getattr(p, f) is not None and str(getattr(p, f)) not in allowed:
            raise HTTPException(400, f"{f} 값이 올바르지 않습니다.")


@router.post("/payments", dependencies=[WRITE])
def create_payment(body: PaymentBody, request: Request, staff: CustomAuthUser = Depends(require_staff_admin), db: Session = Depends(get_db)):
    now = datetime.now()
    p = Payment(created_at=now, updated_at=now)
    _apply_payment(p, body)
    db.add(p)
    db.flush()
    staff_auth.audit(db, request, "billing.payment.create", user_id=staff.id, target=f"payment:{p.seq}")
    db.commit()
    return {"seq": p.seq}


@router.patch("/payments/{seq}", dependencies=[WRITE])
def update_payment(seq: int, body: PaymentBody, request: Request, staff: CustomAuthUser = Depends(require_staff_admin), db: Session = Depends(get_db)):
    p = db.query(Payment).filter(Payment.seq == seq).first()
    if not p:
        raise HTTPException(404, "납부 정보를 찾을 수 없습니다.")
    _apply_payment(p, body)
    p.updated_at = datetime.now()
    staff_auth.audit(db, request, "billing.payment.update", user_id=staff.id, target=f"payment:{seq}")
    db.commit()
    return {"ok": True}


def _delete_histories(db: Session, ids: list[int]) -> None:
    if not ids:
        return
    for t in ("managed_salestaxinvoice", "managed_purchasetaxinvoice"):
        db.execute(text(f"UPDATE {t} SET source_payment_history_id=NULL WHERE source_payment_history_id IN :ids").bindparams(
            bindparam("ids", expanding=True)), {"ids": ids})
    db.query(PaymentHistory).filter(PaymentHistory.seq.in_(ids)).delete(synchronize_session=False)


def _delete_payments(db: Session, ids: list[int]) -> None:
    if not ids:
        return
    _delete_histories(db, [h for (h,) in db.query(PaymentHistory.seq).filter(PaymentHistory.payment_id.in_(ids))])
    db.query(Payment).filter(Payment.seq.in_(ids)).delete(synchronize_session=False)


@router.post("/payments/{seq}/delete", dependencies=[WRITE])
def delete_payment(seq: int, request: Request, staff: CustomAuthUser = Depends(require_staff_admin), db: Session = Depends(get_db)):
    if not db.query(Payment.seq).filter(Payment.seq == seq).first():
        raise HTTPException(404, "납부 정보를 찾을 수 없습니다.")
    _delete_payments(db, [seq])
    staff_auth.audit(db, request, "billing.payment.delete", user_id=staff.id, target=f"payment:{seq}")
    db.commit()
    return {"ok": True}


# ── 납부내역 (payment_history) ───────────────────────────────────────────

def _history_row(h: PaymentHistory, companies, projects, payments) -> dict:
    p = payments.get(h.payment_id)
    return {"seq": h.seq, "company_id": h.company_id, "company": companies.get(h.company_id, ""), "project_id": h.project_id,
            "project": projects[h.project_id].title if h.project_id in projects else "", "payment_id": h.payment_id,
            "payment_type_label": bl.PAYMENT_TYPES.get(s(p.payment_type), "") if p else "",
            "alarm_title": getattr(p, "_alarm_title", "") if p else "",
            "payment_amount": h.payment_amount, "deposit_amount": h.deposit_amount, "deposit_date": _iso(h.deposit_date),
            "progress_amount": h.progress_amount, "progress_date": _iso(h.progress_date), "balance_amount": h.balance_amount,
            "balance_date": _iso(h.balance_date), "tax_invoice_date": _iso(h.tax_invoice_date),
            "progress_tax_invoice_date": _iso(h.progress_tax_invoice_date), "balance_tax_invoice_date": _iso(h.balance_tax_invoice_date),
            "target_month": h.target_month, "payment_tf": h.payment_tf, "created_at": _iso(h.created_at)}


@router.get("/payment-history")
def list_history(type: str = "sales", period: str | None = None, q: str | None = None, page: int = Query(1, ge=1),
                 per_page: int = Query(50, le=200), db: Session = Depends(get_db)):
    purchase_payments = db.query(Payment.seq).filter(Payment.payment_alarm_id.in_(_excluded_alarm_ids(db)))
    query = db.query(PaymentHistory)
    if type == "purchase":
        query = query.filter(PaymentHistory.payment_id.in_(purchase_payments))
    else:
        query = query.filter(or_(PaymentHistory.payment_id.is_(None), ~PaymentHistory.payment_id.in_(purchase_payments)))
    today = date.today()
    if period == "month":
        query = query.filter(PaymentHistory.created_at >= today.replace(day=1))
    elif period == "week":
        query = query.filter(PaymentHistory.created_at >= today - timedelta(days=7))
    if q:
        like = f"%{q}%"
        conds = [Payment.company_id.in_(db.query(Company.seq).filter(Company.name.like(like))),
                 Payment.project_id.in_(db.query(Project.seq).filter(Project.title.like(like)))]
        if type == "purchase":
            conds.append(Payment.payment_alarm_id.in_(db.query(PaymentAlarm.seq).filter(PaymentAlarm.title.like(like))))
        query = query.filter(PaymentHistory.payment_id.in_(db.query(Payment.seq).filter(or_(*conds))))
    total = query.count()
    rows = query.order_by(PaymentHistory.created_at.desc(), PaymentHistory.seq.desc()).offset((page - 1) * per_page).limit(per_page).all()
    payments = {p.seq: p for p in db.query(Payment).filter(Payment.seq.in_({h.payment_id for h in rows} - {None} or {0}))}
    alarm_titles = dict(db.query(PaymentAlarm.seq, PaymentAlarm.title).filter(PaymentAlarm.seq.in_({p.payment_alarm_id for p in payments.values()} - {None} or {0})))
    for p in payments.values():
        p._alarm_title = alarm_titles.get(p.payment_alarm_id, "")
    companies, projects = _names(db, [h.company_id for h in rows if h.company_id], [h.project_id for h in rows if h.project_id])
    items = [_history_row(h, companies, projects, payments) for h in rows]
    if type == "purchase" and rows:
        linked = {r[0] for r in db.execute(text("SELECT source_payment_history_id FROM managed_purchasetaxinvoice WHERE is_deleted=0 AND source_payment_history_id IN :ids")
                                           .bindparams(bindparam("ids", expanding=True)), {"ids": [h.seq for h in rows]})}
        for it in items:
            it["has_purchase_invoice"] = it["seq"] in linked
    return page_response(items, total, page, per_page)


@router.get("/payment-history/{seq}")
def get_history(seq: int, db: Session = Depends(get_db)):
    h = db.query(PaymentHistory).filter(PaymentHistory.seq == seq).first()
    if not h:
        raise HTTPException(404, "납부 기록을 찾을 수 없습니다.")
    payments = {p.seq: p for p in db.query(Payment).filter(Payment.seq == (h.payment_id or 0))}
    companies, projects = _names(db, [h.company_id] if h.company_id else [], [h.project_id] if h.project_id else [])
    row = _history_row(h, companies, projects, payments)
    p = payments.get(h.payment_id)
    row["payment_date"] = _iso(p.payment_date) if p else None
    return row


class HistoryBody(BaseModel):
    company_id: int | None = None
    project_id: int | None = None
    payment_id: int | None = None
    payment_alarm_seq: int | None = None
    payment_amount: int | str | None = None
    payment_date: date | None = None
    deposit_amount: int | str | None = None
    deposit_date: datetime | None = None
    progress_amount: int | str | None = None
    progress_date: datetime | None = None
    balance_amount: int | str | None = None
    balance_date: datetime | None = None
    tax_invoice_date: datetime | None = None
    progress_tax_invoice_date: datetime | None = None
    balance_tax_invoice_date: datetime | None = None
    payment_tf: str | None = None
    target_year: str | None = None
    target_months: list[str] = []


def _confirm_alarm(db: Session, p: Payment, history_seq: int) -> None:
    if p and p.payment_alarm_id:
        now = datetime.now()
        db.add(PaymentAlarmHistory(payment_alarm_id=p.payment_alarm_id, sent_at=now, status="confirmed", payment_date=date.today(),
                                   recipient_count=0, recipients=f"결제확인 등록 (PaymentHistory #{history_seq})", created_at=now))


def _set_history_fields(h: PaymentHistory, body: HistoryBody) -> None:
    h.company_id, h.project_id, h.payment_id = body.company_id, body.project_id, body.payment_id
    pa = str(body.payment_amount if body.payment_amount is not None else "").replace(",", "").strip()
    h.payment_amount = _to_int(pa) if pa else None
    for f in ("deposit", "progress", "balance"):
        setattr(h, f"{f}_amount", _to_int(getattr(body, f"{f}_amount")))
        setattr(h, f"{f}_date", getattr(body, f"{f}_date"))
    h.tax_invoice_date, h.progress_tax_invoice_date, h.balance_tax_invoice_date = (
        body.tax_invoice_date, body.progress_tax_invoice_date, body.balance_tax_invoice_date)
    if body.payment_tf not in (None, "", "1", "2"):
        raise HTTPException(400, "입금여부 값이 올바르지 않습니다.")
    h.payment_tf = body.payment_tf or None


@router.post("/payment-history", dependencies=[WRITE])
def create_history(body: HistoryBody, request: Request, staff: CustomAuthUser = Depends(require_staff_admin), db: Session = Depends(get_db)):
    """cms render_paymenthistory_register 와 같은 상태 규칙."""
    now = datetime.now()
    alarm_linked = False
    if body.payment_alarm_seq:
        alarm = db.query(PaymentAlarm).filter(PaymentAlarm.seq == body.payment_alarm_seq, PaymentAlarm.payment_type == "sales").first()
        project = db.query(Project).filter(Project.seq == alarm.project_id).first() if alarm and alarm.project_id else None
        if alarm and project:
            linked = db.query(Payment).filter(Payment.payment_alarm_id == alarm.seq).first()
            if not linked:
                linked = Payment(company_id=project.company_id, project_id=project.seq, payment_alarm_id=alarm.seq,
                                 payment_amount=int(alarm.amount) if alarm.amount else None, payment_type=alarm.payment_sub_type or "1",
                                 payment_status="3", payment_date=now, extra_items="[]", created_at=now, updated_at=now)
                db.add(linked)
                db.flush()
            body.payment_id = linked.seq
            alarm_linked = True
    p = db.query(Payment).filter(Payment.seq == body.payment_id).first() if body.payment_id else None
    if not p:
        raise HTTPException(400, "결제정보를 선택해주세요.")
    pt = s(p.payment_type)
    months = []
    if pt == "3" and re.fullmatch(r"\d{4}", body.target_year or ""):
        months = sorted({f"{body.target_year}-{m}" for m in body.target_months if re.fullmatch(r"0[1-9]|1[0-2]", m)})
    created = []
    for tm in months or [""]:
        h = PaymentHistory(created_at=now, updated_at=now)
        _set_history_fields(h, body)
        h.target_month = tm or None
        cur = h.deposit_amount + h.progress_amount + h.balance_amount
        if h.payment_tf == "1":
            if pt == "6":
                pass  # cms: 잔금 분기는 상태를 바꾸지 않는다
            elif pt != "3":
                p.payment_status = "1"
            else:
                done = sum((x.deposit_amount or 0) + (x.progress_amount or 0) + (x.balance_amount or 0)
                           for x in db.query(PaymentHistory).filter(PaymentHistory.payment_id == p.seq, PaymentHistory.payment_tf == "1"))
                p.payment_status = "1" if p.payment_amount and done + cur >= int(p.payment_amount) else "3"
        db.add(h)
        db.flush()
        if alarm_linked and h.payment_tf == "1":
            p.payment_status = "1" if p.payment_amount and cur >= int(p.payment_amount) else "3"
        if h.payment_tf == "1":
            _confirm_alarm(db, p, h.seq)
        created.append(h.seq)
    staff_auth.audit(db, request, "billing.history.create", user_id=staff.id, target=f"payment:{p.seq}", detail=json.dumps({"histories": created}, ensure_ascii=False))
    db.commit()
    return {"seqs": created}


@router.patch("/payment-history/{seq}", dependencies=[WRITE])
def update_history(seq: int, body: HistoryBody, request: Request, staff: CustomAuthUser = Depends(require_staff_admin), db: Session = Depends(get_db)):
    h = db.query(PaymentHistory).filter(PaymentHistory.seq == seq).first()
    if not h:
        raise HTTPException(404, "납부 기록을 찾을 수 없습니다.")
    was_tf = h.payment_tf
    p = db.query(Payment).filter(Payment.seq == h.payment_id).first() if h.payment_id else None
    body.payment_id = body.payment_id or h.payment_id
    target_month = h.target_month
    _set_history_fields(h, body)
    h.target_month = target_month
    h.updated_at = datetime.now()
    if p and h.payment_tf == "1":
        others = sum((x.deposit_amount or 0) + (x.progress_amount or 0) + (x.balance_amount or 0)
                     for x in db.query(PaymentHistory).filter(PaymentHistory.payment_id == p.seq, PaymentHistory.payment_tf == "1",
                                                              PaymentHistory.seq != seq))
        if p.payment_amount and others + h.deposit_amount + h.progress_amount + h.balance_amount >= int(p.payment_amount):
            p.payment_status = "1"
    if p and body.payment_date:
        p.payment_date = datetime.combine(body.payment_date, time.min)
    if h.payment_tf == "1" and was_tf != "1":
        _confirm_alarm(db, p, seq)
    staff_auth.audit(db, request, "billing.history.update", user_id=staff.id, target=f"payment_history:{seq}")
    db.commit()
    return {"ok": True}


@router.post("/payment-history/{seq}/delete", dependencies=[WRITE])
def delete_history(seq: int, request: Request, staff: CustomAuthUser = Depends(require_staff_admin), db: Session = Depends(get_db)):
    if not db.query(PaymentHistory.seq).filter(PaymentHistory.seq == seq).first():
        raise HTTPException(404, "납부 기록을 찾을 수 없습니다.")
    _delete_histories(db, [seq])
    staff_auth.audit(db, request, "billing.history.delete", user_id=staff.id, target=f"payment_history:{seq}")
    db.commit()
    return {"ok": True}


# ── 결제일 알람 ──────────────────────────────────────────────────────────

def _alarm_row(a: PaymentAlarm, paid: bool = False) -> dict:
    return {"seq": a.seq, "title": a.title, "description": a.description, "amount": int(a.amount) if a.amount is not None else None,
            "payment_type": a.payment_type, "payment_type_label": ALARM_TYPES.get(a.payment_type, a.payment_type),
            "payment_sub_type": a.payment_sub_type, "cycle_type": a.cycle_type, "cycle_label": bl.CYCLE_LABELS.get(a.cycle_type or "", ""),
            "cycle_months": a.cycle_months, "payment_day": a.payment_day, "payment_month": a.payment_month,
            "notify_days_before": a.notify_days_before, "alarm_time": a.alarm_time.strftime("%H:%M") if a.alarm_time else None,
            "start_date": _iso(a.start_date), "end_date": _iso(a.end_date), "next_payment_date": _iso(a.next_payment_date),
            "valid_status": a.valid_status, "send_to_all_agents": bool(a.send_to_all_agents), "last_sent_at": _iso(a.last_sent_at),
            "project_id": a.project_id, "outsourcing_id": a.outsourcing_id, "is_paid": paid, "created_at": _iso(a.created_at)}


def _this_month_totals(db: Session, today: date) -> dict:
    """cms payment_alarm_list 상단 카드(이번 달 매출·매입·외주비, 부가세 포함)."""
    ms = today.replace(day=1)
    me = ms + relativedelta(months=1) - timedelta(days=1)
    lo, hi = datetime.combine(ms, time.min), datetime.combine(me, time.max)
    out = {"sales_total": 0, "sales_count": 0, "purchase_total": 0, "purchase_count": 0, "outsourcing_total": 0, "outsourcing_count": 0}
    rows = bl.revenue_histories(db).filter(or_(PaymentHistory.deposit_date.between(lo, hi), PaymentHistory.progress_date.between(lo, hi),
                                               PaymentHistory.balance_date.between(lo, hi))).all()
    for h in rows:
        amt = sum(int(getattr(h, f"{f}_amount") or 0) for f in ("deposit", "progress", "balance")
                  if getattr(h, f"{f}_date") and lo <= getattr(h, f"{f}_date") <= hi)
        if amt > 0:
            out["sales_total"] += amt
            out["sales_count"] += 1
    for a in db.query(PaymentAlarm).filter(PaymentAlarm.payment_type == "outsourcing", PaymentAlarm.outsourcing_id.isnot(None)):
        paid = sum(int(x.amount) for x in db.query(OutsourcingPayment).filter(OutsourcingPayment.outsourcing_id == a.outsourcing_id,
                                                                               OutsourcingPayment.paid_date.between(ms, me)))
        if paid > 0:
            out["outsourcing_total"] += paid
            out["outsourcing_count"] += 1
    for a in db.query(PaymentAlarm).filter(PaymentAlarm.valid_status == "valid", PaymentAlarm.payment_type.in_(["purchase", "outsourcing"])):
        if a.payment_type == "outsourcing" and a.outsourcing_id:
            continue
        cycle = a.cycle_type or "once"
        if cycle == "once" and (a.start_date.year, a.start_date.month) != (today.year, today.month):
            continue
        if cycle == "yearly" and (a.payment_month or 1) != today.month:
            continue
        hit = bool(bl.expand_alarm_dates(a, ms, me, cycle=cycle))
        if not (hit and a.amount):
            continue
        key = "outsourcing" if a.payment_type == "outsourcing" else "purchase"
        out[f"{key}_total"] += int(a.amount)
        out[f"{key}_count"] += 1
    return out


@router.get("/alarms")
def list_alarms(q: str | None = None, status: str | None = None, cycle_type: str | None = None, payment_type: str | None = None,
                page: int = Query(1, ge=1), per_page: int = Query(20, le=200), db: Session = Depends(get_db)):
    query = db.query(PaymentAlarm)
    if q:
        query = query.filter(or_(PaymentAlarm.title.like(f"%{q}%"), PaymentAlarm.description.like(f"%{q}%")))
    if status:
        query = query.filter(PaymentAlarm.valid_status == status)
    if cycle_type:
        query = query.filter(PaymentAlarm.cycle_type == cycle_type)
    if payment_type:
        query = query.filter(PaymentAlarm.payment_type == payment_type)
    total = query.count()
    rows = query.order_by(PaymentAlarm.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    today = date.today()
    confirmed: dict[int, set] = {}
    for aid, d in db.query(PaymentAlarmHistory.payment_alarm_id, PaymentAlarmHistory.payment_date).filter(
            PaymentAlarmHistory.payment_alarm_id.in_([a.seq for a in rows if a.payment_type == "sales"] or [0]),
            PaymentAlarmHistory.status == "confirmed"):
        confirmed.setdefault(aid, set()).add(d)
    items = []
    for a in rows:
        ds = confirmed.get(a.seq, set())
        paid = bool(ds) if a.cycle_type == "once" else any((d.year, d.month) == (today.year, today.month) for d in ds)
        items.append(_alarm_row(a, paid))
    out = page_response(items, total, page, per_page)
    out["this_month"] = _this_month_totals(db, today)
    return out


@router.get("/alarms/calendar")
def alarm_calendar(start: date, end: date, db: Session = Depends(get_db)):
    confirmed = set(db.query(PaymentAlarmHistory.payment_alarm_id, PaymentAlarmHistory.payment_date).join(
        PaymentAlarm, PaymentAlarm.seq == PaymentAlarmHistory.payment_alarm_id).filter(
        PaymentAlarm.payment_type == "sales", PaymentAlarmHistory.status == "confirmed"))
    events = []
    for a in db.query(PaymentAlarm):
        for d in bl.expand_alarm_dates(a, start, end):
            paid = (a.seq, d) in confirmed
            events.append({"id": a.seq, "title": a.title, "date": d.isoformat(), "amount": int(a.amount) if a.amount else None,
                           "payment_type": a.payment_type, "valid_status": a.valid_status, "is_paid": paid})
    return events


@router.get("/alarms/history")
def alarm_history_all(page: int = Query(1, ge=1), per_page: int = Query(20, le=200), db: Session = Depends(get_db)):
    query = db.query(PaymentAlarmHistory)
    total = query.count()
    rows = query.order_by(PaymentAlarmHistory.sent_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    titles = dict(db.query(PaymentAlarm.seq, PaymentAlarm.title).filter(PaymentAlarm.seq.in_({h.payment_alarm_id for h in rows} or {0})))
    return page_response([_alarm_history_row(h, titles) for h in rows], total, page, per_page)


def _alarm_history_row(h: PaymentAlarmHistory, titles: dict) -> dict:
    return {"seq": h.seq, "payment_alarm_id": h.payment_alarm_id, "alarm_title": titles.get(h.payment_alarm_id, ""),
            "sent_at": _iso(h.sent_at), "status": h.status, "payment_date": _iso(h.payment_date),
            "recipient_count": h.recipient_count, "recipients": h.recipients, "error_message": h.error_message}


def _get_alarm(db: Session, seq: int) -> PaymentAlarm:
    a = db.query(PaymentAlarm).filter(PaymentAlarm.seq == seq).first()
    if not a:
        raise HTTPException(404, "결제일 알람을 찾을 수 없습니다.")
    return a


def _recipient_ids(db: Session, seq: int) -> list[int]:
    return [r[0] for r in db.execute(text("SELECT customauthuser_id FROM payment_alarm_recipients WHERE paymentalarm_id=:a"), {"a": seq})]


@router.get("/alarms/{seq}")
def get_alarm(seq: int, db: Session = Depends(get_db)):
    a = _get_alarm(db, seq)
    row = _alarm_row(a)
    row["recipient_ids"] = _recipient_ids(db, seq)
    hist = db.query(PaymentAlarmHistory).filter(PaymentAlarmHistory.payment_alarm_id == seq).order_by(PaymentAlarmHistory.sent_at.desc()).limit(20)
    row["histories"] = [_alarm_history_row(h, {}) for h in hist]
    project = db.query(Project).filter(Project.seq == a.project_id).first() if a.project_id else None
    row["project"] = {"seq": project.seq, "title": project.title, "company_id": project.company_id} if project else None
    return row


class AlarmBody(BaseModel):
    title: str
    description: str = ""
    payment_type: str = "purchase"
    payment_sub_type: str | None = None
    project_id: int | None = None
    amount: int | str | None = None
    cycle_type: str = ""
    cycle_months: int | None = None
    payment_day: int
    payment_month: int | None = None
    notify_days_before: int = 3
    alarm_time: str = "09:00"
    start_date: date
    end_date: date | None = None
    send_to_all_agents: bool = True
    recipients: list[int] = []


def _apply_alarm(a: PaymentAlarm, body: AlarmBody) -> None:
    if not body.title.strip():
        raise HTTPException(400, "필수 항목을 모두 입력해주세요.")
    if body.payment_type not in ALARM_TYPES:
        raise HTTPException(400, "결제구분이 올바르지 않습니다.")
    if body.payment_type != "sales" and body.cycle_type not in bl.CYCLE_LABELS:
        raise HTTPException(400, "결제주기를 선택해주세요.")
    if body.cycle_type and body.cycle_type not in bl.CYCLE_LABELS:
        raise HTTPException(400, "결제주기가 올바르지 않습니다.")
    if not 1 <= body.payment_day <= 31:
        raise HTTPException(400, "결제일은 1-31 사이의 숫자를 입력해주세요.")
    if body.cycle_type == "custom" and not (body.cycle_months and body.cycle_months > 0):
        raise HTTPException(400, "사용자지정 주기는 개월 수를 입력해주세요.")
    if body.payment_month is not None and not 1 <= body.payment_month <= 12:
        raise HTTPException(400, "결제월이 올바르지 않습니다.")
    if not body.send_to_all_agents and not body.recipients:
        raise HTTPException(400, "모든 에이전트 발송을 해제한 경우 최소 한 명의 수신자를 선택해주세요.")
    try:
        at = time.fromisoformat(body.alarm_time) if body.alarm_time else time(9, 0)
    except ValueError:
        raise HTTPException(400, "알람 시간이 올바르지 않습니다.")
    a.title, a.description, a.payment_type = body.title.strip(), body.description.strip(), body.payment_type
    a.payment_sub_type = (body.payment_sub_type or None) if body.payment_type == "sales" else None
    if a.payment_sub_type and a.payment_sub_type not in SUB_TYPES:
        raise HTTPException(400, "결제유형이 올바르지 않습니다.")
    a.project_id = body.project_id if body.payment_type == "sales" else None
    raw = str(body.amount if body.amount is not None else "").replace(",", "").strip()
    a.amount = _to_int(raw) if raw else None
    a.cycle_type, a.cycle_months, a.payment_day, a.payment_month = body.cycle_type, body.cycle_months, body.payment_day, body.payment_month
    a.notify_days_before, a.alarm_time, a.start_date, a.end_date = body.notify_days_before, at, body.start_date, body.end_date
    a.send_to_all_agents = body.send_to_all_agents


def _set_recipients(db: Session, seq: int, body: AlarmBody) -> None:
    db.execute(text("DELETE FROM payment_alarm_recipients WHERE paymentalarm_id=:a"), {"a": seq})
    if not body.send_to_all_agents:
        valid = {u for (u,) in db.query(CustomAuthUser.id).filter(CustomAuthUser.id.in_(body.recipients))}
        for uid in valid:
            db.execute(text("INSERT INTO payment_alarm_recipients (paymentalarm_id, customauthuser_id) VALUES (:a, :u)"), {"a": seq, "u": uid})


@router.post("/alarms", dependencies=[WRITE])
def create_alarm(body: AlarmBody, request: Request, staff: CustomAuthUser = Depends(require_staff_admin), db: Session = Depends(get_db)):
    now = datetime.now()
    a = PaymentAlarm(valid_status="valid", created_at=now, updated_at=now)
    _apply_alarm(a, body)
    a.next_payment_date = bl.next_payment_date(a)
    db.add(a)
    db.flush()
    _set_recipients(db, a.seq, body)
    staff_auth.audit(db, request, "billing.alarm.create", user_id=staff.id, target=f"payment_alarm:{a.seq}")
    db.commit()
    return {"seq": a.seq}


@router.patch("/alarms/{seq}", dependencies=[WRITE])
def update_alarm(seq: int, body: AlarmBody, request: Request, staff: CustomAuthUser = Depends(require_staff_admin), db: Session = Depends(get_db)):
    a = _get_alarm(db, seq)
    old = (a.cycle_type, a.cycle_months, a.payment_month, a.start_date)
    old_next, old_end = a.next_payment_date, a.end_date
    _apply_alarm(a, body)
    if (a.cycle_type, a.cycle_months, a.payment_month, a.start_date) == old and old_next is not None:
        # 주기가 그대로면 등록된 다음 결제일의 연·월은 두고 일자만 바꾼다(cms 와 같음)
        a.next_payment_date = date(old_next.year, old_next.month, bl._clamp(old_next.year, old_next.month, a.payment_day))
    else:
        a.next_payment_date = bl.next_payment_date(a)
    # cms 는 종료일이 미래이기만 하면 무효를 풀어 수동 무효화가 사라졌다(SPEC 05 B7) — 종료일을 바꿨을 때만 복원
    if a.end_date and a.end_date != old_end and a.end_date >= date.today() and a.valid_status == "invalid":
        a.valid_status = "valid"
    a.updated_at = datetime.now()
    _set_recipients(db, seq, body)
    staff_auth.audit(db, request, "billing.alarm.update", user_id=staff.id, target=f"payment_alarm:{seq}")
    db.commit()
    return {"ok": True}


@router.post("/alarms/{seq}/toggle", dependencies=[WRITE])
def toggle_alarm(seq: int, request: Request, staff: CustomAuthUser = Depends(require_staff_admin), db: Session = Depends(get_db)):
    a = _get_alarm(db, seq)
    a.valid_status = "invalid" if a.valid_status == "valid" else "valid"
    a.updated_at = datetime.now()
    staff_auth.audit(db, request, "billing.alarm.toggle", user_id=staff.id, target=f"payment_alarm:{seq}", detail=json.dumps({"valid_status": a.valid_status}, ensure_ascii=False))
    db.commit()
    return {"valid_status": a.valid_status}


@router.post("/alarms/{seq}/delete", dependencies=[WRITE])
def delete_alarm(seq: int, request: Request, staff: CustomAuthUser = Depends(require_staff_admin), db: Session = Depends(get_db)):
    """결제대기('3') 연동 납부는 지우고, 나머지 참조는 cms(Django) 규칙대로 CASCADE/SET NULL 처리."""
    _get_alarm(db, seq)
    _delete_payments(db, [p for (p,) in db.query(Payment.seq).filter(Payment.payment_alarm_id == seq, Payment.payment_status == "3")])
    db.execute(text("DELETE FROM payment_alarm_history WHERE payment_alarm_id=:a"), {"a": seq})
    db.execute(text("DELETE FROM payment_alarm_recipients WHERE paymentalarm_id=:a"), {"a": seq})
    db.execute(text("UPDATE payment SET payment_alarm_id=NULL WHERE payment_alarm_id=:a"), {"a": seq})
    db.execute(text("DELETE FROM tithe_purchase_check WHERE payment_alarm_id=:a"), {"a": seq})
    db.execute(text("UPDATE managed_purchasetaxinvoice SET source_payment_alarm_id=NULL WHERE source_payment_alarm_id=:a"), {"a": seq})
    db.query(PaymentAlarm).filter(PaymentAlarm.seq == seq).delete(synchronize_session=False)
    staff_auth.audit(db, request, "billing.alarm.delete", user_id=staff.id, target=f"payment_alarm:{seq}")
    db.commit()
    return {"ok": True}


@router.post("/alarms/sync-sales", dependencies=[WRITE])
def sync_sales(request: Request, staff: CustomAuthUser = Depends(require_staff_admin), db: Session = Depends(get_db)):
    synced_alarms = synced = errors = 0
    for a in db.query(PaymentAlarm).filter(PaymentAlarm.payment_type == "sales").all():
        try:
            n = bl.sync_sales_alarm(db, a)
            db.commit()
            if n:
                synced_alarms += 1
                synced += n
        except Exception:  # noqa: BLE001 — cms 처럼 알람 단위로 계속 진행
            db.rollback()
            errors += 1
    staff_auth.audit(db, request, "billing.alarm.sync_sales", user_id=staff.id, detail=json.dumps({"alarms": synced_alarms, "count": synced, "errors": errors}, ensure_ascii=False))
    db.commit()
    return {"alarms": synced_alarms, "count": synced, "errors": errors}


@router.post("/alarms/{seq}/test-send", dependencies=[WRITE])
def test_send(seq: int, request: Request, staff: CustomAuthUser = Depends(require_staff_admin), db: Session = Depends(get_db)):
    a = _get_alarm(db, seq)
    if a.send_to_all_agents:
        emails = [u.email for u in db.query(CustomAuthUser).filter(CustomAuthUser.group == "agent", CustomAuthUser.is_active == True) if u.email]  # noqa: E712
    else:
        ids = _recipient_ids(db, seq)
        emails = [u.email for u in db.query(CustomAuthUser).filter(CustomAuthUser.id.in_(ids or [0])) if u.email]
    if not emails:
        raise HTTPException(400, "발송할 에이전트가 없습니다.")
    now = datetime.now()
    pdate = a.next_payment_date or date.today()
    h = PaymentAlarmHistory(payment_alarm_id=seq, sent_at=now, status="pending", payment_date=pdate, recipient_count=len(emails),
                            recipients=", ".join(emails), created_at=now)
    db.add(h)
    db.flush()
    amount = f"{int(a.amount):,}원" if a.amount else "미지정"
    cycle = {"monthly": "매월", "yearly": "매년", "custom": f"매{a.cycle_months}개월"}.get(a.cycle_type, a.cycle_type)
    from html import escape
    body = (f"<p>PACMS 결제일 알람 테스트 발송입니다.</p><table>"
            f"<tr><td>결제명</td><td>{escape(a.title)}</td></tr><tr><td>결제일</td><td>{pdate:%Y년 %m월 %d일}</td></tr>"
            f"<tr><td>결제금액</td><td>{amount}</td></tr><tr><td>결제주기</td><td>{escape(cycle or '')}</td></tr>"
            f"<tr><td>알람 선행일</td><td>{a.notify_days_before}일 전</td></tr></table>"
            + (f"<p>설명:<br>{escape(a.description)}</p>" if a.description else ""))
    try:
        send_email_sync(emails, f"[PACMS 테스트 결제일알람] {a.title}", body)
        h.status = "sent"
    except Exception as e:  # noqa: BLE001
        h.status = "failed"
        h.error_message = str(e)
    staff_auth.audit(db, request, "billing.alarm.test_send", user_id=staff.id, target=f"payment_alarm:{seq}", detail=json.dumps({"status": h.status}, ensure_ascii=False))
    db.commit()
    if h.status == "failed":
        raise HTTPException(502, f"이메일 발송 오류: {h.error_message}")
    return {"sent": len(emails)}


# ── 월별수익·매출매입계획 ────────────────────────────────────────────────

@router.get("/revenue")
def revenue(year: int | None = None, month: int = 0, db: Session = Depends(get_db)):
    today = date.today()
    year = year or today.year
    monthly = bl.monthly_revenue(db, year)
    for r in monthly:
        r["is_current"] = (year, r["month"]) == (today.year, today.month)
        r["is_future"] = year == today.year and r["month"] > today.month
    lo, hi = datetime(year, 1, 1), datetime(year, 12, 31, 23, 59, 59)
    if 1 <= month <= 12:
        lo, hi = bl._month_bounds(year, month)
    rows = bl.revenue_histories(db).filter(or_(PaymentHistory.deposit_date.between(lo, hi), PaymentHistory.progress_date.between(lo, hi),
                                               PaymentHistory.balance_date.between(lo, hi))).order_by(PaymentHistory.created_at.desc())
    rows = rows.all() if 1 <= month <= 12 else rows.limit(20).all()
    companies, projects = _names(db, [h.company_id for h in rows if h.company_id], [h.project_id for h in rows if h.project_id])
    items = []
    for h in rows:
        r = _history_row(h, companies, projects, {})
        if 1 <= month <= 12:
            for f in ("deposit", "progress", "balance"):
                d = getattr(h, f"{f}_date")
                if not (d and lo <= d <= hi):
                    r[f"{f}_amount"], r[f"{f}_date"] = None, None
        items.append(r)
    return {"year": year, "month": month, "monthly": monthly, "total": {k: sum(r[k] for r in monthly) for k in ("deposit", "progress", "balance", "total")},
            "items": items, "year_options": list(range(today.year - 3, today.year + 2))}


@router.get("/sales-plan")
def sales_plan(year: int | None = None, db: Session = Depends(get_db)):
    plan = bl.build_sales_plan(db, year or date.today().year)
    budgets = [{"month": b.month, "kind": b.kind, "category": b.category, "amount": b.amount, "memo": b.memo}
               for b in db.query(PlanBudget).filter(PlanBudget.year == plan["year"])]
    return dict(plan, budgets=budgets)


class BudgetBody(BaseModel):
    year: int
    month: int
    kind: str
    category: str = ""
    amount: int | str | None = 0


@router.post("/sales-plan/budget", dependencies=[WRITE])
def save_budget(body: BudgetBody, staff: CustomAuthUser = Depends(require_staff_admin), db: Session = Depends(get_db)):
    """금액 공백/0 이면 삭제 (cms sales_plan_budget_save)."""
    amount = _to_int(str(body.amount or "").replace("원", ""))
    category = (body.category or "").strip()
    if body.kind not in ("sales", "purchase"):
        raise HTTPException(400, "구분(kind)이 올바르지 않습니다.")
    if not (2000 <= body.year <= 2100 and 1 <= body.month <= 12):
        raise HTTPException(400, "연도/월 범위가 올바르지 않습니다.")
    if body.kind == "sales":
        category = ""
    elif category and category not in bl.EXPENSE_CATEGORIES:
        raise HTTPException(400, "비용분류가 올바르지 않습니다.")
    if amount < 0:
        raise HTTPException(400, "금액은 0 이상이어야 합니다.")
    q = db.query(PlanBudget).filter(PlanBudget.year == body.year, PlanBudget.month == body.month, PlanBudget.kind == body.kind,
                                    PlanBudget.category == category)
    now = datetime.now()
    if amount == 0:
        q.delete(synchronize_session=False)
        action = "deleted"
    else:
        b = q.first()
        if b:
            b.amount, b.updated_by_id, b.updated_at = amount, staff.id, now
        else:
            db.add(PlanBudget(year=body.year, month=body.month, kind=body.kind, category=category, amount=amount, memo="",
                              updated_by_id=staff.id, created_at=now, updated_at=now))
        action = "saved"
    db.commit()
    return {"ok": True, "action": action, "amount": amount}


class PrefillBody(BaseModel):
    year: int
    kind: str = "purchase"
    month_from: int | None = None
    month_to: int | None = None
    overwrite: bool = False


@router.post("/sales-plan/prefill", dependencies=[WRITE])
def prefill_budget(body: PrefillBody, staff: CustomAuthUser = Depends(require_staff_admin), db: Session = Depends(get_db)):
    """최근 3개월(완료월) 평균으로 목표 채우기. 범위가 없으면 미래월 전체, overwrite 가 아니면 기존 목표 유지."""
    today = date.today()
    if body.month_from or body.month_to:
        months = list(range(max(1, body.month_from or 1), min(12, body.month_to or 12) + 1))
    else:
        months = [m for m in range(1, 13) if (body.year, m) > (today.year, today.month)]
    if not months:
        raise HTTPException(400, "채울 대상 월이 없습니다. (지난 연도는 월 범위를 지정하세요)")
    now = datetime.now()
    if body.kind == "sales":
        avg, start, end, monthly = bl.recent_sales_average(db, today)
        if avg <= 0:
            raise HTTPException(400, "최근 3개월 매출 실적이 없습니다.")
        targets = {"": avg}
        memo = f"최근 3개월 매출 실적 평균 ({start:%Y-%m}~{end:%Y-%m})"
    else:
        targets, start, end = bl.recent_purchase_category_average(db, today)
        if not targets:
            raise HTTPException(400, "최근 3개월 매입 세금계산서가 없습니다.")
        memo = f"최근 3개월 평균 ({start:%Y-%m}~{end:%Y-%m})"
    kind = "sales" if body.kind == "sales" else "purchase"
    created = updated = skipped = 0
    for m in months:
        for catk, avg in targets.items():
            b = db.query(PlanBudget).filter(PlanBudget.year == body.year, PlanBudget.month == m, PlanBudget.kind == kind,
                                            PlanBudget.category == catk).first()
            if b:
                if not body.overwrite:
                    skipped += 1
                    continue
                b.amount, b.updated_by_id, b.updated_at = avg, staff.id, now
                updated += 1
            else:
                db.add(PlanBudget(year=body.year, month=m, kind=kind, category=catk, amount=avg, memo=memo, updated_by_id=staff.id,
                                  created_at=now, updated_at=now))
                created += 1
    db.commit()
    return {"ok": True, "months": months, "averages": targets, "period": f"{start:%Y-%m-%d} ~ {end:%Y-%m-%d}",
            "created": created, "updated": updated, "skipped": skipped}
