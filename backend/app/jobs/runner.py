"""hcms 스케줄러 — cron 한 줄(*/5)로 켜진 job 만 돈다(SPEC 07 §6.3, 11 §5).

  cd ~/hcms-customer-app/backend && venv/bin/python -m app.jobs.runner tick          # 5분마다
  venv/bin/python -m app.jobs.runner run <job> [--dry-run] [--force]               # 수동 실행/점검
  venv/bin/python -m app.jobs.runner list                                          # 상태

- 켜는 job 은 .env ENABLED_JOBS 에 쉼표로(기본 없음). cms cron 의 해당 줄을 주석 처리하는 날 같은 시각에 켠다.
- 매일 job 은 지정 시각 이후 첫 tick 에서 하루 한 번(job_run 에 오늘 ok 기록이 있으면 건너뜀). 07:00 재부팅 창(06:50~07:10)은 피한다.
- 같은 job 이 겹쳐 돌지 않게 MySQL GET_LOCK 을 잡고, 발송은 job_claim 선점 후에만 한다.
"""
import argparse
import logging
import os
import sys
import traceback
from datetime import datetime, time

from sqlalchemy import text

import app.models  # noqa: F401
from app.core.config import settings
from app.db.session import SessionLocal, engine
from app.jobs.core import JobContext
from app.jobs.tasks import charge_jobs as cj
from app.jobs.tasks import notify_jobs as nj
from app.jobs.tasks import other_jobs as oj
from app.models.jobs import JobRun

# 이름: (함수, 일정) — 일정은 ("every",) 또는 ("daily", "HH:MM")
JOBS = {
    "alarms": (nj.run_alarms, ("every",)),
    "payment_alarms": (nj.run_payment_alarms, ("every",)),
    "meetings": (nj.run_meetings, ("every",)),
    "todo_digest": (nj.run_todo_digest, ("daily", "09:00")),
    "tax_sales_sync": (oj.run_tax_sales_sync, ("daily", "02:00")),
    "charge_maint_subscriptions": (cj.run_charge_maint_subscriptions, ("daily", "00:05")),
    "charge_dev_subscriptions": (cj.run_charge_dev_subscriptions, ("daily", "00:10")),
    "charge_maint_projects": (cj.run_charge_maint_projects, ("daily", "00:15")),
    "purchase_budget_check": (oj.run_purchase_budget_check, ("daily", "09:00")),
    "estimate_expiry": (oj.run_estimate_expiry, ("daily", "09:00")),
    "contract_expiry": (oj.run_contract_expiry, ("daily", "09:00")),
    "maint_renewal_scan": (oj.run_maint_renewal_scan, ("daily", "09:00")),
    "domain_expiry": (oj.run_domain_expiry, ("daily", "09:00")),
    "free_maint_alerts": (oj.run_free_maint_alerts, ("daily", "09:00")),
    "fde_notice_check": (oj.run_fde_notice_check, ("daily", "09:05")),
    "session_cleanup": (oj.run_session_cleanup, ("daily", "03:00")),
}
LOG_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "logs", "jobs.log")
logger = logging.getLogger("hcms.jobs")


def _due(db, name: str, schedule: tuple, now: datetime) -> bool:
    if schedule[0] == "every":
        return True
    at = time.fromisoformat(schedule[1])
    if now.time() < at:
        return False
    start = datetime.combine(now.date(), time.min)
    return not db.query(JobRun.id).filter(JobRun.job == name, JobRun.status == "ok", JobRun.dry_run == False, JobRun.started_at >= start).first()  # noqa: E712


class Result:
    def __init__(self, status: str, summary: str = "", error: str = ""):
        self.status, self.summary, self.error = status, summary, error


def run_job(name: str, dry_run: bool = False, now: datetime | None = None) -> Result:
    func, _ = JOBS[name]
    db = SessionLocal()
    lock = f"hcms_job_{name}"
    # 잠금은 전용 연결에 — job 세션은 중간 커밋 때 연결을 풀에 돌려줘서 다른 연결에서 RELEASE 하게 된다
    lock_conn = engine.connect()
    try:
        if not lock_conn.execute(text("SELECT GET_LOCK(:n, 0)"), {"n": lock}).scalar():
            logger.info(f"[{name}] 다른 실행이 잡고 있어 건너뜀")
            return Result("skipped")
        log_db = SessionLocal()
        rec = JobRun(job=name, started_at=datetime.now(), status="running", dry_run=dry_run)
        log_db.add(rec)
        log_db.commit()
        ctx = JobContext(db=db, now=now or datetime.now(), dry_run=dry_run)
        status, error = "ok", ""
        try:
            func(ctx)
            db.rollback() if dry_run else db.commit()
        except Exception:  # noqa: BLE001
            db.rollback()
            status, error = "failed", traceback.format_exc()[-4000:]
            logger.error(f"[{name}] 실패\n{error}")
        summary = "\n".join(ctx.lines)[-4000:]
        rec.status, rec.error, rec.summary, rec.finished_at = status, error or None, summary, datetime.now()
        log_db.commit()
        log_db.close()
        return Result(status, summary, error)
    finally:
        try:
            lock_conn.execute(text("SELECT RELEASE_LOCK(:n)"), {"n": lock})
        except Exception:  # noqa: BLE001
            pass
        lock_conn.close()
        db.close()


def tick(now: datetime | None = None) -> None:
    now = now or datetime.now()
    enabled = settings.enabled_jobs
    unknown = enabled - set(JOBS)
    if unknown:
        logger.warning(f"알 수 없는 job: {', '.join(sorted(unknown))}")
    db = SessionLocal()
    try:
        due = [n for n in JOBS if n in enabled and _due(db, n, JOBS[n][1], now)]
    finally:
        db.close()
    for n in due:
        r = run_job(n, now=now)
        logger.info(f"[{n}] {r.status} {(r.summary or '').splitlines()[-1:] }")


def main(argv=None) -> None:
    p = argparse.ArgumentParser(description="hcms 스케줄러")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("tick")
    r = sub.add_parser("run")
    r.add_argument("job", choices=sorted(JOBS))
    r.add_argument("--dry-run", action="store_true")
    r.add_argument("--force", action="store_true", help="ENABLED_JOBS 에 없어도 실행(실발송 주의)")
    sub.add_parser("list")
    args = p.parse_args(argv)
    handlers = [logging.StreamHandler(sys.stdout)]
    try:
        os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
        handlers.append(logging.FileHandler(LOG_PATH, encoding="utf-8"))
    except OSError:
        pass
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", handlers=handlers)
    if args.cmd == "tick":
        tick()
    elif args.cmd == "run":
        if not args.dry_run and not args.force and args.job not in settings.enabled_jobs:
            sys.exit(f"{args.job} 는 ENABLED_JOBS 에 없습니다. --dry-run 으로 점검하거나 --force 로 실행하세요.")
        rec = run_job(args.job, dry_run=args.dry_run)
        print(f"{args.job}: {rec.status}\n{rec.summary or ''}\n{rec.error or ''}")
    else:
        db = SessionLocal()
        for n, (_, sched) in JOBS.items():
            last = db.query(JobRun).filter(JobRun.job == n).order_by(JobRun.id.desc()).first()
            print(f"{n:28} {'ON ' if n in settings.enabled_jobs else 'off'} {' '.join(sched):14} "
                  f"{(last.started_at.strftime('%m-%d %H:%M') + ' ' + last.status + (' (dry)' if last.dry_run else '')) if last else '-'}")
        db.close()


if __name__ == "__main__":
    main()
