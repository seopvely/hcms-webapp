"""영업접수 (/api/managed/sales).

- 임시저장은 서버에 draft 행을 만들지 않는다(화면이 브라우저에 보관) — cms 자동저장의 draft 고아·리드 소실 버그 제거.
- 상태 변경·견적 전환은 활동 이력을 남긴다(cms 와 같은 activity_type).
- 견적 전환은 리드당 1회(이미 견적이 있으면 그 견적으로 이동).
"""
from datetime import date, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.endpoints.managed.common import page_response, require_write, write_enabled
from app.api.endpoints.managed.estimates import next_estimate_number
from app.core.deps import get_current_staff
from app.db.session import get_db
from app.models.company import Company
from app.models.customer import (
    CustomAuthUser,
    Estimate,
    Project,
    SalesLead,
    SalesLeadActivity,
    SalesLeadActivityAttachment,
)
from app.services import staff_auth
from app.utils.media import file_download_response, save_upload

router = APIRouter(prefix="/sales", tags=["managed-sales"])
WRITE = require_write("sales")

STATUS = {"new": "신규접수", "contact": "컨택중", "meeting": "미팅/상담", "proposal": "제안서", "estimate": "견적 발행",
          "negotiation": "협상중", "won": "수주", "lost": "실주", "hold": "보류"}
SOURCE = {"web": "홈페이지", "phone": "전화", "referral": "소개", "visit": "방문", "email": "이메일", "partner": "파트너",
          "kakao": "카카오톡", "instagram": "인스타그램", "facebook": "페이스북", "threads": "스레드", "other": "기타"}
PRIORITY = {"high": "높음", "medium": "보통", "low": "낮음"}
ACTIVITY = {"call": "전화", "email": "이메일", "kakao": "카카오톡", "meeting": "미팅", "prompting": "프롬프팅",
            "status_change": "상태변경", "trigger": "프로젝트 오픈 근거", "notification": "알림", "note": "메모", "auto": "자동"}
USER_ACTIVITY = {"call", "email", "kakao", "meeting", "prompting", "trigger", "note"}


def _iso(v):
    return v.isoformat() if v else None


def _activity(db: Session, lead_id: int, kind: str, content: str, staff_id: int | None,
              old: str = "", new: str = "") -> SalesLeadActivity:
    a = SalesLeadActivity(sales_lead_id=lead_id, activity_type=kind, content=content, old_status=old or "",
                          new_status=new or "", created_by_id=staff_id, created_at=datetime.now())
    db.add(a)
    return a


def _get(db: Session, seq: int) -> SalesLead:
    lead = db.query(SalesLead).filter(SalesLead.seq == seq).first()
    if lead is None:
        raise HTTPException(status_code=404, detail="영업접수를 찾을 수 없습니다.")
    return lead


@router.get("")
def list_leads(
    q: str | None = None,
    status: str | None = None,
    source: str | None = None,
    priority: str | None = None,
    manager_id: int | None = None,
    drafts: bool = False,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(SalesLead).filter(SalesLead.is_draft == drafts)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(SalesLead.title.like(like), SalesLead.client_company.like(like),
                                 SalesLead.client_name.like(like), SalesLead.client_phone.like(like)))
    for col, value in ((SalesLead.status, status), (SalesLead.source, source), (SalesLead.priority, priority),
                       (SalesLead.manager_id, manager_id)):
        if value:
            query = query.filter(col == value)
    total = query.count()
    rows = query.order_by(SalesLead.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    staff = {u.id: (u.name or u.username) for u in db.query(CustomAuthUser)}
    pipeline = dict(db.query(SalesLead.status, func.count(SalesLead.seq)).filter(SalesLead.is_draft == False).group_by(SalesLead.status))  # noqa: E712
    draft_count = db.query(func.count(SalesLead.seq)).filter(SalesLead.is_draft == True).scalar()  # noqa: E712
    items = [{
        "seq": r.seq, "title": r.title, "client_company": r.client_company, "client_name": r.client_name,
        "status": r.status, "status_label": STATUS.get(r.status, r.status), "source_label": SOURCE.get(r.source, r.source),
        "priority": r.priority, "priority_label": PRIORITY.get(r.priority, r.priority), "expected_amount": r.expected_amount,
        "expected_close_date": _iso(r.expected_close_date), "manager_name": staff.get(r.manager_id),
        "estimate_id": r.estimate_id, "created_at": _iso(r.created_at),
    } for r in rows]
    return page_response(items, total, page, per_page) | {
        "pipeline": [{"status": k, "label": v, "count": pipeline.get(k, 0)} for k, v in STATUS.items()],
        "draft_count": draft_count,
        "choices": {"status": STATUS, "source": SOURCE, "priority": PRIORITY, "activity": ACTIVITY},
        "write_enabled": write_enabled("sales"),
    }


@router.get("/company/{company_id}/activities")
def company_activities(company_id: int, db: Session = Depends(get_db)):
    """업체의 프로젝트에 연결된 영업접수별 활동 이력(cms _company_project_activities — 유지보수·건별작업 상세 패널)."""
    projects = (db.query(Project).filter(Project.company_id == company_id, Project.sales_lead_id.isnot(None))
                .order_by(Project.created_at.desc()).all())
    by_lead: dict[int, list] = {}
    for p in projects:
        by_lead.setdefault(p.sales_lead_id, []).append({"seq": p.seq, "title": p.title})
    if not by_lead:
        return {"items": []}
    leads = {l.seq: l for l in db.query(SalesLead).filter(SalesLead.seq.in_(by_lead))}
    staff = {u.id: (u.name or u.username) for u in db.query(CustomAuthUser)}
    acts: dict[int, list] = {}
    for a in (db.query(SalesLeadActivity).filter(SalesLeadActivity.sales_lead_id.in_(by_lead))
              .order_by(SalesLeadActivity.created_at.desc()).limit(200)):
        acts.setdefault(a.sales_lead_id, []).append({
            "id": a.seq, "type": a.activity_type, "type_label": ACTIVITY.get(a.activity_type, a.activity_type),
            "content": a.content, "created_by": staff.get(a.created_by_id), "created_at": _iso(a.created_at)})
    return {"items": [{
        "lead": {"seq": lid, "title": leads[lid].title if lid in leads else None,
                 "status_label": STATUS.get(leads[lid].status, leads[lid].status) if lid in leads else None},
        "projects": projs, "activities": acts.get(lid, []),
    } for lid, projs in by_lead.items()]}


@router.get("/activities/search")
def search_activities(q: str, activity_type: str | None = None, db: Session = Depends(get_db)):
    query = db.query(SalesLeadActivity, SalesLead).join(SalesLead, SalesLeadActivity.sales_lead_id == SalesLead.seq).filter(
        SalesLeadActivity.content.like(f"%{q.strip()}%"))
    if activity_type:
        query = query.filter(SalesLeadActivity.activity_type == activity_type)
    rows = query.order_by(SalesLeadActivity.created_at.desc()).limit(100).all()
    return {"items": [{"activity_id": a.seq, "lead_id": l.seq, "lead_title": l.title,
                       "type_label": ACTIVITY.get(a.activity_type, a.activity_type), "content": a.content[:200],
                       "created_at": _iso(a.created_at)} for a, l in rows]}


@router.get("/{seq}")
def get_lead(seq: int, db: Session = Depends(get_db)):
    lead = _get(db, seq)
    staff = {u.id: (u.name or u.username) for u in db.query(CustomAuthUser)}
    activities = db.query(SalesLeadActivity).filter(SalesLeadActivity.sales_lead_id == seq).order_by(SalesLeadActivity.created_at.desc()).all()
    files: dict[int, list] = {}
    if activities:
        for f in db.query(SalesLeadActivityAttachment).filter(SalesLeadActivityAttachment.activity_id.in_([a.seq for a in activities])):
            files.setdefault(f.activity_id, []).append({"id": f.seq, "filename": f.filename})
    estimate = db.query(Estimate).filter(Estimate.seq == lead.estimate_id).first() if lead.estimate_id else None
    projects = db.query(Project).filter(Project.sales_lead_id == seq).all()
    company = db.query(Company).filter(Company.seq == lead.company_id).first() if lead.company_id else None
    fields = ("title", "source", "status", "priority", "company_id", "client_company", "client_name", "client_phone",
              "client_email", "client_position", "description", "expected_amount", "manager_id", "notes", "is_draft")
    return {
        "seq": lead.seq, **{f: getattr(lead, f) for f in fields},
        "expected_close_date": _iso(lead.expected_close_date), "created_at": _iso(lead.created_at),
        "status_label": STATUS.get(lead.status, lead.status), "source_label": SOURCE.get(lead.source, lead.source),
        "priority_label": PRIORITY.get(lead.priority, lead.priority), "manager_name": staff.get(lead.manager_id),
        "company_name": company.name if company else None,
        "estimate": {"seq": estimate.seq, "number": estimate.estimate_number, "status": str(estimate.estimate_status)} if estimate else None,
        "projects": [{"seq": p.seq, "title": p.title} for p in projects],
        "activities": [{
            "seq": a.seq, "type": a.activity_type, "type_label": ACTIVITY.get(a.activity_type, a.activity_type),
            "content": a.content, "old_status": a.old_status, "new_status": a.new_status,
            "by": staff.get(a.created_by_id), "by_id": a.created_by_id, "created_at": _iso(a.created_at),
            "attachments": files.get(a.seq, []),
        } for a in activities],
        "choices": {"status": STATUS, "source": SOURCE, "priority": PRIORITY, "activity": {k: ACTIVITY[k] for k in USER_ACTIVITY}},
        "write_enabled": write_enabled("sales"),
    }


@router.get("/files/{attachment_id}")
def download_attachment(attachment_id: int, db: Session = Depends(get_db)):
    a = db.query(SalesLeadActivityAttachment).filter(SalesLeadActivityAttachment.seq == attachment_id).first()
    if a is None:
        raise HTTPException(status_code=404, detail="첨부를 찾을 수 없습니다.")
    return file_download_response(a.file, a.filename)


class LeadBody(BaseModel):
    title: str | None = None
    source: str | None = None
    priority: str | None = None
    company_id: int | None = None
    client_company: str | None = None
    client_name: str | None = None
    client_phone: str | None = None
    client_email: str | None = None
    client_position: str | None = None
    description: str | None = None
    expected_amount: int | None = None
    expected_close_date: date | None = None
    manager_id: int | None = None
    notes: str | None = None


def _apply(lead: SalesLead, data: dict) -> None:
    if "source" in data and data["source"] not in SOURCE:
        raise HTTPException(status_code=400, detail="유입 채널 값이 올바르지 않습니다.")
    if "priority" in data and data["priority"] not in PRIORITY:
        raise HTTPException(status_code=400, detail="우선순위 값이 올바르지 않습니다.")
    for key, value in data.items():
        if isinstance(value, str):
            value = value.strip()
        if key in ("client_company", "client_name", "client_phone", "client_email", "client_position",
                   "description", "notes", "title") and value is None:
            value = ""  # NOT NULL 문자열
        if key == "expected_amount" and value is None:
            value = 0
        setattr(lead, key, value)
    lead.updated_at = datetime.now()


@router.post("", dependencies=[WRITE])
def create_lead(body: LeadBody, request: Request, staff: CustomAuthUser = Depends(get_current_staff),
                db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    if not (data.get("title") or "").strip():
        raise HTTPException(status_code=400, detail="건명을 입력하세요.")
    lead = SalesLead(status="new", source="other", priority="medium", is_draft=False, client_company="", client_name="",
                     client_phone="", client_email="", client_position="", description="", notes="", expected_amount=0,
                     created_at=datetime.now())
    _apply(lead, data)
    db.add(lead)
    db.flush()
    _activity(db, lead.seq, "auto", "영업접수가 등록되었습니다.", staff.id, new="new")
    staff_auth.audit(db, request, "sales_create", user_id=staff.id, target=f"sales:{lead.seq}")
    db.commit()
    return {"seq": lead.seq}


@router.patch("/{seq}", dependencies=[WRITE])
def update_lead(seq: int, body: LeadBody, db: Session = Depends(get_db)):
    lead = _get(db, seq)
    _apply(lead, body.model_dump(exclude_unset=True))
    lead.is_draft = False  # 저장하면 확정(예전 자동저장으로 draft 가 된 리드 복구 포함)
    db.commit()
    return {"ok": True}


class StatusBody(BaseModel):
    status: str


@router.post("/{seq}/status", dependencies=[WRITE])
def change_status(seq: int, body: StatusBody, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    if body.status not in STATUS:
        raise HTTPException(status_code=400, detail="상태 값이 올바르지 않습니다.")
    lead = _get(db, seq)
    if body.status == lead.status:
        return {"ok": True}
    old = lead.status
    lead.status = body.status
    lead.updated_at = datetime.now()
    _activity(db, seq, "status_change", f'상태가 "{STATUS.get(old, old)}"에서 "{STATUS[body.status]}"(으)로 변경되었습니다.',
              staff.id, old, body.status)
    db.commit()
    return {"ok": True}


@router.post("/{seq}/activities", dependencies=[WRITE])
def add_activity(
    seq: int,
    activity_type: str = Form("note"),
    content: str = Form(...),
    attachments: list[UploadFile] = File(default=[]),
    staff: CustomAuthUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
):
    if activity_type not in USER_ACTIVITY:
        raise HTTPException(status_code=400, detail="활동 유형이 올바르지 않습니다.")
    if not content.strip():
        raise HTTPException(status_code=400, detail="내용을 입력하세요.")
    _get(db, seq)
    files = [save_upload(f, "sales_activity_files") for f in attachments if f.filename]
    a = _activity(db, seq, activity_type, content.strip(), staff.id)
    db.flush()
    for path, name in files:
        db.add(SalesLeadActivityAttachment(activity_id=a.seq, file=path, filename=name, uploaded_at=datetime.now()))
    db.commit()
    return {"seq": a.seq}


class ActivityUpdate(BaseModel):
    content: str


def _own_activity(db: Session, activity_id: int, staff: CustomAuthUser) -> SalesLeadActivity:
    a = db.query(SalesLeadActivity).filter(SalesLeadActivity.seq == activity_id).first()
    if a is None:
        raise HTTPException(status_code=404, detail="활동을 찾을 수 없습니다.")
    if a.activity_type not in USER_ACTIVITY:
        raise HTTPException(status_code=400, detail="자동 기록은 수정·삭제할 수 없습니다.")
    if a.created_by_id != staff.id and not staff_auth.is_admin(staff):
        raise HTTPException(status_code=403, detail="본인 기록만 수정·삭제할 수 있습니다.")
    return a


@router.patch("/activities/{activity_id}", dependencies=[WRITE])
def update_activity(activity_id: int, body: ActivityUpdate, staff: CustomAuthUser = Depends(get_current_staff),
                    db: Session = Depends(get_db)):
    a = _own_activity(db, activity_id, staff)
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="내용을 입력하세요.")
    a.content = body.content.strip()
    db.commit()
    return {"ok": True}


@router.post("/activities/{activity_id}/delete", dependencies=[WRITE])
def delete_activity(activity_id: int, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    a = _own_activity(db, activity_id, staff)
    db.query(SalesLeadActivityAttachment).filter(SalesLeadActivityAttachment.activity_id == activity_id).delete(synchronize_session=False)
    db.delete(a)
    db.commit()
    return {"ok": True}


@router.post("/{seq}/to-estimate", dependencies=[WRITE])
def to_estimate(seq: int, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """견적 전환 — 이미 연결된 견적이 있으면 새로 만들지 않는다(cms 반복 생성 버그 방지)."""
    lead = db.query(SalesLead).filter(SalesLead.seq == seq).with_for_update().first()
    if lead is None:
        raise HTTPException(status_code=404, detail="영업접수를 찾을 수 없습니다.")
    if lead.estimate_id and db.query(Estimate.seq).filter(Estimate.seq == lead.estimate_id).first():
        return {"estimate_id": lead.estimate_id, "created": False}
    now = datetime.now()
    number = next_estimate_number(db)
    e = Estimate(company_id=lead.company_id, estimate_title=lead.title, estimate_number=number, estimate_manager_id=staff.id,
                 estimate_content=lead.description, estimate_status="1", tax_rate=10.0, estimate_amount=0,
                 written_date=date.today(), estimate_date=now, created_at=now, updated_at=now)
    db.add(e)
    db.flush()
    old = lead.status
    lead.estimate_id = e.seq
    lead.status = "estimate"
    lead.updated_at = now
    _activity(db, seq, "auto", f"견적서 {number}가 생성되었습니다.", staff.id, "", "estimate")
    staff_auth.audit(db, request, "sales_to_estimate", user_id=staff.id, target=f"sales:{seq}", detail=f"estimate:{e.seq} from {old}")
    db.commit()
    return {"estimate_id": e.seq, "created": True}


class LinkBody(BaseModel):
    project_id: int


@router.post("/{seq}/projects", dependencies=[WRITE])
def link_project(seq: int, body: LinkBody, db: Session = Depends(get_db)):
    _get(db, seq)
    p = db.query(Project).filter(Project.seq == body.project_id).first()
    if p is None:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")
    if p.sales_lead_id and p.sales_lead_id != seq:
        raise HTTPException(status_code=400, detail="이미 다른 영업접수에 연결된 프로젝트입니다.")
    p.sales_lead_id = seq
    db.commit()
    return {"ok": True}


@router.post("/{seq}/projects/{project_id}/unlink", dependencies=[WRITE])
def unlink_project(seq: int, project_id: int, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.seq == project_id, Project.sales_lead_id == seq).first()
    if p is None:
        raise HTTPException(status_code=404, detail="연결된 프로젝트가 아닙니다.")
    p.sales_lead_id = None
    db.commit()
    return {"ok": True}


@router.post("/{seq}/delete", dependencies=[WRITE])
def delete_lead(seq: int, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """삭제 — 활동·첨부를 함께 지우고 프로젝트·미팅 연결은 해제한다(Django CASCADE/SET_NULL 과 같게)."""
    from sqlalchemy import text

    lead = _get(db, seq)
    ids = [a for (a,) in db.query(SalesLeadActivity.seq).filter(SalesLeadActivity.sales_lead_id == seq)]
    if ids:
        db.query(SalesLeadActivityAttachment).filter(SalesLeadActivityAttachment.activity_id.in_(ids)).delete(synchronize_session=False)
    db.query(SalesLeadActivity).filter(SalesLeadActivity.sales_lead_id == seq).delete(synchronize_session=False)
    db.execute(text("UPDATE project SET sales_lead_id = NULL WHERE sales_lead_id = :id"), {"id": seq})
    db.execute(text("UPDATE meeting_appointment SET sales_lead_id = NULL WHERE sales_lead_id = :id"), {"id": seq})
    staff_auth.audit(db, request, "sales_delete", user_id=staff.id, target=f"sales:{seq}", detail=lead.title[:200])
    db.delete(lead)
    db.commit()
    return {"ok": True}
