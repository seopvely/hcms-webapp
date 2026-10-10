"""포인트 장부(/api/managed/points) — 장부 조회, 프로젝트별 잔여, 수동 조정."""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api.endpoints.maintenance import calculate_remaining_points
from app.api.endpoints.managed.common import (
    POINT_STATUS_LABELS,
    POINT_TYPE_LABELS,
    code,
    page_response,
    require_write,
    verify_step_up,
)
from app.core.deps import get_current_staff
from app.db.session import get_db
from app.models.customer import CustomAuthUser, PointHistory, Project
from app.services import staff_auth
from app.utils.point_cycle import get_point_cycle

router = APIRouter(prefix="/points", tags=["managed-points"])


@router.get("")
def ledger(
    company_id: int | None = None,
    project_id: int | None = None,
    point_type: str | None = Query(None, description="1 충전 / 2 사용 / 3 책정"),
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(PointHistory).options(joinedload(PointHistory.project), joinedload(PointHistory.company))
    if company_id:
        query = query.filter(PointHistory.company_id == company_id)
    if project_id:
        query = query.filter(PointHistory.project_id == project_id)
    if point_type:
        query = query.filter(PointHistory.point_type == point_type)
    if date_from:
        query = query.filter(PointHistory.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.filter(PointHistory.created_at < datetime.combine(date_to + timedelta(days=1), datetime.min.time()))
    total = query.count()
    rows = query.order_by(PointHistory.created_at.desc(), PointHistory.seq.desc()).offset((page - 1) * per_page).limit(per_page).all()
    writer_ids = {r.writer_id for r in rows if r.writer_id}
    names = {u.id: (u.name or u.username) for u in db.query(CustomAuthUser).filter(CustomAuthUser.id.in_(writer_ids))} if writer_ids else {}
    items = [{
        "seq": r.seq,
        "company_name": r.company.name if r.company else None,
        "project_id": r.project_id,
        "project_title": r.project.title if r.project else None,
        "managelist_id": r.managelist_id,
        "point": r.point or 0,
        "point_type": code(r.point_type),
        "point_type_label": POINT_TYPE_LABELS.get(code(r.point_type) or "", "-"),
        "status_label": POINT_STATUS_LABELS.get(code(r.status) or "", "-"),
        "category": "개발" if code(r.point_category) == "2" else "유지보수",
        "content": r.content,
        "edit_reason": r.edit_reason,
        "writer_name": names.get(r.writer_id) if r.writer_id else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    } for r in rows]
    return page_response(items, total, page, per_page)


@router.get("/projects")
def project_balances(db: Session = Depends(get_db)):
    """진행중(계약기간 내) 포인트 프로젝트의 현재 주기 잔여 — 고객 화면과 같은 계산(utils/point_cycle)."""
    today = date.today()
    projects = (
        db.query(Project)
        .options(joinedload(Project.company))
        .filter(Project.point > 0, Project.contract_date <= today, Project.contract_termination_date >= today)
        .order_by(Project.contract_termination_date)
        .all()
    )
    items = []
    for p in projects:
        cycle = get_point_cycle(p)
        remaining = calculate_remaining_points(p, db, p.company_id) if p.company_id else 0
        items.append({
            "project_id": p.seq,
            "project_title": p.title,
            "company_id": p.company_id,
            "company_name": p.company.name if p.company else None,
            "monthly_point": p.point,
            "cycle_start": cycle["start"].isoformat() if cycle else None,
            "cycle_end": cycle["end"].isoformat() if cycle else None,
            "cycle_total": cycle["total_points"] if cycle else 0,
            "remaining": remaining,
        })
    return {"items": items}


class PointAdjust(BaseModel):
    project_id: int
    point_type: str  # '1' 충전(+) / '2' 사용(−)
    points: int
    reason: str
    password: str


@router.post("/adjust", dependencies=[require_write("points")])
def adjust(body: PointAdjust, request: Request,
           staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """수동 충전/차감. 사유 필수, 실행(status 2) 행으로 바로 기록. 정정은 반대 부호 행으로 한다."""
    verify_step_up(staff, body.password)
    if body.point_type not in ("1", "2") or body.points <= 0:
        raise HTTPException(status_code=400, detail="유형과 포인트(1 이상)를 확인하세요.")
    if not body.reason.strip():
        raise HTTPException(status_code=400, detail="사유를 입력하세요.")
    project = db.query(Project).filter(Project.seq == body.project_id).first()
    if project is None:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")
    now = datetime.now()
    sign = 1 if body.point_type == "1" else -1
    row = PointHistory(
        company_id=project.company_id,
        project_id=project.seq,
        point=sign * body.points,
        point_type=body.point_type,
        status="2",
        point_category="1",
        content=f"[수동 {'충전' if sign > 0 else '차감'}] {body.reason.strip()}",
        edit_reason=body.reason.strip(),
        contract_date=project.contract_date,
        contract_termination_date=project.contract_termination_date,
        writer_id=staff.id,
        edited_by_id=staff.id,
        created_at=now,
        updated_at=now,
        edited_at=now,
    )
    db.add(row)
    db.flush()
    staff_auth.audit(db, request, "point_adjust", user_id=staff.id, target=f"project:{project.seq}",
                     detail=f"{sign * body.points} point_history:{row.seq}")
    db.commit()
    return {"seq": row.seq}
