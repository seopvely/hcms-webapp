"""직원 대시보드 — 업무 카드(SPEC 05 §1). 재무 카드는 관리자 전용 /managed/billing/summary."""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_current_staff
from app.db.session import get_db
from app.models.company import Company
from app.models.customer import CustomAuthUser, Inditask, Inquiry, Managelist, MaintRenewal, Project
from app.models.worktools import MeetingAppointment, Todo

router = APIRouter(prefix="/dashboard", tags=["managed-dashboard"])


@router.get("")
def staff_dashboard(db: Session = Depends(get_db)):
    today = date.today()
    since = datetime.now() - timedelta(days=30)

    def count(query) -> int:
        return query.scalar() or 0

    # 상태 컬럼은 DB 에서 varchar — SQL 필터는 정수 리터럴로(MySQL 이 비교 시 변환)
    return {
        "projects_in_progress": count(
            db.query(func.count(Project.seq)).filter(
                Project.contract_date <= today, Project.contract_termination_date >= today
            )
        ),
        "projects_total": count(db.query(func.count(Project.seq))),
        "active_customers": count(
            db.query(func.count(func.distinct(Project.company_id))).filter(Project.company_id.isnot(None))
        ),
        "maintenance_in_progress": count(db.query(func.count(Managelist.seq)).filter(Managelist.status == 3)),
        "maintenance_new": count(db.query(func.count(Managelist.seq)).filter(Managelist.status.in_([1, 2]))),
        "inquiries_waiting": count(db.query(func.count(Inquiry.seq)).filter(Inquiry.status.in_([1, 2]))),
        "completed_30d": count(
            db.query(func.count(Inditask.seq)).filter(Inditask.task_status == 3, Inditask.created_at >= since)
        ) + count(
            db.query(func.count(Managelist.seq)).filter(Managelist.status == 4, Managelist.updated_at >= since)
        ),
        "maint_renewal_pending": count(
            db.query(func.count(MaintRenewal.seq)).filter(MaintRenewal.status == "pending")
        ),
    }


@router.get("/queues")
def work_queues(staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """대시보드 '처리할 일' 목록 — 새 유지보수 요청, 답변 대기 문의, 다가오는 미팅, 내 할일(각 최대 6건)."""
    today = date.today()
    companies = {c.seq: c.name for c in db.query(Company.seq, Company.name)}
    iso = lambda v: v.isoformat() if v else None  # noqa: E731

    new_requests = (db.query(Managelist).filter(Managelist.status.in_([1, 2]))
                    .order_by(Managelist.request_date.desc(), Managelist.seq.desc()).limit(6).all())
    inquiries = (db.query(Inquiry).filter(Inquiry.status.in_([1, 2]))
                 .order_by(Inquiry.created_at.desc()).limit(6).all())
    meetings = (db.query(MeetingAppointment).filter(MeetingAppointment.valid_status == "valid",
                                                    MeetingAppointment.meeting_date >= today,
                                                    MeetingAppointment.meeting_date <= today + timedelta(days=7))
                .order_by(MeetingAppointment.meeting_date, MeetingAppointment.meeting_time).limit(6).all())
    todos = (db.query(Todo).filter(Todo.assignee_id == staff.id, Todo.is_deleted == False, Todo.status != "done")  # noqa: E712
             .order_by(Todo.due_date.is_(None), Todo.due_date, Todo.seq.desc()).limit(6).all())
    return {
        "new_requests": [{"id": m.seq, "title": m.title, "company": companies.get(m.company_id), "date": iso(m.request_date or m.created_at),
                          "status": str(m.status or "")} for m in new_requests],
        "inquiries": [{"id": q.seq, "title": q.title, "company": companies.get(q.company_id), "date": iso(q.created_at),
                       "status": str(q.status or "")} for q in inquiries],
        "meetings": [{"id": m.seq, "title": m.title, "date": iso(m.meeting_date),
                      "time": m.meeting_time.strftime("%H:%M") if m.meeting_time else None, "type": m.meeting_type} for m in meetings],
        "todos": [{"id": t.seq, "title": t.title, "due": iso(t.due_date), "status": t.status, "priority": t.priority,
                   "overdue": bool(t.due_date and t.due_date < today)} for t in todos],
    }
