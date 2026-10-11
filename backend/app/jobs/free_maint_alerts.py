"""무상 유지보수 알림 (하루 1회 cron 실행).

  cd ~/hcms-customer-app/backend && venv/bin/python -m app.jobs.free_maint_alerts [--dry-run] [--date YYYY-MM-DD]

- started : 무상 기간 시작 (시작 후 7일 이내에 1회)            → 고객 푸시 + 담당자 메일
- d30     : 종료 30일 전 (D-30 ~ D-8 사이에 1회)                → 고객 푸시 + 담당자 메일
- d7      : 종료 7일 전 (D-7 ~ D-0 사이에 1회)                  → 고객 푸시 + 담당자 메일
- ended   : 무상 종료 (종료 후 7일 이내에 1회, 연장 계약 없을 때) → 고객 푸시 + 담당자 메일

임계값 이하이면서 발송 이력(free_maint_alert_log)이 없을 때 보내므로 cron 이 하루 빠져도 놓치지 않는다.
이력은 (project_id, kind, 무상 종료일) 단위라서 연장으로 무상 기간이 바뀌면 다시 발송된다.
"""
import argparse
import logging
import os
from datetime import date, datetime, timedelta

from sqlalchemy import or_

from app.core.firebase import init_firebase
from app.db.session import SessionLocal
import app.models  # noqa: F401 — relationship 매핑 로드
from app.models.customer import Project
from app.models.free_maint_alert_log import FreeMaintAlertLog
from app.models.manager import Manager
from app.models.push_token import PushToken
from app.services.email import notify_free_maint_alert
from app.services.push import send_push_notification
from app.utils.free_maint import as_date, is_contract_active

LOG_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "logs", "free_maint_alerts.log")
logger = logging.getLogger("free_maint_alerts")

NOTICE_WINDOW_DAYS = 7  # 시작/종료 알림을 놓쳤을 때 늦게라도 보내는 기간


def _customer_push(kind: str, project: Project, today: date) -> tuple[str, str, str]:
    """(title, body, route)"""
    name = project.title or "프로젝트"
    end = as_date(project.free_maint_end_date).isoformat()
    if kind == "started":
        return (
            "무상 유지보수 기간이 시작되었습니다",
            f"[{name}] {end}까지 포인트 차감 없이 유지보수를 요청하실 수 있습니다.",
            "/maintenance/new",
        )
    if kind in ("d30", "d7"):
        days_left = (as_date(project.free_maint_end_date) - today).days
        return (
            f"무상 유지보수 종료 D-{days_left}",
            f"[{name}] 무상 유지보수가 {end}에 종료됩니다. 유지보수 플랜으로 계속 관리받으세요.",
            "/dashboard",
        )
    return (
        "무상 유지보수 기간이 종료되었습니다",
        f"[{name}] 유지보수 플랜 신청 또는 계약 연장 후 계속 이용하실 수 있습니다.",
        "/services",
    )


def _due_kind(project: Project, today: date):
    """오늘 보내야 할 알림 종류 (없으면 None) — 이력 확인 전 후보"""
    start, end = as_date(project.free_maint_start_date), as_date(project.free_maint_end_date)
    if start <= today <= end:
        days_left = (end - today).days
        if days_left <= 7:
            return ["d7"]
        kinds = []
        if today <= start + timedelta(days=NOTICE_WINDOW_DAYS):
            kinds.append("started")
        # 무상 기간이 30일 이하로 짧으면 시작 알림과 겹치므로 D-30 생략
        if days_left <= 30 and (end - start).days > 30:
            kinds.append("d30")
        return kinds
    if end < today <= end + timedelta(days=NOTICE_WINDOW_DAYS) and not is_contract_active(project, today):
        return ["ended"]
    return []


def run(today: date, dry_run: bool = False) -> int:
    init_firebase()
    db = SessionLocal()
    sent = 0
    try:
        projects = (
            db.query(Project)
            .filter(
                Project.free_maint_start_date.isnot(None),
                Project.free_maint_end_date.isnot(None),
                Project.free_maint_start_date <= today,
                Project.free_maint_end_date >= today - timedelta(days=NOTICE_WINDOW_DAYS),
                or_(Project.project_status.is_(None), Project.project_status != "3"),
            )
            .all()
        )
        for project in projects:
            for kind in _due_kind(project, today):
                # '시작' 알림은 시작일 기준 1회 — 종료일이 바뀌어도(연장) 다시 보내지 않는다(G-18)
                target = project.free_maint_start_date if kind == "started" else project.free_maint_end_date
                exists = (
                    db.query(FreeMaintAlertLog.id)
                    .filter(
                        FreeMaintAlertLog.project_id == project.seq,
                        FreeMaintAlertLog.kind == kind,
                        # 예전 '시작' 로그는 종료일로 남아 있다 — 같은 기간(시작일 이후 키)이면 보낸 것으로 본다
                        FreeMaintAlertLog.target_date >= target if kind == "started" else FreeMaintAlertLog.target_date == target,
                    )
                    .first()
                )
                if exists:
                    continue

                title, body, route = _customer_push(kind, project, today)
                managers = (
                    db.query(Manager.seq)
                    .filter(Manager.company_id == project.company_id, Manager.login_permit_tf == "1")
                    .all()
                ) if project.company_id else []
                tokens = [
                    t.token for t in db.query(PushToken).filter(
                        PushToken.manager_seq.in_([m.seq for m in managers]), PushToken.is_active == True  # noqa: E712
                    ).all()
                ] if managers else []

                company_name = project.company.name if project.company else "-"
                logger.info(
                    f"{'[DRY] ' if dry_run else ''}{kind} project={project.seq} ({company_name} / {project.title}) "
                    f"free={project.free_maint_start_date}~{project.free_maint_end_date} tokens={len(tokens)} | {title} - {body}"
                )
                if dry_run:
                    continue

                push_sent = send_push_notification(title, body, tokens, {"type": f"free_maint_{kind}", "target_id": str(project.seq), "route": route}) if tokens else 0
                days_left = (as_date(project.free_maint_end_date) - today).days if kind in ("d30", "d7") else None
                try:
                    notify_free_maint_alert(
                        db, kind, project.seq, company_name, project.title or "",
                        project.free_maint_start_date, project.free_maint_end_date, days_left,
                    )
                except Exception as e:  # 메일 실패해도 이력은 남겨 푸시 중복을 막는다
                    logger.error(f"email failed project={project.seq} kind={kind}: {e}")

                db.add(FreeMaintAlertLog(
                    project_id=project.seq, kind=kind, target_date=target,
                    push_sent=push_sent, sent_at=datetime.now(),
                ))
                db.commit()
                sent += 1
    finally:
        db.close()
    logger.info(f"done today={today} sent={sent}{' (dry-run)' if dry_run else ''}")
    return sent


def main():
    parser = argparse.ArgumentParser(description="무상 유지보수 알림")
    parser.add_argument("--dry-run", action="store_true", help="발송/이력 저장 없이 대상만 출력")
    parser.add_argument("--date", help="기준일 (YYYY-MM-DD, 테스트용)")
    args = parser.parse_args()

    handlers = [logging.StreamHandler()]
    try:
        os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
        handlers.append(logging.FileHandler(LOG_PATH, encoding="utf-8"))
    except OSError:
        pass
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", handlers=handlers)

    today = datetime.strptime(args.date, "%Y-%m-%d").date() if args.date else date.today()
    run(today, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
