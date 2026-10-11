"""세금계산서 (/api/managed/tax) — 대시보드·매입·매출·첨부·일괄등록/제출·ZIP (SPEC 06 §5). 관리자 전용(재무, D12).

장부 관리(홈택스 연동 없음). 함께 움직여야 하는 셋(SPEC §5 이관): ① 매출 발행 시 PaymentHistory 계산서 발행일 쓰기
② 매입 저장 후 예산 경고 메일 ③ 02:00 납부내역→매출 계산서 동기화. ①②는 여기 있고 ③과 매일 09:00 예산 점검은 cms cron 이
계속 돈다 → 'tax' 쓰기 영역은 P6(배치 이관)과 같이 켠다. 거래처(TaxClient)·수동 동기화 버튼은 옮기지 않는다.
"""
import os
import re
import tempfile
import zipfile
from datetime import date, datetime
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.endpoints.managed.common import apply_sort, page_response, require_write, write_enabled
from app.core.deps import require_staff_admin
from app.db.session import get_db
from app.models.company import Company
from app.models.customer import (
    CustomAuthUser,
    OutsourcingVendor,
    Payment,
    PaymentAlarm,
    PaymentHistory,
    Project,
    PurchaseSupplier,
    PurchaseTaxInvoice,
    SalesTaxInvoice,
    TaxAttachment,
)
from app.services import billing as bl
from app.services import staff_auth
from app.utils.media import MEDIA_ROOT, delete_media, file_download_response, resolve_media_path, save_upload

router = APIRouter(prefix="/tax", tags=["managed-tax"], dependencies=[Depends(require_staff_admin)])
WRITE = require_write("tax")
DEDUCTION = {"deductible": "공제 가능", "non_deductible": "불공제", "review": "검토필요"}
PAYMENT_METHODS = {"transfer": "계좌이체", "card": "카드", "biz_card": "사업자카드", "cash": "현금", "other": "기타"}
ISSUE_STATUS = {"issued": "발행완료", "pending": "미발행", "cancelled": "취소", "revised": "수정발행"}
PAY_STATUS = {"unpaid": "미입금", "partial": "부분입금", "paid": "입금완료"}
PURCHASE_TYPES = ("purchase", "outsourcing")


def _iso(v):
    return v.isoformat() if v else None


def _amount(v) -> int:
    try:
        return int(str(v or "0").replace(",", "").strip() or "0")
    except ValueError:
        return 0


def _attachments(db: Session, field, ids) -> dict:
    out = {}
    for a in db.query(TaxAttachment).filter(field.in_(ids or [0])).order_by(TaxAttachment.id):
        out.setdefault(getattr(a, field.key), []).append({"id": a.id, "name": a.original_name, "size": a.file_size})
    return out


def _purchase_row(i: PurchaseTaxInvoice, atts: dict | None = None) -> dict:
    return {"id": i.id, "issue_date": _iso(i.issue_date), "supplier_name": i.supplier_name, "supplier_no": i.supplier_no, "client_id": i.client_id,
            "item": i.item, "supply_amount": i.supply_amount, "tax_amount": i.tax_amount, "total_amount": i.supply_amount + i.tax_amount,
            "expense_category": i.expense_category, "deduction_status": i.deduction_status, "deduction_label": DEDUCTION.get(i.deduction_status, ""),
            "payment_method": i.payment_method, "payment_method_label": PAYMENT_METHODS.get(i.payment_method, ""), "memo": i.memo,
            "is_submitted": bool(i.is_submitted), "source_payment_history_id": i.source_payment_history_id,
            "source_payment_alarm_id": i.source_payment_alarm_id, "source_outsourcing_id": i.source_outsourcing_id,
            "attachments": (atts or {}).get(i.id, [])}


def _sales_row(i: SalesTaxInvoice, atts: dict | None = None) -> dict:
    return {"id": i.id, "issue_date": _iso(i.issue_date), "buyer_name": i.buyer_name, "buyer_no": i.buyer_no, "client_id": i.client_id, "item": i.item,
            "supply_amount": i.supply_amount, "tax_amount": i.tax_amount, "total_amount": i.supply_amount + i.tax_amount,
            "issue_status": i.issue_status, "issue_label": ISSUE_STATUS.get(i.issue_status, ""), "payment_status": i.payment_status,
            "payment_label": PAY_STATUS.get(i.payment_status, ""), "payment_date": _iso(i.payment_date), "memo": i.memo,
            "is_submitted": bool(i.is_submitted), "source_payment_history_id": i.source_payment_history_id, "attachments": (atts or {}).get(i.id, [])}


@router.get("/options")
def options(db: Session = Depends(get_db)):
    return {"categories": bl.EXPENSE_CATEGORIES, "deduction": DEDUCTION, "payment_methods": PAYMENT_METHODS, "issue_status": ISSUE_STATUS,
            "payment_status": PAY_STATUS,
            "suppliers": [{"name": s.name, "business_number": s.business_number}
                          for s in db.query(PurchaseSupplier).order_by(PurchaseSupplier.use_count.desc(), PurchaseSupplier.updated_at.desc()).limit(50)],
            "vendors": [{"name": v.name, "business_number": getattr(v, "business_number", "") or ""} for v in db.query(OutsourcingVendor).order_by(OutsourcingVendor.name)],
            "clients": [{"seq": c.seq, "name": c.name, "business_number": getattr(c, "business_number", "") or ""} for c in db.query(Company).order_by(Company.name)]}


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    import calendar as cal
    today = date.today()
    ms, me = today.replace(day=1), today.replace(day=cal.monthrange(today.year, today.month)[1])

    def sums(M):
        r = db.query(func.coalesce(func.sum(M.supply_amount), 0), func.coalesce(func.sum(M.tax_amount), 0)).filter(
            M.is_deleted == False, M.issue_date >= ms, M.issue_date <= me).first()  # noqa: E712
        return int(r[0]), int(r[1])

    ps, pt = sums(PurchaseTaxInvoice)
    ss, st = sums(SalesTaxInvoice)
    live_p = db.query(PurchaseTaxInvoice).filter(PurchaseTaxInvoice.is_deleted == False)  # noqa: E712
    live_s = db.query(SalesTaxInvoice).filter(SalesTaxInvoice.is_deleted == False)  # noqa: E712
    return {"year": today.year, "month": today.month, "purchase_supply": ps, "purchase_tax": pt, "sales_supply": ss, "sales_tax": st,
            "vat_estimate": st - pt, "review_count": live_p.filter(PurchaseTaxInvoice.deduction_status == "review").count(),
            "unpaid_count": live_s.filter(SalesTaxInvoice.payment_status == "unpaid").count(),
            "pending_issue": live_s.filter(SalesTaxInvoice.issue_status == "pending").count(),
            "recent_purchases": [_purchase_row(i) for i in live_p.order_by(PurchaseTaxInvoice.issue_date.desc(), PurchaseTaxInvoice.created_at.desc()).limit(5)],
            "recent_sales": [_sales_row(i) for i in live_s.order_by(SalesTaxInvoice.issue_date.desc(), SalesTaxInvoice.created_at.desc()).limit(5)],
            "budget": bl.purchase_budget_status(db, today.year, today.month), "write_enabled": write_enabled("tax")}


# ── 매입 ─────────────────────────────────────────────────────────────────

def _purchase_query(db: Session, q, date_from, date_to, category, deduction):
    query = db.query(PurchaseTaxInvoice).filter(PurchaseTaxInvoice.is_deleted == False)  # noqa: E712
    if q:
        like = f"%{q}%"
        query = query.filter(or_(PurchaseTaxInvoice.supplier_name.like(like), PurchaseTaxInvoice.item.like(like), PurchaseTaxInvoice.supplier_no.like(like)))
    if date_from:
        query = query.filter(PurchaseTaxInvoice.issue_date >= date_from)
    if date_to:
        query = query.filter(PurchaseTaxInvoice.issue_date <= date_to)
    if category:
        query = query.filter(PurchaseTaxInvoice.expense_category == category)
    if deduction:
        query = query.filter(PurchaseTaxInvoice.deduction_status == deduction)
    return query


@router.get("/purchases")
def list_purchases(q: str | None = None, date_from: date | None = None, date_to: date | None = None, category: str | None = None,
                   deduction: str | None = None, page: int = Query(1, ge=1), per_page: int = Query(20, le=200),
                   sort: str | None = Query(None, description="issue_date|supplier_name|amount|deduction_status|is_submitted, '-' 접두 = 내림차순"),
                   db: Session = Depends(get_db)):
    query = _purchase_query(db, q, date_from, date_to, category, deduction)
    total = query.count()
    sums = query.with_entities(func.coalesce(func.sum(PurchaseTaxInvoice.supply_amount), 0), func.coalesce(func.sum(PurchaseTaxInvoice.tax_amount), 0)).first()
    P = PurchaseTaxInvoice
    query = apply_sort(query, sort, {"issue_date": P.issue_date, "supplier_name": P.supplier_name, "amount": P.supply_amount + P.tax_amount,
                                     "deduction_status": P.deduction_status, "is_submitted": P.is_submitted},
                       [P.issue_date.desc(), P.created_at.desc()])
    rows = query.offset((page - 1) * per_page).limit(per_page).all()
    atts = _attachments(db, TaxAttachment.purchase_invoice_id, [r.id for r in rows])
    out = page_response([_purchase_row(r, atts) for r in rows], total, page, per_page)
    out.update(totals={"supply": int(sums[0]), "tax": int(sums[1]), "total": int(sums[0]) + int(sums[1])}, write_enabled=write_enabled("tax"))
    return out


@router.get("/purchases/attachments.zip")
def purchases_zip(q: str | None = None, date_from: date | None = None, date_to: date | None = None, category: str | None = None,
                  deduction: str | None = None, db: Session = Depends(get_db)):
    """검색된 매입 계산서 첨부를 ZIP 으로(cms tax_purchase_attachments_zip). 직원 인증 다운로드."""
    invs = {i.id: i for i in _purchase_query(db, q, date_from, date_to, category, deduction)}
    atts = db.query(TaxAttachment).filter(TaxAttachment.purchase_invoice_id.in_(list(invs) or [0])).order_by(TaxAttachment.id).all()
    tmp = tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024)
    used, added = set(), 0

    def safe(name, n=60):
        name = re.sub(r'[\\/:*?"<>|\r\n\t]', "_", (name or "").strip())
        root, ext = os.path.splitext(name)
        return name if len(name) <= n else root[:max(1, n - len(ext))] + ext

    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_STORED) as zf:
        for a in atts:
            path = resolve_media_path(a.file)
            inv = invs[a.purchase_invoice_id]
            if not path:
                continue
            base = f"{inv.issue_date:%Y%m%d}_{safe(inv.supplier_name, 30)}_{inv.id}_{safe(a.original_name or 'file')}"
            entry, n = base, 1
            while entry in used:
                n += 1
                root, ext = os.path.splitext(base)
                entry = f"{root}_{n}{ext}"
            zf.write(path, entry)
            used.add(entry)
            added += 1
    if not added:
        tmp.close()
        raise HTTPException(404, "다운로드할 첨부가 없습니다.")
    tmp.seek(0)
    name = "매입세금계산서_이미지" + (f"_{date_from or ''}~{date_to or ''}" if date_from or date_to else "") + f"_{added}건.zip"
    return StreamingResponse(tmp, media_type="application/zip", headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(name)}"})


@router.get("/purchases/{iid}")
def get_purchase(iid: int, db: Session = Depends(get_db)):
    i = db.query(PurchaseTaxInvoice).filter(PurchaseTaxInvoice.id == iid, PurchaseTaxInvoice.is_deleted == False).first()  # noqa: E712
    if not i:
        raise HTTPException(404, "매입 세금계산서를 찾을 수 없습니다.")
    out = _purchase_row(i, _attachments(db, TaxAttachment.purchase_invoice_id, [iid]))
    out["write_enabled"] = write_enabled("tax")
    return out


def _record_supplier(db: Session, name: str, no: str) -> None:
    name, no = (name or "").strip(), (no or "").strip()
    if not name:
        return
    now = datetime.now()
    s = db.query(PurchaseSupplier).filter(PurchaseSupplier.name == name, PurchaseSupplier.business_number == no).first()
    if s:
        s.use_count, s.updated_at = (s.use_count or 0) + 1, now
    else:
        db.add(PurchaseSupplier(name=name, business_number=no, use_count=1, created_at=now, updated_at=now))


def _save_attachments(db: Session, files: list[UploadFile], purchase_id=None, sales_id=None) -> None:
    now = datetime.now()
    for f in files:
        if f and f.filename:
            path, name = save_upload(f, "tax_attachments")
            try:
                size = os.path.getsize(os.path.join(MEDIA_ROOT, path))
            except OSError:
                size = 0
            db.add(TaxAttachment(file=path, original_name=name, file_size=size, created_at=now, purchase_invoice_id=purchase_id, sales_invoice_id=sales_id))


def _apply_purchase(db: Session, i: PurchaseTaxInvoice, f: dict) -> None:
    try:
        i.issue_date = date.fromisoformat(f["issue_date"])
    except (TypeError, ValueError):
        raise HTTPException(400, "작성일자를 입력하세요.")
    if not (f["supplier_name"] or "").strip() or not (f["item"] or "").strip():
        raise HTTPException(400, "공급자 상호와 품목을 입력하세요.")
    if f["expense_category"] not in bl.EXPENSE_CATEGORIES:
        raise HTTPException(400, "비용분류를 선택하세요.")
    if f["deduction_status"] not in DEDUCTION or (f["payment_method"] and f["payment_method"] not in PAYMENT_METHODS):
        raise HTTPException(400, "공제여부/결제수단이 올바르지 않습니다.")
    i.supplier_name, i.supplier_no, i.item = f["supplier_name"].strip()[:100], (f["supplier_no"] or "").strip()[:20], f["item"].strip()[:200]
    i.supply_amount, i.tax_amount = _amount(f["supply_amount"]), _amount(f["tax_amount"])
    i.expense_category, i.deduction_status, i.payment_method, i.memo = f["expense_category"], f["deduction_status"], f["payment_method"] or "", f["memo"] or ""
    cid = f["client_id"]
    i.client_id = int(cid) if cid and str(cid).isdigit() and db.query(Company.seq).filter(Company.seq == int(cid)).first() else None


def _budget(db: Session, months: dict) -> list[str]:
    warnings = []
    for (y, m), cats in sorted(months.items()):
        bl.notify_purchase_budget(db, y, m)
        warnings += bl.budget_warning_messages(db, y, m, cats)
    return warnings


@router.post("/purchases", dependencies=[WRITE])
def create_purchase(request: Request, issue_date: str = Form(...), supplier_name: str = Form(...), supplier_no: str = Form(""), client_id: str | None = Form(None),
                    item: str = Form(...), supply_amount: str = Form("0"), tax_amount: str = Form("0"), expense_category: str = Form(...),
                    deduction_status: str = Form("review"), payment_method: str = Form(""), memo: str = Form(""), attachments: list[UploadFile] = File([]),
                    staff: CustomAuthUser = Depends(require_staff_admin), db: Session = Depends(get_db)):
    now = datetime.now()
    i = PurchaseTaxInvoice(is_submitted=False, is_deleted=False, created_at=now, updated_at=now)
    _apply_purchase(db, i, locals())
    db.add(i)
    db.flush()
    _save_attachments(db, attachments, purchase_id=i.id)
    _record_supplier(db, supplier_name, supplier_no)
    warnings = _budget(db, {(i.issue_date.year, i.issue_date.month): {i.expense_category}})
    staff_auth.audit(db, request, "tax.purchase.create", user_id=staff.id, target=f"purchase_tax:{i.id}")
    db.commit()
    return {"id": i.id, "budget_warnings": warnings}


@router.post("/purchases/{iid}/update", dependencies=[WRITE])
def update_purchase(iid: int, request: Request, issue_date: str = Form(...), supplier_name: str = Form(...), supplier_no: str = Form(""),
                    client_id: str | None = Form(None), item: str = Form(...), supply_amount: str = Form("0"), tax_amount: str = Form("0"),
                    expense_category: str = Form(...), deduction_status: str = Form("review"), payment_method: str = Form(""), memo: str = Form(""),
                    attachments: list[UploadFile] = File([]), staff: CustomAuthUser = Depends(require_staff_admin), db: Session = Depends(get_db)):
    i = db.query(PurchaseTaxInvoice).filter(PurchaseTaxInvoice.id == iid, PurchaseTaxInvoice.is_deleted == False).first()  # noqa: E712
    if not i:
        raise HTTPException(404, "매입 세금계산서를 찾을 수 없습니다.")
    f = dict(locals())
    _apply_purchase(db, i, f)
    i.updated_at = datetime.now()
    _save_attachments(db, attachments, purchase_id=iid)
    _record_supplier(db, supplier_name, supplier_no)
    warnings = _budget(db, {(i.issue_date.year, i.issue_date.month): {i.expense_category}})
    staff_auth.audit(db, request, "tax.purchase.update", user_id=staff.id, target=f"purchase_tax:{iid}")
    db.commit()
    return {"ok": True, "budget_warnings": warnings}


def _get_p(db: Session, iid: int) -> PurchaseTaxInvoice:
    i = db.query(PurchaseTaxInvoice).filter(PurchaseTaxInvoice.id == iid, PurchaseTaxInvoice.is_deleted == False).first()  # noqa: E712
    if not i:
        raise HTTPException(404, "매입 세금계산서를 찾을 수 없습니다.")
    return i


@router.post("/purchases/{iid}/delete", dependencies=[WRITE])
def delete_purchase(iid: int, request: Request, staff: CustomAuthUser = Depends(require_staff_admin), db: Session = Depends(get_db)):
    i = _get_p(db, iid)
    i.is_deleted, i.updated_at = True, datetime.now()
    staff_auth.audit(db, request, "tax.purchase.delete", user_id=staff.id, target=f"purchase_tax:{iid}")
    db.commit()
    return {"ok": True}


@router.post("/purchases/{iid}/toggle-deduction", dependencies=[WRITE])
def toggle_deduction(iid: int, db: Session = Depends(get_db)):
    i = _get_p(db, iid)
    i.deduction_status = {"review": "deductible", "deductible": "non_deductible", "non_deductible": "review"}.get(i.deduction_status, "review")
    i.updated_at = datetime.now()
    db.commit()
    return {"status": i.deduction_status, "label": DEDUCTION[i.deduction_status]}


@router.post("/purchases/{iid}/toggle-submitted", dependencies=[WRITE])
def toggle_submitted(iid: int, db: Session = Depends(get_db)):
    i = _get_p(db, iid)
    i.is_submitted, i.updated_at = not i.is_submitted, datetime.now()
    db.commit()
    return {"submitted": i.is_submitted}


class FilterBody(BaseModel):
    q: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    category: str | None = None
    deduction: str | None = None


@router.post("/purchases/bulk-submit", dependencies=[WRITE])
def bulk_submit(body: FilterBody, db: Session = Depends(get_db)):
    n = _purchase_query(db, body.q, body.date_from, body.date_to, body.category, body.deduction).filter(
        PurchaseTaxInvoice.is_submitted == False).update({PurchaseTaxInvoice.is_submitted: True, PurchaseTaxInvoice.updated_at: datetime.now()},  # noqa: E712
                                                          synchronize_session=False)
    db.commit()
    return {"updated": n}


# 매입 일괄등록(매입/외주 알람 납부내역 → 계산서) — 1단계 프리필 / 2단계 확정
class BulkIds(BaseModel):
    history_ids: list[int]


def _purchase_histories(db: Session, ids: list[int]):
    pids = db.query(Payment.seq).join(PaymentAlarm, Payment.payment_alarm_id == PaymentAlarm.seq).filter(PaymentAlarm.payment_type.in_(PURCHASE_TYPES))
    return db.query(PaymentHistory).filter(PaymentHistory.seq.in_(ids or [0]), PaymentHistory.payment_id.in_(pids))


@router.post("/purchases/bulk-prefill")
def bulk_prefill(body: BulkIds, db: Session = Depends(get_db)):
    linked = {r for (r,) in db.query(PurchaseTaxInvoice.source_payment_history_id).filter(PurchaseTaxInvoice.is_deleted == False,  # noqa: E712
                                                                                         PurchaseTaxInvoice.source_payment_history_id.in_(body.history_ids or [0]))}
    rows, skipped = [], 0
    for h in _purchase_histories(db, body.history_ids).order_by(PaymentHistory.created_at.desc()):
        if h.seq in linked:
            skipped += 1
            continue
        total = (h.deposit_amount or 0) + (h.progress_amount or 0) + (h.balance_amount or 0)
        supply = round(total / 1.1)
        p = db.query(Payment).filter(Payment.seq == h.payment_id).first()
        a = db.query(PaymentAlarm).filter(PaymentAlarm.seq == p.payment_alarm_id).first() if p and p.payment_alarm_id else None
        d = h.balance_date or h.deposit_date or h.created_at
        rows.append({"history_id": h.seq, "issue_date": _iso(d.date() if isinstance(d, datetime) else d), "supplier_name": a.title if a else "",
                     "supplier_no": "", "item": a.title if a else "", "supply_amount": supply, "tax_amount": total - supply, "total_amount": total,
                     "expense_category": "외주비" if a and a.payment_type == "outsourcing" else "소프트웨어 구독료", "deduction_status": "review",
                     "payment_method": "", "memo": ""})
    return {"rows": rows, "skipped": skipped}


class BulkRow(BaseModel):
    history_id: int
    issue_date: date | None = None
    supplier_name: str = ""
    supplier_no: str = ""
    item: str = ""
    supply_amount: int | str = 0
    tax_amount: int | str = 0
    expense_category: str = "기타"
    deduction_status: str = "review"
    payment_method: str = ""
    memo: str = ""


class BulkConfirm(BaseModel):
    rows: list[BulkRow]


@router.post("/purchases/bulk-create", dependencies=[WRITE])
def bulk_create(body: BulkConfirm, request: Request, staff: CustomAuthUser = Depends(require_staff_admin), db: Session = Depends(get_db)):
    """확정 저장 — 납부내역 행 잠금, 이미 연결된 건·같은 알람+작성일 중복은 건너뜀(cms tax_purchase_bulk_create)."""
    ids = [r.history_id for r in body.rows]
    db.query(PaymentHistory.seq).filter(PaymentHistory.seq.in_(ids or [0])).with_for_update().all()
    hist = {h.seq: h for h in _purchase_histories(db, ids)}
    created, skipped, keys, months = 0, [], set(), {}
    now = datetime.now()
    for r in body.rows:
        h = hist.get(r.history_id)
        if not h or not r.issue_date or not r.supplier_name.strip() or db.query(PurchaseTaxInvoice.id).filter(
                PurchaseTaxInvoice.source_payment_history_id == r.history_id, PurchaseTaxInvoice.is_deleted == False).first():  # noqa: E712
            skipped.append(r.history_id)
            continue
        p = db.query(Payment).filter(Payment.seq == h.payment_id).first()
        alarm_id = p.payment_alarm_id if p else None
        key = (alarm_id, r.issue_date)
        if alarm_id and (key in keys or db.query(PurchaseTaxInvoice.id).filter(PurchaseTaxInvoice.source_payment_alarm_id == alarm_id,
                                                                             PurchaseTaxInvoice.issue_date == r.issue_date,
                                                                             PurchaseTaxInvoice.is_deleted == False).first()):  # noqa: E712
            skipped.append(r.history_id)
            continue
        cat = r.expense_category if r.expense_category in bl.EXPENSE_CATEGORIES else "기타"
        db.add(PurchaseTaxInvoice(issue_date=r.issue_date, supplier_name=r.supplier_name.strip()[:100], supplier_no=r.supplier_no.strip()[:20],
                                  item=(r.item or r.supplier_name).strip()[:200], supply_amount=_amount(r.supply_amount), tax_amount=_amount(r.tax_amount),
                                  expense_category=cat, deduction_status=r.deduction_status if r.deduction_status in DEDUCTION else "review",
                                  payment_method=r.payment_method if r.payment_method in PAYMENT_METHODS else "", memo=r.memo, is_submitted=False,
                                  is_deleted=False, source_payment_history_id=r.history_id, source_payment_alarm_id=alarm_id, created_at=now, updated_at=now))
        _record_supplier(db, r.supplier_name, r.supplier_no)
        months.setdefault((r.issue_date.year, r.issue_date.month), set()).add(cat)
        keys.add(key)
        created += 1
        db.flush()
    warnings = _budget(db, months)
    staff_auth.audit(db, request, "tax.purchase.bulk_create", user_id=staff.id, detail=f"{created}건")
    db.commit()
    return {"created": created, "skipped": skipped, "budget_warnings": warnings}


# ── 매출 ─────────────────────────────────────────────────────────────────

@router.get("/sales")
def list_sales(q: str | None = None, date_from: date | None = None, date_to: date | None = None, issue_status: str | None = None,
               payment_status: str | None = None, page: int = Query(1, ge=1), per_page: int = Query(20, le=200),
               sort: str | None = Query(None, description="issue_date|buyer_name|amount|issue_status|payment_status, '-' 접두 = 내림차순"),
               db: Session = Depends(get_db)):
    query = db.query(SalesTaxInvoice).filter(SalesTaxInvoice.is_deleted == False)  # noqa: E712
    if q:
        like = f"%{q}%"
        query = query.filter(or_(SalesTaxInvoice.buyer_name.like(like), SalesTaxInvoice.item.like(like), SalesTaxInvoice.buyer_no.like(like)))
    if date_from:
        query = query.filter(SalesTaxInvoice.issue_date >= date_from)
    if date_to:
        query = query.filter(SalesTaxInvoice.issue_date <= date_to)
    if issue_status:
        query = query.filter(SalesTaxInvoice.issue_status == issue_status)
    if payment_status:
        query = query.filter(SalesTaxInvoice.payment_status == payment_status)
    total = query.count()
    sums = query.with_entities(func.coalesce(func.sum(SalesTaxInvoice.supply_amount), 0), func.coalesce(func.sum(SalesTaxInvoice.tax_amount), 0)).first()
    S = SalesTaxInvoice
    query = apply_sort(query, sort, {"issue_date": S.issue_date, "buyer_name": S.buyer_name, "amount": S.supply_amount + S.tax_amount,
                                     "issue_status": S.issue_status, "payment_status": S.payment_status},
                       [S.issue_date.desc(), S.created_at.desc()])
    rows = query.offset((page - 1) * per_page).limit(per_page).all()
    atts = _attachments(db, TaxAttachment.sales_invoice_id, [r.id for r in rows])
    out = page_response([_sales_row(r, atts) for r in rows], total, page, per_page)
    out.update(totals={"supply": int(sums[0]), "tax": int(sums[1]), "total": int(sums[0]) + int(sums[1])}, write_enabled=write_enabled("tax"))
    return out


@router.get("/sales/prefill-histories")
def sales_prefill(db: Session = Depends(get_db)):
    """매출 계산서 '납부내역에서 가져오기' 후보 300건(매입/외주 알람분·이미 연결된 건 제외, 회차 금액 합)."""
    linked = db.query(SalesTaxInvoice.source_payment_history_id).filter(SalesTaxInvoice.is_deleted == False, SalesTaxInvoice.source_payment_history_id.isnot(None))  # noqa: E712
    excluded = db.query(Payment.seq).join(PaymentAlarm, Payment.payment_alarm_id == PaymentAlarm.seq).filter(PaymentAlarm.payment_type.in_(PURCHASE_TYPES))
    rows = db.query(PaymentHistory).filter(~PaymentHistory.seq.in_(linked), or_(PaymentHistory.payment_id.is_(None), ~PaymentHistory.payment_id.in_(excluded))
                                           ).order_by(PaymentHistory.created_at.desc()).limit(300).all()
    companies = {c.seq: c for c in db.query(Company).filter(Company.seq.in_({h.company_id for h in rows} - {None} or {0}))}
    projects = dict(db.query(Project.seq, Project.title).filter(Project.seq.in_({h.project_id for h in rows} - {None} or {0})))
    out = []
    for h in rows:
        amount = (h.deposit_amount or 0) + (h.progress_amount or 0) + (h.balance_amount or 0)
        if amount <= 0:
            continue
        supply = round(amount / 1.1)
        d = h.balance_date or h.progress_date or h.deposit_date or h.created_at
        c = companies.get(h.company_id)
        out.append({"history_id": h.seq, "client_id": h.company_id, "buyer_name": c.name if c else "", "buyer_no": getattr(c, "business_number", "") or "" if c else "",
                    "item": projects.get(h.project_id) or (c.name if c else ""), "supply_amount": supply, "tax_amount": amount - supply, "invoice_amount": amount,
                    "date_candidate": _iso(d.date() if isinstance(d, datetime) else d)})
    return out


@router.get("/sales/{iid}")
def get_sale(iid: int, db: Session = Depends(get_db)):
    i = db.query(SalesTaxInvoice).filter(SalesTaxInvoice.id == iid, SalesTaxInvoice.is_deleted == False).first()  # noqa: E712
    if not i:
        raise HTTPException(404, "매출 세금계산서를 찾을 수 없습니다.")
    out = _sales_row(i, _attachments(db, TaxAttachment.sales_invoice_id, [iid]))
    out["write_enabled"] = write_enabled("tax")
    return out


def _apply_sale(db: Session, i: SalesTaxInvoice, f: dict) -> None:
    try:
        i.issue_date = date.fromisoformat(f["issue_date"])
        i.payment_date = date.fromisoformat(f["payment_date"]) if f["payment_date"] else None
    except (TypeError, ValueError):
        raise HTTPException(400, "날짜를 확인하세요.")
    if not (f["buyer_name"] or "").strip() or not (f["item"] or "").strip():
        raise HTTPException(400, "공급받는자 상호와 품목을 입력하세요.")
    if f["issue_status"] not in ISSUE_STATUS or f["payment_status"] not in PAY_STATUS:
        raise HTTPException(400, "발행/입금 상태가 올바르지 않습니다.")
    i.buyer_name, i.buyer_no, i.item = f["buyer_name"].strip()[:100], (f["buyer_no"] or "").strip()[:20], f["item"].strip()[:200]
    i.supply_amount, i.tax_amount = _amount(f["supply_amount"]), _amount(f["tax_amount"])
    i.issue_status, i.payment_status, i.memo = f["issue_status"], f["payment_status"], f["memo"] or ""
    cid = f["client_id"]
    i.client_id = int(cid) if cid and str(cid).isdigit() and db.query(Company.seq).filter(Company.seq == int(cid)).first() else None


@router.post("/sales", dependencies=[WRITE])
def create_sale(request: Request, issue_date: str = Form(...), buyer_name: str = Form(...), buyer_no: str = Form(""), client_id: str | None = Form(None),
                item: str = Form(...), supply_amount: str = Form("0"), tax_amount: str = Form("0"), issue_status: str = Form("issued"),
                payment_status: str = Form("unpaid"), payment_date: str | None = Form(None), memo: str = Form(""),
                source_payment_history_id: str | None = Form(None), attachments: list[UploadFile] = File([]),
                staff: CustomAuthUser = Depends(require_staff_admin), db: Session = Depends(get_db)):
    now = datetime.now()
    i = SalesTaxInvoice(is_submitted=False, is_deleted=False, created_at=now, updated_at=now)
    _apply_sale(db, i, locals())
    # 연결 납부내역: 잘못된 값·매입/외주 알람분·이미 연결된 건은 조용히 무시(cms 와 같음)
    src = int(source_payment_history_id) if source_payment_history_id and source_payment_history_id.isdigit() else None
    if src:
        dup = db.query(SalesTaxInvoice.id).filter(SalesTaxInvoice.source_payment_history_id == src, SalesTaxInvoice.is_deleted == False).first()  # noqa: E712
        purchase = _purchase_histories(db, [src]).first()
        if dup or purchase or not db.query(PaymentHistory.seq).filter(PaymentHistory.seq == src).first():
            src = None
    i.source_payment_history_id = src
    db.add(i)
    db.flush()
    _save_attachments(db, attachments, sales_id=i.id)
    staff_auth.audit(db, request, "tax.sales.create", user_id=staff.id, target=f"sales_tax:{i.id}")
    db.commit()
    return {"id": i.id}


@router.post("/sales/{iid}/update", dependencies=[WRITE])
def update_sale(iid: int, request: Request, issue_date: str = Form(...), buyer_name: str = Form(...), buyer_no: str = Form(""),
                client_id: str | None = Form(None), item: str = Form(...), supply_amount: str = Form("0"), tax_amount: str = Form("0"),
                issue_status: str = Form("issued"), payment_status: str = Form("unpaid"), payment_date: str | None = Form(None), memo: str = Form(""),
                attachments: list[UploadFile] = File([]), staff: CustomAuthUser = Depends(require_staff_admin), db: Session = Depends(get_db)):
    i = db.query(SalesTaxInvoice).filter(SalesTaxInvoice.id == iid, SalesTaxInvoice.is_deleted == False).first()  # noqa: E712
    if not i:
        raise HTTPException(404, "매출 세금계산서를 찾을 수 없습니다.")
    f = dict(locals())
    _apply_sale(db, i, f)
    i.updated_at = datetime.now()
    _save_attachments(db, attachments, sales_id=iid)
    staff_auth.audit(db, request, "tax.sales.update", user_id=staff.id, target=f"sales_tax:{iid}")
    db.commit()
    return {"ok": True}


@router.post("/sales/{iid}/delete", dependencies=[WRITE])
def delete_sale(iid: int, request: Request, staff: CustomAuthUser = Depends(require_staff_admin), db: Session = Depends(get_db)):
    i = db.query(SalesTaxInvoice).filter(SalesTaxInvoice.id == iid, SalesTaxInvoice.is_deleted == False).first()  # noqa: E712
    if not i:
        raise HTTPException(404, "매출 세금계산서를 찾을 수 없습니다.")
    i.is_deleted, i.updated_at = True, datetime.now()
    staff_auth.audit(db, request, "tax.sales.delete", user_id=staff.id, target=f"sales_tax:{iid}")
    db.commit()
    return {"ok": True}


@router.post("/sales/{iid}/toggle-issue", dependencies=[WRITE])
def toggle_issue(iid: int, db: Session = Depends(get_db)):
    """pending ↔ issued. 발행으로 바꾸면 연결 납부내역의 회차별 계산서 발행일 빈 칸을 지금으로 채운다(cms 와 같음)."""
    i = db.query(SalesTaxInvoice).filter(SalesTaxInvoice.id == iid, SalesTaxInvoice.is_deleted == False).first()  # noqa: E712
    if not i:
        raise HTTPException(404, "매출 세금계산서를 찾을 수 없습니다.")
    now = datetime.now()
    if i.issue_status == "pending":
        i.issue_status = "issued"
        h = db.query(PaymentHistory).filter(PaymentHistory.seq == i.source_payment_history_id).first() if i.source_payment_history_id else None
        if h:
            for amt, field in (("deposit_amount", "tax_invoice_date"), ("progress_amount", "progress_tax_invoice_date"), ("balance_amount", "balance_tax_invoice_date")):
                if (getattr(h, amt) or 0) > 0 and not getattr(h, field):
                    setattr(h, field, now)
    elif i.issue_status == "issued":
        i.issue_status = "pending"
    i.updated_at = now
    db.commit()
    return {"status": i.issue_status, "label": ISSUE_STATUS[i.issue_status]}


# ── 첨부 ─────────────────────────────────────────────────────────────────

@router.get("/attachments/{aid}")
def download(aid: int, db: Session = Depends(get_db)):
    a = db.query(TaxAttachment).filter(TaxAttachment.id == aid).first()
    if not a:
        raise HTTPException(404, "파일을 찾을 수 없습니다.")
    return file_download_response(a.file, a.original_name)


@router.post("/attachments/{aid}/delete", dependencies=[WRITE])
def delete_attachment(aid: int, db: Session = Depends(get_db)):
    a = db.query(TaxAttachment).filter(TaxAttachment.id == aid).first()
    if not a:
        raise HTTPException(404, "파일을 찾을 수 없습니다.")
    path = a.file
    db.delete(a)
    db.commit()
    delete_media(path)
    return {"ok": True}
