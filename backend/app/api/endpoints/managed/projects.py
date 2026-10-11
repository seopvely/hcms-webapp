"""프로젝트 (/api/managed/projects) — 목록·상세·등록·수정(연장 처리)·도메인 연결·관련문서·홈페이지 오픈·삭제·계약 달력.

연장 규칙(cms render_project_update 와 같음): 계약종료일이 바뀌면 이전 계약 정보를 contract_history 에 남기고
extension_count += 1, 무상 유지보수 기간을 새 종료일 기준으로 재계산, 열린 유지보수 전환(MaintRenewal)을 closed 로.
삭제는 관리자 + 연결 데이터(납부·요청·게시글 등)가 하나도 없을 때만 — 그 외에는 '중지(3)'로 처리한다.
"""
import os
from datetime import date, datetime, timedelta

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy import or_, text
from sqlalchemy.orm import Session, joinedload

from app.api.endpoints.managed.common import apply_sort, page_response, require_write, write_enabled
from app.api.endpoints.managed.estimates import PROJECT_TYPES
from app.core.deps import get_current_staff, require_staff_admin
from app.db.session import get_db
from app.models.company import Company
from app.models.customer import (
    ContractHistory,
    CustomAuthUser,
    Domain,
    MaintRenewal,
    Payment,
    PaymentHistory,
    PointHistory,
    Project,
    ProjectDomain,
    SalesLeadActivity,
    SalesLead,
)
from app.services import staff_auth
from app.services.conversion import _BLOCKER_SQL
from app.utils.free_maint import free_maint_state
from app.utils.media import MEDIA_ROOT, file_download_response

router = APIRouter(prefix="/projects", tags=["managed-projects"])
WRITE = require_write("projects")
STATUS = {"1": "진행중", "2": "완료", "3": "중지"}
ROLES = ("contract", "planning", "design", "frontend", "backend", "maintenance")
OPEN_RENEWAL = ("pending", "contacted", "accepted", "declined", "estimated")


def _d(v):
    return v.date() if isinstance(v, datetime) else v


def _iso(v):
    return v.isoformat() if v else None


def _phase(p: Project, today: date) -> str:
    """목록 상태(cms 와 같이 계약일·종료일로 계산): stopped / active / free_maint / ended / upcoming / unknown."""
    if str(p.project_status or "") == "3":
        return "stopped"
    s, e = _d(p.contract_date), _d(p.contract_termination_date)
    if p.free_maint_start_date and p.free_maint_end_date and p.free_maint_start_date <= today <= p.free_maint_end_date:
        return "free_maint"
    if s and e:
        if s <= today <= e:
            return "active"
        return "ended" if today > e else "upcoming"
    return "unknown"


PHASE_LABELS = {"stopped": "중지", "active": "진행중", "free_maint": "무상유지보수", "ended": "완료", "upcoming": "시작 전", "unknown": "기간 미설정"}


@router.get("")
def list_projects(
    q: str | None = None,
    phase: str | None = None,
    project_type: str | None = None,
    company_id: int | None = None,
    sort: str | None = Query(None, description="seq|title|contract_date|contract_termination_date|point, '-' 접두 = 내림차순"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(Project).options(joinedload(Project.company)).outerjoin(Company, Project.company_id == Company.seq)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(Project.title.like(like), Company.name.like(like)))
    if project_type:
        query = query.filter(Project.project_type == project_type)
    if company_id:
        query = query.filter(Project.company_id == company_id)
    rows = apply_sort(query, sort, {"seq": Project.seq, "title": Project.title, "contract_date": Project.contract_date,
                                   "contract_termination_date": Project.contract_termination_date, "point": Project.point},
                      [Project.created_at.desc(), Project.seq.desc()]).all()
    today = date.today()
    if phase:
        rows = [p for p in rows if _phase(p, today) == phase]
    total = len(rows)
    rows = rows[(page - 1) * per_page: page * per_page]
    items = [{
        "seq": p.seq, "title": p.title, "company_name": p.company.name if p.company else None,
        "project_type": p.project_type, "project_type_label": PROJECT_TYPES.get(str(p.project_type or ""), "-"),
        "phase": _phase(p, today), "phase_label": PHASE_LABELS[_phase(p, today)],
        "contract_date": _iso(_d(p.contract_date)), "contract_termination_date": _iso(_d(p.contract_termination_date)),
        "point": p.point, "contract_deposit": p.contract_deposit, "extension_count": p.extension_count or 0,
        "is_opened": bool(p.is_opened),
    } for p in rows]
    return page_response(items, total, page, per_page) | {"write_enabled": write_enabled("projects")}


@router.get("/calendar")
def calendar(year: int = Query(..., ge=2000, le=2100), db: Session = Depends(get_db)):
    """계약 달력: 해당 연도와 겹치는 계약 기간·무상 유지보수 기간."""
    start, end = date(year, 1, 1), date(year, 12, 31)
    rows = db.query(Project).options(joinedload(Project.company)).filter(
        Project.contract_date.isnot(None), Project.contract_termination_date.isnot(None)).all()
    items = []
    for p in rows:
        s, e = _d(p.contract_date), _d(p.contract_termination_date)
        fs, fe = p.free_maint_start_date, p.free_maint_end_date
        if (s <= end and e >= start) or (fs and fe and fs <= end and fe >= start):
            items.append({"seq": p.seq, "title": p.title, "company_name": p.company.name if p.company else None,
                          "start": s.isoformat(), "end": e.isoformat(), "stopped": str(p.project_status or "") == "3",
                          "free_start": _iso(fs), "free_end": _iso(fe)})
    return {"year": year, "items": sorted(items, key=lambda x: x["start"])}


@router.get("/{seq}")
def get_project(seq: int, db: Session = Depends(get_db)):
    p = db.query(Project).options(joinedload(Project.company)).filter(Project.seq == seq).first()
    if p is None:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")
    staff = {u.id: (u.name or u.username) for u in db.query(CustomAuthUser)}
    histories = db.query(ContractHistory).filter(ContractHistory.project_id == seq).order_by(ContractHistory.extension_number.desc()).all()
    links = db.query(ProjectDomain).filter(ProjectDomain.project_id == seq).all()
    domains = db.query(Domain).filter(Domain.company_id == p.company_id).order_by(Domain.created_at.desc()).all() if p.company_id else []
    renewals = db.query(MaintRenewal).filter(MaintRenewal.project_id == seq).order_by(MaintRenewal.due_date.desc()).all()
    payments = db.query(Payment).filter(Payment.project_id == seq).all()
    lead = db.query(SalesLead).filter(SalesLead.seq == p.sales_lead_id).first() if p.sales_lead_id else None
    triggers = db.query(SalesLeadActivity).filter(SalesLeadActivity.sales_lead_id == lead.seq, SalesLeadActivity.activity_type == "trigger").all() if lead else []
    linked = {(l.domain_id, l.domain_url) for l in links}
    primary = next(((l.domain_id, l.domain_url) for l in links if l.is_primary), None)
    return {
        "seq": p.seq, "title": p.title, "company_id": p.company_id, "company_name": p.company.name if p.company else None,
        "project_type": p.project_type, "project_status": p.project_status, "category": p.category,
        "contract_date": _iso(_d(p.contract_date)), "contract_termination_date": _iso(_d(p.contract_termination_date)),
        "contract_period_range": p.contract_period_range, "contract_deposit": p.contract_deposit, "point": p.point,
        "maintenance_request_enabled": bool(p.maintenance_request_enabled), "contract_remarks": p.contract_remarks,
        "requirements": p.requirements, "extension_count": p.extension_count or 0,
        "free_maint_months": p.free_maint_months, "free_maint_scope": p.free_maint_scope,
        "free_maint_start_date": _iso(p.free_maint_start_date), "free_maint_end_date": _iso(p.free_maint_end_date),
        "free_maint_state": free_maint_state(p)["state"],
        "phase_label": PHASE_LABELS[_phase(p, date.today())],
        **{f"manager_{r}_id": getattr(p, f"manager_select_{r}_seq_id") for r in ROLES},
        **{f"manager_{r}_name": staff.get(getattr(p, f"manager_select_{r}_seq_id")) for r in ROLES},
        "is_opened": bool(p.is_opened), "opened_at": _iso(p.opened_at), "opened_by": staff.get(p.opened_by_id),
        "sales_lead": {"seq": lead.seq, "title": lead.title} if lead else None,
        "open_triggers": [{"content": t.content, "created_at": _iso(t.created_at), "by": staff.get(t.created_by_id)} for t in triggers],
        "documents": [{"no": i, "name": getattr(p, f"related_documents_name{i}") or os.path.basename(getattr(p, f"related_documents{i}") or "")}
                      for i in range(1, 10) if getattr(p, f"related_documents{i}")],
        "domain_options": [{"domain_id": d.seq, "url": u, "selected": (d.seq, u) in linked, "primary": primary == (d.seq, u),
                            "end_date": _iso(_d(d.domain_end_date))} for d in domains for u in d.all_urls()],
        "contract_histories": [{
            "seq": h.seq, "extension_number": h.extension_number, "contract_date": _iso(_d(h.contract_date)),
            "contract_termination_date": _iso(_d(h.contract_termination_date)), "point": h.point, "memo": h.memo,
        } for h in histories],
        "renewals": [{"seq": r.seq, "due_date": _iso(r.due_date), "status": r.status} for r in renewals],
        "payments_total": sum(x.payment_amount or 0 for x in payments),
        "project_types": PROJECT_TYPES,
        "write_enabled": write_enabled("projects"),
    }


class ProjectBody(BaseModel):
    company_id: int | None = None
    title: str | None = None
    project_type: str | None = None
    project_status: str | None = None
    contract_date: date | None = None
    contract_termination_date: date | None = None
    contract_period_range: str | None = None
    contract_deposit: int | None = None
    point: int | None = None
    maintenance_request_enabled: bool | None = None
    contract_remarks: str | None = None
    free_maint_months: int | None = None
    free_maint_scope: str | None = None
    free_maint_start_date: date | None = None
    free_maint_end_date: date | None = None
    manager_contract_id: int | None = None
    manager_planning_id: int | None = None
    manager_design_id: int | None = None
    manager_frontend_id: int | None = None
    manager_backend_id: int | None = None
    manager_maintenance_id: int | None = None


def _apply_free_maint(p: Project, months: int | None, scope: str | None) -> None:
    """cms apply_free_maint: 시작 = 계약종료 다음날, 종료 = 시작 + N개월 − 1일."""
    if not months:
        p.free_maint_months = p.free_maint_scope = p.free_maint_start_date = p.free_maint_end_date = None
        return
    p.free_maint_months = months
    p.free_maint_scope = scope or None
    end = _d(p.contract_termination_date)
    if end:
        p.free_maint_start_date = end + timedelta(days=1)
        p.free_maint_end_date = p.free_maint_start_date + relativedelta(months=months) - timedelta(days=1)
    else:
        p.free_maint_start_date = p.free_maint_end_date = None


def _dt(d):
    return datetime.combine(d, datetime.min.time()) if isinstance(d, date) and not isinstance(d, datetime) else d


def _apply(p: Project, data: dict) -> None:
    if "project_type" in data and data["project_type"] and data["project_type"] not in PROJECT_TYPES and data["project_type"] != "16":
        raise HTTPException(status_code=400, detail="프로젝트 유형이 올바르지 않습니다.")
    if "project_status" in data and data["project_status"] not in (None, "1", "2", "3"):
        raise HTTPException(status_code=400, detail="상태 값이 올바르지 않습니다.")
    for key in ("company_id", "title", "project_type", "project_status", "contract_period_range", "contract_deposit",
                "point", "maintenance_request_enabled", "contract_remarks"):
        if key in data:
            setattr(p, key, data[key].strip() if isinstance(data[key], str) else data[key])
    for key in ("contract_date", "contract_termination_date"):
        if key in data:
            setattr(p, key, _dt(data[key]))
    for r in ROLES:
        if f"manager_{r}_id" in data:
            setattr(p, f"manager_select_{r}_seq_id", data[f"manager_{r}_id"])


@router.post("", dependencies=[WRITE])
def create_project(body: ProjectBody, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    if not data.get("company_id") or not (data.get("title") or "").strip():
        raise HTTPException(status_code=400, detail="업체와 프로젝트명은 필수입니다.")
    now = datetime.now()
    p = Project(extension_count=0, maintenance_request_enabled=True, is_opened=False, point=0, project_status="1",
                created_at=now, updated_at=now)
    _apply(p, data)
    if str(p.project_type) not in ("9", "10"):
        p.point = p.point or 0
    _apply_free_maint(p, data.get("free_maint_months"), data.get("free_maint_scope"))
    db.add(p)
    db.flush()
    # 유지보수(9)/서버관리(10) 프로젝트는 월 포인트 1개월분 충전 행(cms project_register 와 같음)
    if str(p.project_type) in ("9", "10") and p.point:
        name = "유지보수" if str(p.project_type) == "9" else "서버관리"
        db.add(PointHistory(company_id=p.company_id, project_id=p.seq, point=p.point, point_type="1", status="2",
                            content=f"{name} 프로젝트 생성 - {p.title}", created_at=now, updated_at=now, edited_at=now))
    staff_auth.audit(db, request, "project_create", user_id=staff.id, target=f"project:{p.seq}")
    db.commit()
    return {"seq": p.seq}


@router.patch("/{seq}", dependencies=[WRITE])
def update_project(seq: int, body: ProjectBody, request: Request, staff: CustomAuthUser = Depends(get_current_staff),
                   db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.seq == seq).with_for_update().first()
    if p is None:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")
    data = body.model_dump(exclude_unset=True)
    now = datetime.now()
    old = {k: getattr(p, k) for k in ("contract_date", "contract_termination_date", "contract_period_range", "point",
                                      "contract_deposit", "free_maint_months", "free_maint_scope", "free_maint_start_date",
                                      "free_maint_end_date")}
    old_count = p.extension_count or 0
    _apply(p, data)
    is_extension = bool(old["contract_termination_date"] and "contract_termination_date" in data and data["contract_termination_date"]
                        and _d(old["contract_termination_date"]) != data["contract_termination_date"])
    if is_extension:
        db.add(ContractHistory(project_id=seq, extension_number=old_count, contract_date=old["contract_date"] or old["contract_termination_date"],
                               contract_termination_date=old["contract_termination_date"], contract_period_range=old["contract_period_range"],
                               point=old["point"], contract_deposit=old["contract_deposit"], memo=f"{old_count}회차 계약 정보 (연장 전)",
                               free_maint_months=old["free_maint_months"], free_maint_scope=old["free_maint_scope"],
                               free_maint_start_date=old["free_maint_start_date"], free_maint_end_date=old["free_maint_end_date"],
                               created_at=now))
        p.extension_count = old_count + 1
    if "free_maint_months" in data or is_extension or "contract_termination_date" in data:
        months = data.get("free_maint_months", p.free_maint_months)
        scope = data.get("free_maint_scope", p.free_maint_scope)
        _apply_free_maint(p, months, scope)
        # 개월이 그대로이고 연장이 아니면 직접 지정한 기간을 그대로 쓴다(cms 와 같음)
        if months and not is_extension and months == old["free_maint_months"]:
            if data.get("free_maint_start_date") and data.get("free_maint_end_date"):
                p.free_maint_start_date, p.free_maint_end_date = data["free_maint_start_date"], data["free_maint_end_date"]
            elif old["free_maint_start_date"] and old["free_maint_end_date"]:
                p.free_maint_start_date, p.free_maint_end_date = old["free_maint_start_date"], old["free_maint_end_date"]
    p.updated_at = now
    closed = 0
    if is_extension:
        stamp = now.strftime("%Y-%m-%d %H:%M")
        for r in db.query(MaintRenewal).filter(MaintRenewal.project_id == seq, MaintRenewal.status.in_(OPEN_RENEWAL)).with_for_update():
            r.status = "closed"
            line = f"[{stamp}] 계약 연장으로 대체"
            r.memo = f"{r.memo}\n{line}" if r.memo else line
            r.updated_at = now
            closed += 1
    staff_auth.audit(db, request, "project_update", user_id=staff.id, target=f"project:{seq}",
                     detail=("extension " if is_extension else "") + ",".join(sorted(data)))
    db.commit()
    return {"ok": True, "extended": is_extension, "renewals_closed": closed}


class DomainLink(BaseModel):
    domain_id: int
    url: str
    is_primary: bool = False


class DomainLinks(BaseModel):
    links: list[DomainLink]


@router.put("/{seq}/domains", dependencies=[WRITE])
def set_domains(seq: int, body: DomainLinks, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.seq == seq).first()
    if p is None:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")
    ids = {l.domain_id for l in body.links}
    if ids and db.query(Domain).filter(Domain.seq.in_(ids), Domain.company_id != p.company_id).first():
        raise HTTPException(status_code=400, detail="다른 업체의 도메인은 연결할 수 없습니다.")
    now = datetime.now()
    db.query(ProjectDomain).filter(ProjectDomain.project_id == seq).delete(synchronize_session=False)
    for l in body.links:
        db.add(ProjectDomain(project_id=seq, domain_id=l.domain_id, domain_url=l.url, is_primary=l.is_primary, created_at=now, updated_at=now))
    db.commit()
    return {"ok": True}


@router.get("/{seq}/documents/{no}")
def download_document(seq: int, no: int, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.seq == seq).first()
    if p is None or not 1 <= no <= 9 or not getattr(p, f"related_documents{no}"):
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    return file_download_response(getattr(p, f"related_documents{no}"), getattr(p, f"related_documents_name{no}"))


@router.post("/{seq}/documents/{no}", dependencies=[WRITE])
def upload_document(seq: int, no: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """관련문서 칸(1~9)에 업로드 — 기존 파일은 지우지 않고 참조만 바꾼다(cms 는 디스크에서 삭제했다)."""
    from app.utils.media import save_upload

    p = db.query(Project).filter(Project.seq == seq).first()
    if p is None or not 1 <= no <= 9:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")
    path, name = save_upload(file, f"projects/{seq}/documents")
    setattr(p, f"related_documents{no}", path[:100])
    setattr(p, f"related_documents_name{no}", name[:255])
    p.updated_at = datetime.now()
    db.commit()
    return {"ok": True}


@router.post("/{seq}/documents/{no}/clear", dependencies=[WRITE])
def clear_document(seq: int, no: int, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.seq == seq).first()
    if p is None or not 1 <= no <= 9:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")
    setattr(p, f"related_documents{no}", "")
    setattr(p, f"related_documents_name{no}", "")
    p.updated_at = datetime.now()
    db.commit()
    return {"ok": True}


class OpenBody(BaseModel):
    opened: bool


@router.post("/{seq}/open", dependencies=[WRITE])
def set_opened(seq: int, body: OpenBody, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.seq == seq).first()
    if p is None:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")
    p.is_opened = body.opened
    p.opened_at = datetime.now() if body.opened else None
    p.opened_by_id = staff.id if body.opened else None
    db.commit()
    return {"ok": True}


@router.post("/histories/{hid}/delete", dependencies=[WRITE])
def delete_history(hid: int, db: Session = Depends(get_db)):
    h = db.query(ContractHistory).filter(ContractHistory.seq == hid).first()
    if h is None:
        raise HTTPException(status_code=404, detail="이력을 찾을 수 없습니다.")
    pid = h.project_id
    db.delete(h)
    db.flush()
    p = db.query(Project).filter(Project.seq == pid).first()
    p.extension_count = db.query(ContractHistory).filter(ContractHistory.project_id == pid).count()
    db.commit()
    return {"ok": True}


@router.post("/{seq}/delete", dependencies=[WRITE])
def delete_project(seq: int, request: Request, admin: CustomAuthUser = Depends(require_staff_admin), db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.seq == seq).with_for_update().first()
    if p is None:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")
    blockers = {k: n for k, sql in _BLOCKER_SQL.items() if (n := db.execute(text(sql), {"p": seq}).scalar())}
    for label, model in (("납부", Payment), ("납부내역", PaymentHistory), ("포인트 내역", PointHistory)):
        n = db.query(model).filter(model.project_id == seq).count()
        if n:
            blockers[label] = n
    for label, sql in (("견적서", "SELECT COUNT(*) FROM Estimate WHERE project_id=:p OR converted_project_id=:p"),
                       ("유지보수 전환", "SELECT COUNT(*) FROM maint_renewal WHERE project_id=:p OR new_project_id=:p"),
                       ("구독", "SELECT (SELECT COUNT(*) FROM pacms_maintsubscription WHERE project_id=:p)")):
        n = db.execute(text(sql), {"p": seq}).scalar()
        if n:
            blockers[label] = n
    if blockers:
        raise HTTPException(status_code=400, detail="연결 데이터가 있어 삭제할 수 없습니다(중지 처리하세요): " + ", ".join(f"{k} {v}건" for k, v in blockers.items()))
    staff_auth.audit(db, request, "project_delete", user_id=admin.id, target=f"project:{seq}", detail=(p.title or "")[:200])
    db.delete(p)
    db.commit()
    return {"ok": True}
