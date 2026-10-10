"""외주 (/api/managed/outsourcing) — 외주·외주업체·지급내역·달력.

결제일알람 연동(cms 와 같은 규칙, 빠뜨리면 재무 숫자가 어긋난다):
- 지급내역이 생기면(수정 저장·지급완료 토글) 연결 알람이 없을 때 PaymentAlarm(outsourcing, once) 을 만든다.
- 지급 취소 토글은 연결 알람과 전액 지급내역을 지운다.
- 외주 삭제는 POST + 연결 알람을 함께 정리한다(cms 는 알람이 고아로 남았다).
"""
from datetime import date, datetime, time
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from app.api.endpoints.managed.common import page_response, require_write, write_enabled
from app.core.deps import get_current_staff
from app.db.session import get_db
from app.models.customer import (
    CustomAuthUser,
    Outsourcing,
    OutsourcingPayment,
    OutsourcingVendor,
    PaymentAlarm,
    Project,
)
from app.services import staff_auth
from app.utils.media import file_download_response

router = APIRouter(prefix="/outsourcing", tags=["managed-outsourcing"])
WRITE = require_write("outsourcing")
WORK_TYPES = {"planning": "기획", "development": "개발", "design": "디자인", "publishing": "퍼블리싱", "frontend": "프론트앤드", "backend": "백엔드"}
STATUS = {"active": "진행중", "completed": "완료", "cancelled": "취소"}


def _iso(v):
    return v.isoformat() if v else None


def _num(v):
    return int(v) if v is not None else None


def _alarm_for(db: Session, item: Outsourcing, alarm_date: date) -> None:
    """연결 알람이 없으면 생성(cms outsourcing_update / toggle_paid 와 같은 값)."""
    if db.query(PaymentAlarm.seq).filter(PaymentAlarm.outsourcing_id == item.seq).first():
        return
    vendor = db.query(OutsourcingVendor).filter(OutsourcingVendor.seq == item.vendor_id).first()
    project = db.query(Project).filter(Project.seq == item.project_id).first() if item.project_id else None
    title = f"{vendor.name if vendor else '외주'} 외주비" + (f" - {project.title}" if project and project.title else "")
    now = datetime.now()
    db.add(PaymentAlarm(payment_type="outsourcing", title=title, description=item.description or "", amount=item.amount,
                        cycle_type="once", payment_day=alarm_date.day, start_date=alarm_date, end_date=alarm_date,
                        valid_status="valid", project_id=item.project_id, outsourcing_id=item.seq, send_to_all_agents=True,
                        notify_days_before=3, alarm_time=time(9, 0), created_at=now, updated_at=now))


def _delete_alarms(db: Session, outsourcing_id: int) -> None:
    ids = [a for (a,) in db.query(PaymentAlarm.seq).filter(PaymentAlarm.outsourcing_id == outsourcing_id)]
    for aid in ids:
        db.execute(text("DELETE FROM payment_alarm_history WHERE payment_alarm_id=:a"), {"a": aid})
        db.execute(text("DELETE FROM payment_alarm_recipients WHERE paymentalarm_id=:a"), {"a": aid})
        db.execute(text("UPDATE payment SET payment_alarm_id=NULL WHERE payment_alarm_id=:a"), {"a": aid})
        db.execute(text("DELETE FROM tithe_purchase_check WHERE payment_alarm_id=:a"), {"a": aid})
        db.execute(text("UPDATE managed_purchasetaxinvoice SET source_payment_alarm_id=NULL WHERE source_payment_alarm_id=:a"), {"a": aid})
    if ids:
        db.query(PaymentAlarm).filter(PaymentAlarm.seq.in_(ids)).delete(synchronize_session=False)


def _recalc(db: Session, item: Outsourcing) -> None:
    """지급내역 기준 지급여부·지급일(cms recalc_payment_status). 내역이 없으면 그대로."""
    pays = db.query(OutsourcingPayment).filter(OutsourcingPayment.outsourcing_id == item.seq).all()
    if not pays:
        return
    total = sum((Decimal(p.amount) for p in pays), Decimal(0))
    item.is_paid = bool(item.amount) and total >= Decimal(item.amount)
    item.paid_date = max(p.paid_date for p in pays)


def _serialize(db: Session, o: Outsourcing, vendors: dict, projects: dict, staff: dict) -> dict:
    pays = db.query(OutsourcingPayment).filter(OutsourcingPayment.outsourcing_id == o.seq).order_by(OutsourcingPayment.paid_date).all()
    return {
        "seq": o.seq, "vendor_id": o.vendor_id, "vendor_name": vendors.get(o.vendor_id), "project_id": o.project_id,
        "project_title": projects.get(o.project_id), "work_type": o.work_type, "work_type_label": WORK_TYPES.get(o.work_type, o.work_type),
        "start_date": _iso(o.start_date), "end_date": _iso(o.end_date), "description": o.description, "amount": _num(o.amount),
        "status": o.status, "status_label": STATUS.get(o.status, o.status), "manager_id": o.manager_id,
        "manager_name": staff.get(o.manager_id) or o.manager_name or None, "is_paid": bool(o.is_paid), "paid_date": _iso(o.paid_date),
        "paid_total": sum(_num(p.amount) for p in pays),
        "payments": [{"seq": p.seq, "amount": _num(p.amount), "paid_date": _iso(p.paid_date),
                      "expected_paid_date": _iso(p.expected_paid_date), "memo": p.memo} for p in pays],
    }


def _maps(db: Session):
    return ({v.seq: v.name for v in db.query(OutsourcingVendor)}, {p.seq: p.title for p in db.query(Project.seq, Project.title)},
            {u.id: (u.name or u.username) for u in db.query(CustomAuthUser)})


@router.get("")
def list_outsourcing(q: str | None = None, status: str | None = None, vendor_id: int | None = None,
                     page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    query = db.query(Outsourcing).outerjoin(OutsourcingVendor, Outsourcing.vendor_id == OutsourcingVendor.seq)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(Outsourcing.description.like(like), OutsourcingVendor.name.like(like)))
    if status:
        query = query.filter(Outsourcing.status == status)
    if vendor_id:
        query = query.filter(Outsourcing.vendor_id == vendor_id)
    total = query.count()
    rows = query.order_by(Outsourcing.start_date.desc()).offset((page - 1) * per_page).limit(per_page).all()
    vendors, projects, staff = _maps(db)
    return page_response([_serialize(db, o, vendors, projects, staff) for o in rows], total, page, per_page) | {
        "choices": {"work_type": WORK_TYPES, "status": STATUS}, "write_enabled": write_enabled("outsourcing")}


@router.get("/calendar")
def calendar(start: date, end: date, db: Session = Depends(get_db)):
    rows = db.query(Outsourcing).filter(Outsourcing.start_date <= end, Outsourcing.end_date >= start).all()
    vendors, projects, staff = _maps(db)
    return {"items": [_serialize(db, o, vendors, projects, staff) for o in rows]}


# ── 외주업체 ──
@router.get("/vendors")
def list_vendors(db: Session = Depends(get_db)):
    counts = dict(db.execute(text("SELECT vendor_id, COUNT(*) FROM outsourcing GROUP BY vendor_id")).fetchall())
    return {"items": [{
        "seq": v.seq, "name": v.name, "ceoname": v.ceoname, "business_number": v.business_number, "phone": v.phone,
        "email": v.email, "tax_email": v.tax_email, "address": v.address, "specialization": v.specialization, "notes": v.notes,
        "bank_account_info": v.bank_account_info, "has_business_file": bool(v.business_registration_file),
        "has_bank_file": bool(v.bank_account_file), "outsourcing_count": counts.get(v.seq, 0),
    } for v in db.query(OutsourcingVendor).order_by(OutsourcingVendor.name)], "write_enabled": write_enabled("outsourcing")}


@router.get("/vendors/{seq}/files/{kind}")
def vendor_file(seq: int, kind: str, db: Session = Depends(get_db)):
    v = db.query(OutsourcingVendor).filter(OutsourcingVendor.seq == seq).first()
    path = {"business": v.business_registration_file, "bank": v.bank_account_file}.get(kind) if v else None
    if not path:
        raise HTTPException(status_code=404, detail="파일이 없습니다.")
    return file_download_response(path)


class VendorBody(BaseModel):
    name: str | None = None
    ceoname: str | None = None
    business_number: str | None = None
    phone: str | None = None
    email: str | None = None
    tax_email: str | None = None
    address: str | None = None
    specialization: str | None = None
    notes: str | None = None
    bank_account_info: str | None = None


@router.post("/vendors", dependencies=[WRITE])
def create_vendor(body: VendorBody, db: Session = Depends(get_db)):
    if not (body.name or "").strip():
        raise HTTPException(status_code=400, detail="업체명을 입력하세요.")
    now = datetime.now()
    v = OutsourcingVendor(**{k: (val.strip() if isinstance(val, str) else val) for k, val in body.model_dump().items()}, created_at=now, updated_at=now)
    db.add(v)
    db.commit()
    return {"seq": v.seq}


@router.patch("/vendors/{seq}", dependencies=[WRITE])
def update_vendor(seq: int, body: VendorBody, db: Session = Depends(get_db)):
    v = db.query(OutsourcingVendor).filter(OutsourcingVendor.seq == seq).first()
    if v is None:
        raise HTTPException(status_code=404, detail="외주업체를 찾을 수 없습니다.")
    for k, val in body.model_dump(exclude_unset=True).items():
        setattr(v, k, val.strip() if isinstance(val, str) else val)
    v.updated_at = datetime.now()
    db.commit()
    return {"ok": True}


@router.post("/vendors/{seq}/delete", dependencies=[WRITE])
def delete_vendor(seq: int, db: Session = Depends(get_db)):
    """외주가 하나라도 있으면 삭제하지 않는다(cms 는 소속 외주를 전부 CASCADE 삭제했다)."""
    if db.query(Outsourcing.seq).filter(Outsourcing.vendor_id == seq).first():
        raise HTTPException(status_code=400, detail="외주 내역이 있는 업체는 삭제할 수 없습니다.")
    db.query(OutsourcingVendor).filter(OutsourcingVendor.seq == seq).delete(synchronize_session=False)
    db.commit()
    return {"ok": True}


# ── 외주 ──
@router.get("/{seq}")
def get_outsourcing(seq: int, db: Session = Depends(get_db)):
    o = db.query(Outsourcing).filter(Outsourcing.seq == seq).first()
    if o is None:
        raise HTTPException(status_code=404, detail="외주를 찾을 수 없습니다.")
    vendors, projects, staff = _maps(db)
    alarm = db.query(PaymentAlarm).filter(PaymentAlarm.outsourcing_id == seq).first()
    return _serialize(db, o, vendors, projects, staff) | {
        "alarm": {"seq": alarm.seq, "title": alarm.title, "valid_status": alarm.valid_status} if alarm else None,
        "choices": {"work_type": WORK_TYPES, "status": STATUS}, "write_enabled": write_enabled("outsourcing")}


class PaymentRow(BaseModel):
    seq: int | None = None
    amount: int
    paid_date: date
    expected_paid_date: date | None = None
    memo: str | None = None


class OutsourcingBody(BaseModel):
    vendor_id: int | None = None
    project_id: int | None = None
    work_type: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    description: str | None = None
    amount: int | None = None
    status: str | None = None
    manager_id: int | None = None
    manager_name: str | None = None
    is_paid: bool | None = None
    paid_date: date | None = None
    payments: list[PaymentRow] | None = None


def _validate(data: dict) -> None:
    if "work_type" in data and data["work_type"] not in WORK_TYPES:
        raise HTTPException(status_code=400, detail="외주 형태가 올바르지 않습니다.")
    if "status" in data and data["status"] not in STATUS:
        raise HTTPException(status_code=400, detail="상태가 올바르지 않습니다.")


@router.post("", dependencies=[WRITE])
def create_outsourcing(body: OutsourcingBody, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True, exclude={"payments", "is_paid", "paid_date"})
    _validate(data)
    if not data.get("vendor_id") or not data.get("work_type") or not data.get("start_date") or not data.get("end_date"):
        raise HTTPException(status_code=400, detail="외주업체·형태·기간은 필수입니다.")
    now = datetime.now()
    o = Outsourcing(description="", status="active", manager_name="", is_paid=False, created_at=now, updated_at=now)
    for k, v in data.items():
        setattr(o, k, v.strip() if isinstance(v, str) else v)
    if o.manager_id:
        o.manager_name = ""
    db.add(o)
    db.flush()
    staff_auth.audit(db, request, "outsourcing_create", user_id=staff.id, target=f"outsourcing:{o.seq}")
    db.commit()
    return {"seq": o.seq}


@router.patch("/{seq}", dependencies=[WRITE])
def update_outsourcing(seq: int, body: OutsourcingBody, db: Session = Depends(get_db)):
    o = db.query(Outsourcing).filter(Outsourcing.seq == seq).with_for_update().first()
    if o is None:
        raise HTTPException(status_code=404, detail="외주를 찾을 수 없습니다.")
    data = body.model_dump(exclude_unset=True, exclude={"payments"})
    _validate(data)
    for k, v in data.items():
        setattr(o, k, v.strip() if isinstance(v, str) else v)
    if body.payments is not None:
        rows = [p for p in body.payments if p.amount > 0]
        total = sum(p.amount for p in rows)
        if o.amount is not None and total > int(o.amount):
            raise HTTPException(status_code=400, detail="지급내역 합계가 외주 금액을 초과합니다.")
        keep = [p.seq for p in rows if p.seq]
        q = db.query(OutsourcingPayment).filter(OutsourcingPayment.outsourcing_id == seq)
        (q.filter(~OutsourcingPayment.seq.in_(keep)) if keep else q).delete(synchronize_session=False)
        now = datetime.now()
        for p in rows:
            if p.seq:
                db.query(OutsourcingPayment).filter(OutsourcingPayment.seq == p.seq, OutsourcingPayment.outsourcing_id == seq).update(
                    {"amount": p.amount, "paid_date": p.paid_date, "expected_paid_date": p.expected_paid_date,
                     "memo": (p.memo or "")[:200], "updated_at": now}, synchronize_session=False)
            else:
                db.add(OutsourcingPayment(outsourcing_id=seq, amount=p.amount, paid_date=p.paid_date, expected_paid_date=p.expected_paid_date,
                                          memo=(p.memo or "")[:200], created_at=now, updated_at=now))
        db.flush()
    elif o.is_paid and not o.paid_date:
        o.paid_date = date.today()
    _recalc(db, o)
    o.updated_at = datetime.now()
    if db.query(OutsourcingPayment.seq).filter(OutsourcingPayment.outsourcing_id == seq).first():
        _alarm_for(db, o, o.paid_date or date.today())
    db.commit()
    return {"ok": True}


class ToggleBody(BaseModel):
    is_paid: bool
    paid_date: date | None = None


@router.post("/{seq}/toggle-paid", dependencies=[WRITE])
def toggle_paid(seq: int, body: ToggleBody, db: Session = Depends(get_db)):
    o = db.query(Outsourcing).filter(Outsourcing.seq == seq).with_for_update().first()
    if o is None:
        raise HTTPException(status_code=404, detail="외주를 찾을 수 없습니다.")
    pays = db.query(OutsourcingPayment).filter(OutsourcingPayment.outsourcing_id == seq).all()
    if pays:
        full_single = len(pays) == 1 and o.amount and Decimal(pays[0].amount) >= Decimal(o.amount)
        if not full_single:
            raise HTTPException(status_code=400, detail="부분지급 내역이 있는 외주는 상세 화면의 지급내역에서 변경해주세요.")
    o.is_paid = body.is_paid
    o.paid_date = body.paid_date if body.is_paid else None
    now = datetime.now()
    if body.is_paid and body.paid_date:
        if not pays and o.amount:
            db.add(OutsourcingPayment(outsourcing_id=seq, amount=o.amount, paid_date=body.paid_date, memo="[지급완료 처리]", created_at=now, updated_at=now))
        elif pays:
            pays[0].paid_date = body.paid_date
        _alarm_for(db, o, body.paid_date)
    elif not body.is_paid:
        _delete_alarms(db, seq)
        db.query(OutsourcingPayment).filter(OutsourcingPayment.outsourcing_id == seq).delete(synchronize_session=False)
    o.updated_at = now
    db.commit()
    return {"ok": True}


@router.post("/{seq}/delete", dependencies=[WRITE])
def delete_outsourcing(seq: int, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    o = db.query(Outsourcing).filter(Outsourcing.seq == seq).first()
    if o is None:
        raise HTTPException(status_code=404, detail="외주를 찾을 수 없습니다.")
    if db.execute(text("SELECT COUNT(*) FROM managed_purchasetaxinvoice WHERE source_outsourcing_id=:s"), {"s": seq}).scalar():
        raise HTTPException(status_code=400, detail="매입 세금계산서에 연결된 외주는 삭제할 수 없습니다.")
    _delete_alarms(db, seq)
    db.query(OutsourcingPayment).filter(OutsourcingPayment.outsourcing_id == seq).delete(synchronize_session=False)
    staff_auth.audit(db, request, "outsourcing_delete", user_id=staff.id, target=f"outsourcing:{seq}")
    db.delete(o)
    db.commit()
    return {"ok": True}
