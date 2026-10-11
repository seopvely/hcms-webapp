"""유지보수 전환 (/api/managed/maint-renewal) — 계약 만료 → 의향 기록 → 유지보수구독 견적 → 계약/전환 (cms views_maint_renewal).

전환 건 생성(D-30 후보 등록·담당자 메일)은 cms cron 이 계속 한다(P6 에서 스케줄러 이관).
"""
from datetime import date, datetime
from html import escape

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.endpoints.managed.common import apply_sort, page_response, require_write, write_enabled
from app.core.deps import get_current_staff
from app.db.session import get_db
from app.models.company import Company
from app.models.customer import (
    CustomAuthUser,
    Domain,
    Estimate,
    EstimateContract,
    MaintRenewal,
    MaintSubscription,
    Project,
)
from app.models.manager import Manager
from app.services import staff_auth
from app.services import subscriptions as subs
from app.services.email import send_email_sync
from app.utils.free_maint import is_in_free_maint
from app.utils.maint_plans import HOSTING_LABELS, PLAN_DEFAULTS, PLAN_LABELS, plan_monthly_price, plans_payload

router = APIRouter(prefix="/maint-renewal", tags=["managed-maint-renewal"])
WRITE = require_write("maint_renewal")
MANAGER_FIELDS = [("manager_select_contract_seq_id", "계약"), ("manager_select_planning_seq_id", "기획"), ("manager_select_frontend_seq_id", "프론트"),
                  ("manager_select_backend_seq_id", "백엔드"), ("manager_select_design_seq_id", "디자인"), ("manager_select_maintenance_seq_id", "유지보수")]
TAB_LABELS = {"pending": "확인 필요", "progress": "진행중", "done": "완료", "closed": "종료/안 함", "all": "전체"}


def _iso(v):
    return v.isoformat() if v else None


def _agents(db: Session, project: Project | None) -> list[dict]:
    if not project:
        return []
    ids = [(getattr(project, f), label) for f, label in MANAGER_FIELDS if getattr(project, f)]
    users = {u.id: u for u in db.query(CustomAuthUser).filter(CustomAuthUser.id.in_([i for i, _ in ids] or [0]))}
    seen, out = set(), []
    for uid, label in ids:
        if uid in users and uid not in seen:
            seen.add(uid)
            out.append({"id": uid, "name": users[uid].name or users[uid].username, "role": label})
    return out


def _row(db: Session, r: MaintRenewal, project: Project | None, company: str, today: date) -> dict:
    return {"seq": r.seq, "project_id": r.project_id, "project": project.title if project else "", "company_id": r.company_id, "company": company,
            "due_date": _iso(r.due_date), "status": r.status, "status_label": subs.RENEWAL_STATUS.get(r.status, r.status),
            "is_open": r.status in subs.RENEWAL_OPEN, "chosen_plan": r.chosen_plan, "plan_label": PLAN_LABELS.get(r.chosen_plan or "", ""),
            "contract_months": r.contract_months, "hosting_type": r.hosting_type, "hosting_label": HOSTING_LABELS.get(r.hosting_type or "", ""),
            "hosting_provider": r.hosting_provider, "external_hosting_end_date": _iso(r.external_hosting_end_date), "estimate_id": r.estimate_id,
            "new_project_id": r.new_project_id, "notified_at": _iso(r.notified_at), "contacted_at": _iso(r.contacted_at),
            "responded_at": _iso(r.responded_at), "memo": r.memo, "agents": _agents(db, project),
            "free_maint_left": subs.free_maint_remaining(project, today) if project else False,
            "contract_termination_date": _iso(project.contract_termination_date) if project else None,
            "free_maint_end_date": _iso(project.free_maint_end_date) if project else None}


@router.get("")
def list_renewals(tab: str = "pending", q: str | None = None, page: int = Query(1, ge=1), per_page: int = Query(20, le=100),
                  sort: str | None = Query(None, description="due_date|status|created_at, '-' 접두 = 내림차순"),
                  db: Session = Depends(get_db)):
    if tab not in subs.RENEWAL_TABS:
        tab = "pending"
    base = db.query(MaintRenewal)
    if q:
        base = base.filter(or_(MaintRenewal.company_id.in_(db.query(Company.seq).filter(Company.name.like(f"%{q}%"))),
                               MaintRenewal.project_id.in_(db.query(Project.seq).filter(Project.title.like(f"%{q}%")))))
    counts = {k: (base if v is None else base.filter(MaintRenewal.status.in_(v))).count() for k, v in subs.RENEWAL_TABS.items()}
    statuses = subs.RENEWAL_TABS[tab]
    query = base if statuses is None else base.filter(MaintRenewal.status.in_(statuses))
    order = (MaintRenewal.due_date, MaintRenewal.seq) if tab in ("pending", "progress") else (MaintRenewal.due_date.desc(), MaintRenewal.seq.desc())
    total = query.count()
    query = apply_sort(query, sort, {"due_date": MaintRenewal.due_date, "status": MaintRenewal.status, "created_at": MaintRenewal.created_at},
                       list(order))
    rows = query.offset((page - 1) * per_page).limit(per_page).all()
    projects = {p.seq: p for p in db.query(Project).filter(Project.seq.in_({r.project_id for r in rows} or {0}))}
    companies = dict(db.query(Company.seq, Company.name).filter(Company.seq.in_({r.company_id for r in rows} - {None} or {0})))
    today = date.today()
    out = page_response([_row(db, r, projects.get(r.project_id), companies.get(r.company_id, ""), today) for r in rows], total, page, per_page)
    out.update(tab=tab, tabs=[{"key": k, "label": TAB_LABELS[k], "count": counts[k]} for k in subs.RENEWAL_TABS], write_enabled=write_enabled("maint_renewal"))
    return out


def _recipients(db: Session, company_id: int | None) -> list[Manager]:
    if not company_id:
        return []
    return [m for m in db.query(Manager).filter(Manager.company_id == company_id, Manager.login_permit_tf == "1").order_by(Manager.seq) if m.email]


def _get(db: Session, seq: int, lock: bool = False) -> MaintRenewal:
    q = db.query(MaintRenewal).filter(MaintRenewal.seq == seq)
    r = (q.with_for_update() if lock else q).first()
    if not r:
        raise HTTPException(404, "전환 건을 찾을 수 없습니다.")
    return r


@router.get("/{seq}")
def get_renewal(seq: int, db: Session = Depends(get_db)):
    r = _get(db, seq)
    project = db.query(Project).filter(Project.seq == r.project_id).first()
    company = db.query(Company).filter(Company.seq == r.company_id).first() if r.company_id else None
    today = date.today()
    out = _row(db, r, project, company.name if company else "", today)
    out["in_free_maint"] = is_in_free_maint(project, today) if project else False
    out["plans"] = plans_payload()
    out["recipients"] = [{"name": m.name, "email": m.email} for m in _recipients(db, r.company_id)]
    domain = db.query(Domain).filter(Domain.seq == r.domain_id).first() if r.domain_id else None
    out["domain_label"] = subs.domain_label(domain)
    e = db.query(Estimate).filter(Estimate.seq == r.estimate_id).first() if r.estimate_id else None
    contracts = db.query(EstimateContract).filter(EstimateContract.estimate_id == e.seq).order_by(EstimateContract.seq.desc()).all() if e else []
    out["estimate"] = {"seq": e.seq, "number": e.estimate_number, "status": str(e.estimate_status or ""), "title": e.estimate_title} if e else None
    out["contracts"] = [{"seq": c.seq, "number": c.contract_number, "status": str(c.status or "")} for c in contracts]
    out["estimate_editable"] = bool(e and str(e.estimate_status) == "1" and not contracts)
    new_project = db.query(Project).filter(Project.seq == r.new_project_id).first() if r.new_project_id else None
    out["new_project"] = {"seq": new_project.seq, "title": new_project.title} if new_project else None
    out["subscriptions"] = [{"seq": s.seq, "plan_type": s.plan_type, "status": s.status}
                            for s in db.query(MaintSubscription).filter(MaintSubscription.renewal_id == seq)]
    out["write_enabled"] = write_enabled("maint_renewal")
    return out


class RespondBody(BaseModel):
    decision: str
    chosen_plan: str | None = None
    contract_months: int | None = None
    hosting_type: str | None = None
    hosting_provider: str | None = None
    external_hosting_end_date: date | None = None
    memo: str = ""


@router.post("/{seq}/respond", dependencies=[WRITE])
def respond(seq: int, body: RespondBody, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """의향 기록(cms maint_renewal_respond)."""
    r = _get(db, seq, lock=True)
    if r.status not in subs.RENEWAL_OPEN:
        raise HTTPException(400, f"이미 처리된 건입니다 ({subs.RENEWAL_STATUS.get(r.status, r.status)}).")
    if body.decision not in ("accepted", "declined"):
        raise HTTPException(400, "의향(유지보수 희망/안 함)을 선택하세요.")
    if body.chosen_plan and body.chosen_plan not in PLAN_DEFAULTS:
        raise HTTPException(400, "알 수 없는 요금제입니다.")
    if body.decision == "accepted" and not body.chosen_plan:
        raise HTTPException(400, "유지보수 희망이면 요금제를 선택하세요.")
    months = subs.parse_months(body.contract_months) or r.contract_months or 12
    hosting = body.hosting_type if body.hosting_type in ("I", "E") else None
    if body.chosen_plan:
        r.chosen_plan = body.chosen_plan
    r.contract_months = months
    if hosting:
        r.hosting_type = hosting
    if hosting == "E":
        r.hosting_provider = (body.hosting_provider or "").strip() or None
        r.external_hosting_end_date = body.external_hosting_end_date
    elif hosting == "I":
        r.hosting_provider = r.external_hosting_end_date = None
    if body.decision == "declined":
        r.status = "declined"
    elif not (r.estimate_id and r.status == "estimated"):
        r.status = "accepted"
    r.responded_at = r.updated_at = datetime.now()
    r.handled_by_id = staff.id
    label = "유지보수 희망" if body.decision == "accepted" else "유지보수 안 함"
    detail = f" ({body.chosen_plan.upper()} {months}개월, {'외부' if hosting == 'E' else '한결랩'} 호스팅)" if body.decision == "accepted" else ""
    memo = body.memo.strip()
    subs.append_memo(r, f"의향 기록: {label}{detail}{' — ' + memo if memo else ''}")
    staff_auth.audit(db, request, "maint_renewal.respond", user_id=staff.id, target=f"maint_renewal:{seq}", detail=body.decision)
    db.commit()
    return {"status": r.status}


class EstimateBody(BaseModel):
    chosen_plan: str | None = None
    contract_months: int | None = None
    hosting_type: str | None = None
    hosting_provider: str | None = None
    hosting_start_date: date | None = None
    hosting_end_date: date | None = None
    regenerate: bool = False


@router.post("/{seq}/create-estimate", dependencies=[WRITE, require_write("estimates")])
def create_estimate(seq: int, body: EstimateBody, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """유지보수구독(유형 15) 견적 자동 생성. 다시 생성은 작성중·계약서 없음일 때만(기존 견적 삭제)."""
    from app.models.customer import EstimateItem, EstimateStatusHistory
    r = _get(db, seq, lock=True)
    if r.status not in subs.RENEWAL_OPEN:
        raise HTTPException(400, f"이미 처리된 건입니다 ({subs.RENEWAL_STATUS.get(r.status, r.status)}).")
    plan = body.chosen_plan or r.chosen_plan
    if not plan or plan not in PLAN_DEFAULTS:
        raise HTTPException(400, "먼저 의향 기록에서 요금제를 선택하세요.")
    months = subs.parse_months(body.contract_months) or r.contract_months or 12
    hosting = "E" if (body.hosting_type or r.hosting_type) == "E" else "I"
    provider = (body.hosting_provider or "").strip() or r.hosting_provider
    old = db.query(Estimate).filter(Estimate.seq == r.estimate_id).first() if r.estimate_id else None
    if old:
        label = old.estimate_number or f"#{old.seq}"
        if not body.regenerate:
            raise HTTPException(400, f"이미 생성된 견적서({label})가 있습니다. 다시 만들려면 '견적 다시 생성'을 사용하세요.")
        if str(old.estimate_status) != "1" or db.query(EstimateContract.seq).filter(EstimateContract.estimate_id == old.seq).first():
            raise HTTPException(400, f"견적서({label})가 작성중 상태가 아니거나 계약서가 있어 다시 생성할 수 없습니다. 견적서를 직접 수정하세요.")
        r.estimate_id = None
        db.flush()
        db.query(EstimateItem).filter(EstimateItem.estimate_id == old.seq).delete(synchronize_session=False)
        db.query(EstimateStatusHistory).filter(EstimateStatusHistory.estimate_id == old.seq).delete(synchronize_session=False)
        db.delete(old)
        db.flush()
        subs.append_memo(r, f"견적 재생성 (기존 {label} 삭제)")
    try:
        e = subs.create_renewal_estimate(db, r, plan, months, hosting, provider, body.hosting_start_date, body.hosting_end_date, staff)
    except ValueError as err:
        raise HTTPException(400, f"견적 생성 실패: {err}")
    staff_auth.audit(db, request, "maint_renewal.create_estimate", user_id=staff.id, target=f"maint_renewal:{seq}", detail=e.estimate_number)
    db.commit()
    return {"estimate_id": e.seq, "estimate_number": e.estimate_number}


def _notice(db: Session, r: MaintRenewal, project: Project, company: Company | None) -> tuple[str, str]:
    """고객 안내 메일(cms build_customer_notice 와 같은 내용)."""
    name = company.name if company else ""
    fmt = lambda d: subs.to_date(d).strftime("%Y-%m-%d") if d else "-"  # noqa: E731
    due = fmt(r.due_date)
    if r.hosting_type == "E":
        hosting_line = (f"현재 외부 호스팅({r.hosting_provider or '업체 미기재'})을 이용 중이시면 유지보수 요금만 청구되며, "
                        f"호스팅 비용은 호스팅 업체에 직접 결제하시면 됩니다.")
    else:
        hosting_line = "한결랩 호스팅 이용 시 호스팅과 유지보수가 함께 제공되며, 외부 호스팅을 이용하시면 유지보수 요금만 청구됩니다."
    rows = ""
    for code, p in plans_payload().items():
        svc = ", ".join(escape(s) for s in p["services_internal"])
        rows += (f"<tr><td style='padding:8px;border:1px solid #dee2e6;font-weight:bold'>{escape(p['label'])}</td>"
                 f"<td style='padding:8px;border:1px solid #dee2e6;text-align:right'>{plan_monthly_price(code, 'I'):,}원"
                 f"<div style='font-size:11px;color:#666'>호스팅 {p['hosting_price']:,} + 유지보수 {p['maint_price']:,}</div></td>"
                 f"<td style='padding:8px;border:1px solid #dee2e6;text-align:right'>{plan_monthly_price(code, 'E'):,}원"
                 f"<div style='font-size:11px;color:#666'>유지보수만</div></td>"
                 f"<td style='padding:8px;border:1px solid #dee2e6;text-align:center'>{p['points']}P</td>"
                 f"<td style='padding:8px;border:1px solid #dee2e6;font-size:12px'>{svc}</td></tr>")
    subject = f"[한결랩] {name} 계약 만료 예정 및 유지보수 안내 ({due})"
    html = f"""<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:'Malgun Gothic','맑은 고딕',sans-serif;line-height:1.6;color:#333"><div style="max-width:680px;margin:0 auto;padding:20px">
<div style="background:#343a40;color:#fff;padding:18px;border-radius:8px 8px 0 0"><h2 style="margin:0">계약 만료 예정 및 유지보수 안내</h2></div>
<div style="background:#f8f9fa;padding:20px;border:1px solid #dee2e6">
<p>{escape(name)} 담당자님, 안녕하세요. 한결랩입니다.</p>
<p>이용 중이신 프로젝트 <strong>{escape(project.title or '')}</strong>의 계약이 곧 만료됩니다.</p>
<table style="width:100%;border-collapse:collapse;margin:12px 0">
<tr><th style="background:#e9ecef;padding:8px;text-align:left;width:35%">계약종료일</th><td style="background:#fff;padding:8px">{fmt(project.contract_termination_date)}</td></tr>
<tr><th style="background:#e9ecef;padding:8px;text-align:left">무상 유지보수 종료일</th><td style="background:#fff;padding:8px">{fmt(project.free_maint_end_date)}</td></tr>
<tr><th style="background:#e9ecef;padding:8px;text-align:left">유지보수 전환 기준일</th><td style="background:#fff;padding:8px;color:#dc3545;font-weight:bold">{due}</td></tr></table>
<p>계약 만료 후에도 안정적인 운영을 위해 유지보수구독 요금제를 안내드립니다. <span style="font-size:12px;color:#666">(월 요금, VAT 별도)</span></p>
<table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff"><tr style="background:#e9ecef">
<th style="padding:8px;border:1px solid #dee2e6">요금제</th><th style="padding:8px;border:1px solid #dee2e6">한결랩 호스팅</th>
<th style="padding:8px;border:1px solid #dee2e6">외부 호스팅</th><th style="padding:8px;border:1px solid #dee2e6">월 포인트</th>
<th style="padding:8px;border:1px solid #dee2e6">제공 서비스</th></tr>{rows}</table>
<p style="margin-top:14px;background:#fff3cd;border:1px solid #ffc107;padding:10px;border-radius:5px">{escape(hosting_line)}</p>
<p>유지보수를 계속 원하시면 이 메일에 회신하시거나 고객센터(HCMS) 문의로 알려주세요.</p></div>
<div style="text-align:center;padding:12px;color:#666;font-size:12px">한결랩 · support@hankyeul.com</div></div></body></html>"""
    return subject, html


@router.post("/{seq}/notify-customer", dependencies=[WRITE])
def notify_customer(seq: int, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    r = _get(db, seq)
    if r.status not in subs.RENEWAL_OPEN:
        raise HTTPException(400, f"이미 처리된 건입니다 ({subs.RENEWAL_STATUS.get(r.status, r.status)}).")
    recipients = _recipients(db, r.company_id)
    if not recipients:
        raise HTTPException(400, "안내 메일을 받을 고객 담당자(로그인 허용 + 이메일 등록)가 없습니다.")
    project = db.query(Project).filter(Project.seq == r.project_id).first()
    company = db.query(Company).filter(Company.seq == r.company_id).first()
    subject, html = _notice(db, r, project, company)
    sent = []
    for m in recipients:
        try:
            send_email_sync([m.email], subject, html)
            sent.append(m.email)
        except Exception:  # noqa: BLE001 — 수신자별로 계속
            pass
    if not sent:
        raise HTTPException(502, "고객 안내 메일 발송에 실패했습니다.")
    r = _get(db, seq, lock=True)
    r.contacted_at = r.updated_at = datetime.now()
    if r.status == "pending":
        r.status = "contacted"
    if not r.handled_by_id:
        r.handled_by_id = staff.id
    subs.append_memo(r, f"고객 안내 메일 발송: {', '.join(sent)}")
    staff_auth.audit(db, request, "maint_renewal.notify_customer", user_id=staff.id, target=f"maint_renewal:{seq}", detail=", ".join(sent))
    db.commit()
    return {"sent": len(sent)}


class EndBody(BaseModel):
    seqs: list[int]
    memo: str = ""
    confirm_free_maint: bool = False


@router.post("/end-project", dependencies=[WRITE])
def end_project(body: EndBody, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """유지보수 안 함 → 원 프로젝트 종료(단건·일괄). 무상 기간이 남은 건은 confirm_free_maint 없이는 409."""
    rows = db.query(MaintRenewal).filter(MaintRenewal.seq.in_(body.seqs or [0])).order_by(MaintRenewal.due_date, MaintRenewal.seq).with_for_update().all()
    if not rows:
        raise HTTPException(404, "대상 건을 찾을 수 없습니다.")
    targets = [r for r in rows if r.status in subs.RENEWAL_OPEN]
    skipped = [r.seq for r in rows if r.status not in subs.RENEWAL_OPEN]
    if not targets:
        raise HTTPException(400, "선택한 건은 모두 이미 처리되었습니다 (전환/종료/연장).")
    projects = {p.seq: p for p in db.query(Project).filter(Project.seq.in_([r.project_id for r in targets]))}
    today = date.today()
    warn = [r for r in targets if subs.free_maint_remaining(projects[r.project_id], today)]
    if warn and not body.confirm_free_maint:
        names = ", ".join(f"{projects[r.project_id].title or ''}(~{subs.to_date(projects[r.project_id].free_maint_end_date) or '-'})" for r in warn)
        raise HTTPException(409, f"무상 유지보수 기간이 남아 있는 건이 있습니다: {names}. 확인 후 '무상 기간이 남아도 종료'를 체크하고 다시 진행하세요.")
    for r in targets:
        subs.end_project_from_renewal(db, r, staff, body.memo)
    staff_auth.audit(db, request, "maint_renewal.end_project", user_id=staff.id, detail=",".join(str(r.seq) for r in targets))
    db.commit()
    return {"ended": [r.seq for r in targets], "skipped": skipped}


