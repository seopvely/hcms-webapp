"""업체·고객 계정 (/api/managed/accounts) — cms 고객리스트 + 업체관리 통합.

- 고객 계정 생성은 비밀번호 없이 만들고 초대 링크(1회용, 72시간)로 고객이 직접 설정한다.
- login_id 는 전역 유일 + '@' 금지(통합 로그인: '@' 가 있으면 직원으로 판정).
- 로그인 허용 코드: '1' 허용 / '2' 차단(잠금 포함). 회사 삭제 기능은 두지 않는다.
"""
import re
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.endpoints.managed.common import page_response, require_write, write_enabled
from app.core.deps import get_current_staff
from app.db.session import get_db
from app.models.company import Company
from app.models.customer import CustomAuthUser
from app.models.manager import Manager
from app.services import customer_invite, staff_auth
from app.services.email import send_customer_invite

router = APIRouter(prefix="/accounts", tags=["managed-accounts"])
WRITE = require_write("customers")
LOGIN_ID_RE = re.compile(r"^[A-Za-z0-9._-]{3,50}$")

COMPANY_FIELDS = ("name", "ceoname", "business_number", "phone_number", "ceo_phone_number", "fax_number",
                  "ceo_email", "tax_email", "address", "address_de", "post_number")


def _manager(m: Manager) -> dict:
    return {
        "seq": m.seq,
        "login_id": m.login_id,
        "name": m.name,
        "email": m.email,
        "phone_number": m.phone_number,
        "mobile_number": m.mobile_number,
        "position": m.position,
        "department": m.department,
        "login_permit_tf": m.login_permit_tf,
        "login_attempt_count": m.login_attempt_count or 0,
        "is_first_login": bool(m.is_first_login),
        "has_password": bool(m.password),
        "last_login": m.last_login.isoformat() if m.last_login else None,
    }


@router.get("")
def list_accounts(q: str | None = None, db: Session = Depends(get_db)):
    companies = db.query(Company).order_by(Company.name).all()
    managers: dict[int, list] = {}
    for m in db.query(Manager).order_by(Manager.seq):
        managers.setdefault(m.company_id, []).append(_manager(m))
    items = []
    for c in companies:
        ms = managers.get(c.seq, [])
        if q:
            needle = q.strip().lower()
            hay = " ".join([c.name or ""] + [f"{m['name'] or ''} {m['login_id'] or ''} {m['email'] or ''}" for m in ms]).lower()
            if needle not in hay:
                continue
        items.append({"seq": c.seq, "name": c.name, "ceoname": c.ceoname, "phone_number": c.phone_number, "managers": ms})
    return page_response(items, len(items), 1, max(len(items), 1)) | {"write_enabled": write_enabled("customers")}


@router.get("/{company_id}")
def get_account(company_id: int, db: Session = Depends(get_db)):
    c = db.query(Company).filter(Company.seq == company_id).first()
    if c is None:
        raise HTTPException(status_code=404, detail="업체를 찾을 수 없습니다.")
    managers = db.query(Manager).filter(Manager.company_id == company_id).order_by(Manager.seq).all()
    return {
        "seq": c.seq,
        **{f: getattr(c, f) for f in COMPANY_FIELDS},
        "has_business_file": bool(c.business_file),
        "has_bank_file": bool(c.bank_file),
        "managers": [_manager(m) for m in managers],
        "write_enabled": write_enabled("customers"),
    }


class CompanyUpdate(BaseModel):
    name: str | None = None
    ceoname: str | None = None
    business_number: str | None = None
    phone_number: str | None = None
    ceo_phone_number: str | None = None
    fax_number: str | None = None
    ceo_email: str | None = None
    tax_email: str | None = None
    address: str | None = None
    address_de: str | None = None
    post_number: str | None = None


@router.post("", dependencies=[WRITE])
def create_company(body: CompanyUpdate, request: Request,
                   staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """업체 신규 등록(cms supplier_register). 고객 계정은 등록 후 상세 화면에서 추가·초대한다."""
    data = {k: (v.strip() if isinstance(v, str) else v) for k, v in body.model_dump(exclude_unset=True).items()}
    if not data.get("name"):
        raise HTTPException(status_code=400, detail="업체명을 입력하세요.")
    dup = db.query(Company.seq).filter(Company.name == data["name"]).first()
    if dup:
        raise HTTPException(status_code=400, detail=f"같은 이름의 업체가 있습니다(#{dup[0]}).")
    now = datetime.now()
    c = Company(created_at=now, updated_at=now, **{**data, "ceo_email": data.get("ceo_email") or ""})  # ceo_email DB NOT NULL
    db.add(c)
    db.flush()
    staff_auth.audit(db, request, "company_create", user_id=staff.id, target=f"company:{c.seq}")
    db.commit()
    return {"seq": c.seq}


@router.patch("/{company_id}", dependencies=[WRITE])
def update_company(company_id: int, body: CompanyUpdate, request: Request,
                   staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    c = db.query(Company).filter(Company.seq == company_id).first()
    if c is None:
        raise HTTPException(status_code=404, detail="업체를 찾을 수 없습니다.")
    data = body.model_dump(exclude_unset=True)
    if "name" in data and not (data["name"] or "").strip():
        raise HTTPException(status_code=400, detail="업체명을 입력하세요.")
    if "ceo_email" in data and data["ceo_email"] is None:
        data["ceo_email"] = ""  # DB NOT NULL
    for key, value in data.items():
        setattr(c, key, value.strip() if isinstance(value, str) else value)
    c.updated_at = datetime.now()
    staff_auth.audit(db, request, "company_update", user_id=staff.id, target=f"company:{company_id}", detail=",".join(sorted(data)))
    db.commit()
    return {"ok": True}


def _validate_login_id(db: Session, login_id: str, exclude_seq: int | None = None) -> str:
    login_id = login_id.strip()
    if "@" in login_id or not LOGIN_ID_RE.match(login_id):
        raise HTTPException(status_code=400, detail="아이디는 영문·숫자·. _ - 3~50자이며 '@' 를 쓸 수 없습니다.")
    query = db.query(Manager.seq).filter(func.lower(Manager.login_id) == login_id.lower())
    if exclude_seq:
        query = query.filter(Manager.seq != exclude_seq)
    if query.first() or db.query(CustomAuthUser.id).filter(func.lower(CustomAuthUser.username) == login_id.lower()).first():
        raise HTTPException(status_code=400, detail="이미 사용 중인 아이디입니다.")
    return login_id


class ManagerCreate(BaseModel):
    login_id: str
    name: str
    email: str
    phone_number: str | None = None
    position: str | None = None
    send_invite: bool = True


def _send_invite(db: Session, manager: Manager, staff_id: int, background: BackgroundTasks) -> None:
    if not manager.email:
        raise HTTPException(status_code=400, detail="이메일이 없는 계정에는 초대 메일을 보낼 수 없습니다.")
    token = customer_invite.issue(db, manager.seq, staff_id)
    company = db.query(Company).filter(Company.seq == manager.company_id).first()
    background.add_task(send_customer_invite, manager.email, manager.name, company.name if company else "", manager.login_id, token)


@router.post("/{company_id}/managers", dependencies=[WRITE])
def create_manager(company_id: int, body: ManagerCreate, request: Request, background: BackgroundTasks,
                   staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    if not db.query(Company.seq).filter(Company.seq == company_id).first():
        raise HTTPException(status_code=404, detail="업체를 찾을 수 없습니다.")
    login_id = _validate_login_id(db, body.login_id)
    if "@" not in body.email:
        raise HTTPException(status_code=400, detail="이메일 형식이 올바르지 않습니다.")
    now = datetime.now()
    m = Manager(company_id=company_id, login_id=login_id, name=body.name.strip(), email=body.email.strip(),
                phone_number=body.phone_number, position=body.position, password=None, login_permit_tf="1",
                login_attempt_count=0, is_first_login=True, created_at=now, updated_at=now)
    db.add(m)
    db.flush()
    if body.send_invite:
        _send_invite(db, m, staff.id, background)
    staff_auth.audit(db, request, "customer_create", user_id=staff.id, target=f"manager:{m.seq}", detail=login_id)
    db.commit()
    return _manager(m)


class ManagerUpdate(BaseModel):
    login_id: str | None = None
    name: str | None = None
    email: str | None = None
    phone_number: str | None = None
    mobile_number: str | None = None
    position: str | None = None
    department: str | None = None


def _get_manager(db: Session, seq: int) -> Manager:
    m = db.query(Manager).filter(Manager.seq == seq).first()
    if m is None:
        raise HTTPException(status_code=404, detail="고객 계정을 찾을 수 없습니다.")
    return m


@router.patch("/managers/{seq}", dependencies=[WRITE])
def update_manager(seq: int, body: ManagerUpdate, request: Request,
                   staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    m = _get_manager(db, seq)
    data = body.model_dump(exclude_unset=True)
    if "login_id" in data:
        data["login_id"] = _validate_login_id(db, data["login_id"] or "", exclude_seq=seq)
    for key, value in data.items():
        setattr(m, key, value.strip() if isinstance(value, str) else value)
    m.updated_at = datetime.now()
    staff_auth.audit(db, request, "customer_update", user_id=staff.id, target=f"manager:{seq}", detail=",".join(sorted(data)))
    db.commit()
    return _manager(m)


class PermitBody(BaseModel):
    allow: bool


@router.post("/managers/{seq}/permit", dependencies=[WRITE])
def set_permit(seq: int, body: PermitBody, request: Request,
               staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """로그인 허용('1', 실패 횟수 초기화) / 차단('2')."""
    m = _get_manager(db, seq)
    m.login_permit_tf = "1" if body.allow else "2"
    if body.allow:
        m.login_attempt_count = 0
    m.updated_at = datetime.now()
    staff_auth.audit(db, request, "customer_permit", user_id=staff.id, target=f"manager:{seq}", detail=m.login_permit_tf)
    db.commit()
    return _manager(m)


@router.post("/managers/{seq}/invite", dependencies=[WRITE])
def send_invite(seq: int, request: Request, background: BackgroundTasks,
                staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """비밀번호 설정 링크 발송(신규·비밀번호 분실·빈 비밀번호 계정). 기존 비밀번호는 링크로 새로 설정하기 전까지 유지된다."""
    m = _get_manager(db, seq)
    _send_invite(db, m, staff.id, background)
    staff_auth.audit(db, request, "customer_invite", user_id=staff.id, target=f"manager:{seq}")
    db.commit()
    return {"ok": True, "email": m.email}
