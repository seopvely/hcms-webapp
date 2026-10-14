# backend/tests/test_f2b_job.py
import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest import mock

from app.jobs.tasks import f2b_jobs as fj
from app.models.f2b import F2bAiReview


class FakeQuery:
    def __init__(self, row):
        self.row = row

    def filter(self, *a, **k):
        return self

    def order_by(self, *a):
        return self

    def first(self):
        return self.row


class FakeDB:
    def __init__(self, row=None):
        self.row, self.added, self.commits = row, [], 0

    def query(self, *a):
        return FakeQuery(self.row)

    def add(self, obj):
        self.added.append(obj)
        self.row = obj

    def commit(self):
        self.commits += 1


def ctx(db):
    lines = []
    return SimpleNamespace(db=db, now=datetime(2026, 10, 15, 8, 31), dry_run=False, lines=lines, log=lines.append)


class JobTest(unittest.TestCase):
    def test_skip_when_ok_exists(self):
        c = ctx(FakeDB(F2bAiReview(status="ok", attempts=1)))
        with mock.patch.object(fj.claude_cli, "run_claude") as run:
            fj.run_f2b_daily_review(c)
        run.assert_not_called()

    def test_empty_day_saves_ok_without_claude(self):
        db = FakeDB()
        with mock.patch.object(fj, "build_context", return_value={"total": 0}), \
             mock.patch.object(fj.claude_cli, "run_claude") as run:
            fj.run_f2b_daily_review(ctx(db))
        run.assert_not_called()
        self.assertEqual((db.row.status, db.row.result_md), ("ok", fj.EMPTY_TEXT))

    def test_failure_raises_and_counts_attempt(self):
        db = FakeDB()
        with mock.patch.object(fj, "build_context", return_value={"total": 5}), \
             mock.patch.object(fj, "render_prompt", return_value="p"), \
             mock.patch.object(fj.claude_cli, "run_claude", return_value={"ok": False, "auth_error": True, "error": "x", "result": "", "duration_ms": 1}):
            with self.assertRaises(RuntimeError):
                fj.run_f2b_daily_review(ctx(db))
        self.assertEqual((db.row.status, db.row.attempts, db.row.error), ("error", 1, "claude 로그인 만료(인증 실패)"))
        self.assertEqual(db.commits, 1)

    def test_gives_up_after_max_attempts(self):
        c = ctx(FakeDB(F2bAiReview(status="error", attempts=fj.MAX_ATTEMPTS)))
        with mock.patch.object(fj.claude_cli, "run_claude") as run:
            fj.run_f2b_daily_review(c)
        run.assert_not_called()

    def test_success(self):
        db = FakeDB()
        with mock.patch.object(fj, "build_context", return_value={"total": 5}), \
             mock.patch.object(fj, "render_prompt", return_value="p"), \
             mock.patch.object(fj.claude_cli, "run_claude", return_value={"ok": True, "result": "## 요약", "error": "", "auth_error": False, "duration_ms": 9}):
            fj.run_f2b_daily_review(ctx(db))
        self.assertEqual((db.row.status, db.row.result_md, db.row.period_from), ("ok", "## 요약", datetime(2026, 10, 14)))
