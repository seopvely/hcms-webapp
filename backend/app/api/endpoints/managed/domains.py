"""도메인 (/api/managed/domains) — 목록(서버 페이지)·상세·등록·수정·연장(도메인/SSL/호스팅).

상태: A 활성 / I 비활성 / E 만료. URL 은 domain_urls(JSON) 와 레거시 5칸을 함께 저장한다(cms 와 같음).
"""
import json
from datetime import date, datetime

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.endpoints.managed.common import page_response, require_write, write_enabled
from app.core.deps import get_current_staff
from app.db.session import get_db
from app.models.company import Company
from app.models.customer import CustomAuthUser, Domain, DomainExtensionHistory, Project, ProjectDomain

router = APIRouter(prefix="/domains", tags=["managed-domains"])
WRITE = require_write("domains")
STATUS = {"A": "활성", "I": "비활성", "E": "만료"}
DATE_FIELDS = ("domain_start_date", "domain_end_date", "domain_ssl_start_date", "domain_ssl_end_date",
               "hosting_start_date", "hosting_end_date")
TEXT_FIELDS = ("domain_status", "domain_remarks", "domain_ssl_tf", "domain_ssl_status", "domain_ssl_remarks",
               "hosting_type", "hosting_provider", "hosting_status", "hosting_remarks")


def _d(v):
    return v.date() if isinstance(v, datetime) else v


def _iso(v):
    return _d(v).isoformat() if v else None


def _serialize(d: Domain, company_name: str | None = None) -> dict:
    today = date.today()
    return {
        "seq": d.seq, "company_id": d.company_id, "company_name": company_name, "urls": d.all_urls(),
        **{f: _iso(getattr(d, f)) for f in DATE_FIELDS}, **{f: getattr(d, f) for f in TEXT_FIELDS},
        "status_label": STATUS.get(d.domain_status or "", "-"),
        "domain_expired": bool(d.domain_end_date and _d(d.domain_end_date) < today),
        "ssl_expired": bool(d.domain_ssl_end_date and _d(d.domain_ssl_end_date) < today),
    }


@router.get("")
def list_domains(
    q: str | None = None, status: str | None = None, company_id: int | None = None,
    page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200), db: Session = Depends(get_db),
):
    query = db.query(Domain, Company.name).outerjoin(Company, Domain.company_id == Company.seq)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(Domain.domain_url.like(like), Domain.domain_urls.like(like), Company.name.like(like)))
    if status:
        query = query.filter(Domain.domain_status == status)
    if company_id:
        query = query.filter(Domain.company_id == company_id)
    total = query.count()
    rows = query.order_by(Domain.domain_end_date.is_(None), Domain.domain_end_date).offset((page - 1) * per_page).limit(per_page).all()
    return page_response([_serialize(d, n) for d, n in rows], total, page, per_page) | {"write_enabled": write_enabled("domains")}


@router.get("/{seq}")
def get_domain(seq: int, db: Session = Depends(get_db)):
    d = db.query(Domain).filter(Domain.seq == seq).first()
    if d is None:
        raise HTTPException(status_code=404, detail="도메인을 찾을 수 없습니다.")
    company = db.query(Company).filter(Company.seq == d.company_id).first() if d.company_id else None
    staff = {u.id: (u.name or u.username) for u in db.query(CustomAuthUser)}
    hist = db.query(DomainExtensionHistory).filter(DomainExtensionHistory.domain_id == seq).order_by(DomainExtensionHistory.created_at.desc()).all()
    projects = db.query(Project.seq, Project.title).join(ProjectDomain, ProjectDomain.project_id == Project.seq).filter(ProjectDomain.domain_id == seq).all()
    return {
        **_serialize(d, company.name if company else None),
        "projects": [{"seq": s, "title": t} for s, t in projects],
        "histories": [{"type": h.extension_type, "previous_end_date": _iso(h.previous_end_date), "new_end_date": _iso(h.new_end_date),
                       "months": h.extension_period, "remarks": h.remarks, "by": staff.get(h.created_by_id),
                       "created_at": h.created_at.isoformat() if h.created_at else None} for h in hist],
        "write_enabled": write_enabled("domains"),
    }


class DomainBody(BaseModel):
    company_id: int | None = None
    urls: list[str] | None = None
    domain_start_date: date | None = None
    domain_end_date: date | None = None
    domain_status: str | None = None
    domain_remarks: str | None = None
    domain_ssl_tf: str | None = None
    domain_ssl_start_date: date | None = None
    domain_ssl_end_date: date | None = None
    domain_ssl_status: str | None = None
    domain_ssl_remarks: str | None = None
    hosting_type: str | None = None
    hosting_provider: str | None = None
    hosting_start_date: date | None = None
    hosting_end_date: date | None = None
    hosting_status: str | None = None
    hosting_remarks: str | None = None


def _apply(d: Domain, data: dict) -> None:
    for key in ("domain_status", "domain_ssl_status", "hosting_status"):
        if key in data and data[key] not in (None, "", "A", "I", "E"):
            raise HTTPException(status_code=400, detail="상태 값은 A·I·E 중 하나입니다.")
    if "urls" in data:
        urls = [u.strip() for u in (data.pop("urls") or []) if u and u.strip()]
        d.domain_urls = json.dumps(urls, ensure_ascii=False)
        legacy = (urls + [None] * 5)[:5]
        d.domain_url, d.domain_url_second, d.domain_url_third, d.domain_url_fourth, d.domain_url_fifth = legacy
    for key, value in data.items():
        if key in DATE_FIELDS and value:
            value = datetime.combine(value, datetime.min.time())
        elif isinstance(value, str):
            value = value.strip() or None
        setattr(d, key, value)
    d.updated_at = datetime.now()


@router.post("", dependencies=[WRITE])
def create_domain(body: DomainBody, db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    if not data.get("company_id") or not data.get("urls"):
        raise HTTPException(status_code=400, detail="업체와 도메인 주소는 필수입니다.")
    d = Domain(domain_status="A", created_at=datetime.now())
    _apply(d, data)
    db.add(d)
    db.commit()
    return {"seq": d.seq}


@router.patch("/{seq}", dependencies=[WRITE])
def update_domain(seq: int, body: DomainBody, db: Session = Depends(get_db)):
    d = db.query(Domain).filter(Domain.seq == seq).first()
    if d is None:
        raise HTTPException(status_code=404, detail="도메인을 찾을 수 없습니다.")
    _apply(d, body.model_dump(exclude_unset=True))
    db.commit()
    return {"ok": True}


class ExtendBody(BaseModel):
    extension_type: str  # D 도메인 / S SSL / H 호스팅
    months: int = 12
    remarks: str | None = None


@router.post("/{seq}/extend", dependencies=[WRITE])
def extend(seq: int, body: ExtendBody, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """연장 — 이력을 남기고 해당 종료일 += N개월(종료일이 없으면 오늘부터), 상태 A. 호스팅(H)은 hcms 에서 추가."""
    fields = {"D": ("domain_end_date", "domain_status"), "S": ("domain_ssl_end_date", "domain_ssl_status"),
              "H": ("hosting_end_date", "hosting_status")}.get(body.extension_type)
    if fields is None or not 1 <= body.months <= 120:
        raise HTTPException(status_code=400, detail="연장 유형(D·S·H)과 개월(1~120)을 확인하세요.")
    d = db.query(Domain).filter(Domain.seq == seq).with_for_update().first()
    if d is None:
        raise HTTPException(status_code=404, detail="도메인을 찾을 수 없습니다.")
    end_field, status_field = fields
    previous = getattr(d, end_field)
    new_end = (previous or datetime.now()) + relativedelta(months=body.months)
    db.add(DomainExtensionHistory(domain_id=seq, extension_type=body.extension_type, previous_end_date=previous, new_end_date=new_end,
                                  extension_period=body.months, remarks=body.remarks or "", created_by_id=staff.id, created_at=datetime.now()))
    setattr(d, end_field, new_end)
    setattr(d, status_field, "A")
    d.updated_at = datetime.now()
    db.commit()
    return {"ok": True, "new_end_date": _iso(new_end)}
