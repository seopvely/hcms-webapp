# backend/app/jobs/tasks/f2b_jobs.py
"""web1 Fail2Ban 전날 차단 AI 평가(매일 08:30 이후 첫 tick) — 결과는 web1 daily_report.sh 가 09:00 에 가져간다.

실패하면 예외로 job_run 을 failed 로 남겨 다음 tick 에 다시 돈다. MAX_ATTEMPTS 번 실패하면 그날은 포기한다.
"""
import json
from datetime import datetime, time, timedelta

from app.models.f2b import F2bAiReview
from app.services import claude_cli
from app.services.f2b_query import F2bFilters
from app.services.f2b_review import EMPTY_TEXT, build_context, render_prompt

MAX_ATTEMPTS = 3
TIMEOUT = 300


def run_f2b_daily_review(ctx) -> None:
    day = (ctx.now - timedelta(days=1)).date()
    start = datetime.combine(day, time.min)
    row = (ctx.db.query(F2bAiReview).filter(F2bAiReview.kind == "daily", F2bAiReview.period_from == start)
           .order_by(F2bAiReview.id.desc()).first())
    if row is not None and row.status == "ok":
        ctx.log(f"{day} 이미 평가됨")
        return
    if row is not None and (row.attempts or 0) >= MAX_ATTEMPTS:
        ctx.log(f"{day} {MAX_ATTEMPTS}회 실패 — 오늘은 포기")
        return

    f = F2bFilters(day, day)
    context = build_context(ctx.db, f, "daily")
    if ctx.dry_run:
        ctx.log(f"dry-run {day} total={context['total']}")
        return
    if row is None:
        row = F2bAiReview(kind="daily", period_from=start, period_to=datetime.combine(day, time(23, 59, 59)),
                          filters_json=json.dumps(f.canonical(), ensure_ascii=False), filters_hash=f.hash(),
                          model="sonnet", status="error", attempts=0)
        ctx.db.add(row)
    row.attempts = (row.attempts or 0) + 1
    row.created_at = datetime.now()

    if not context["total"]:
        row.status, row.result_md, row.error = "ok", EMPTY_TEXT, None
        ctx.db.commit()
        ctx.log(f"{day} 차단 0건 — 평가 생략")
        return

    r = claude_cli.run_claude(render_prompt(context, "daily"), model="sonnet", timeout=TIMEOUT)
    if r["ok"]:
        row.status, row.result_md, row.error = "ok", r["result"], None
    else:
        row.status = "error"
        row.error = "claude 로그인 만료(인증 실패)" if r["auth_error"] else (r["error"] or "AI 실행 실패")[:1000]
    ctx.db.commit()
    if not r["ok"]:
        raise RuntimeError(f"f2b daily review 실패({row.attempts}/{MAX_ATTEMPTS}): {row.error[:200]}")
    ctx.log(f"{day} 평가 완료 total={context['total']} {r['duration_ms']}ms")
