"""배치 상태 (/api/managed/jobs) — 스케줄러 job 목록·켜짐 여부·최근 실행(관리자). 실행·전환은 서버에서(docs/managed-cutover.md)."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import require_staff_admin
from app.db.session import get_db
from app.models.jobs import JobRun

router = APIRouter(prefix="/jobs", tags=["managed-jobs"], dependencies=[Depends(require_staff_admin)])


@router.get("")
def list_jobs(db: Session = Depends(get_db)):
    from app.jobs.runner import JOBS
    out = []
    for name, (_, sched) in JOBS.items():
        runs = db.query(JobRun).filter(JobRun.job == name).order_by(JobRun.id.desc()).limit(5).all()
        out.append({"job": name, "enabled": name in settings.enabled_jobs, "schedule": " ".join(sched),
                    "runs": [{"started_at": r.started_at.isoformat(), "status": r.status, "dry_run": bool(r.dry_run),
                              "summary": (r.summary or "")[-500:], "error": (r.error or "")[-500:]} for r in runs]})
    return {"items": out, "write_areas": sorted(settings.managed_write_areas), "staff_base_url": settings.STAFF_BASE_URL}
