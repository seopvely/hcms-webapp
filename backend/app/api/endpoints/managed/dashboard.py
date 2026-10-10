"""직원 대시보드 — 업무 카드만(SPEC 05 §1). 수익·미수금 카드는 정의(D11)·권한(D12) 확정 후 추가."""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.customer import Inditask, Inquiry, Managelist, MaintRenewal, Project

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
