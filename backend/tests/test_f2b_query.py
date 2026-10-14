# backend/tests/test_f2b_query.py
import unittest
from datetime import date, datetime

from sqlalchemy.dialects import mysql

from app.models.f2b import F2bBan
from app.services import f2b_query as q
from app.db.session import SessionLocal


def compiled(query):
    """(SQL 문자열, 바인드 값 목록) — literal 렌더링은 MySQL 이스케이프가 섞여 쓰지 않는다."""
    c = query.statement.compile(dialect=mysql.dialect())
    return str(c), list(c.params.values())


class FiltersTest(unittest.TestCase):
    def test_make_and_hash_stable(self):
        a = q.make_filters(date(2026, 10, 1), date(2026, 10, 7), jails="sshd,nginx-404", reasons="")
        b = q.make_filters(date(2026, 10, 1), date(2026, 10, 7), jails="nginx-404,sshd")
        self.assertEqual(a.jails, ("nginx-404", "sshd"))
        self.assertEqual(a.hash(), b.hash())
        self.assertEqual(a.days(), 7)
        self.assertEqual(a.period(), (datetime(2026, 10, 1), datetime(2026, 10, 7, 23, 59, 59)))

    def test_validation(self):
        with self.assertRaises(ValueError):
            q.make_filters(date(2026, 10, 7), date(2026, 10, 1))
        with self.assertRaises(ValueError):
            q.make_filters(date(2026, 1, 1), date(2026, 10, 1))  # 92일 초과
        with self.assertRaises(ValueError):
            q.make_filters(date(2026, 10, 1), date(2026, 10, 2), hour_from=3)  # 한쪽만
        with self.assertRaises(ValueError):
            q.make_filters(date(2026, 10, 1), date(2026, 10, 2), hour_from=0, hour_to=24)
        with self.assertRaises(ValueError):
            q.make_filters(date(2026, 10, 1), date(2026, 10, 2), jails="evil")

    def test_unknown_reason_rejected(self):
        with self.assertRaises(ValueError):
            q.make_filters(date(2026, 10, 1), date(2026, 10, 2), reasons="nope")


class ApplyFiltersTest(unittest.TestCase):
    def setUp(self):
        self.db = SessionLocal()

    def tearDown(self):
        self.db.close()

    def test_date_range_inclusive(self):
        s, p = compiled(q.apply_filters(self.db.query(F2bBan), q.make_filters(date(2026, 10, 1), date(2026, 10, 7))))
        self.assertIn("f2b_ban.banned_at >= %s AND f2b_ban.banned_at < %s", s)
        self.assertEqual(p[:2], [datetime(2026, 10, 1), datetime(2026, 10, 8)])

    def test_hour_range_normal(self):
        f = q.make_filters(date(2026, 10, 1), date(2026, 10, 1), hour_from=2, hour_to=6)
        s, p = compiled(q.apply_filters(self.db.query(F2bBan), f))
        self.assertIn("hour(f2b_ban.banned_at) BETWEEN %s AND %s", s)
        self.assertEqual(p[2:4], [2, 6])

    def test_hour_range_wraps_midnight(self):
        f = q.make_filters(date(2026, 10, 1), date(2026, 10, 1), hour_from=22, hour_to=4)
        s, p = compiled(q.apply_filters(self.db.query(F2bBan), f))
        self.assertIn("hour(f2b_ban.banned_at) >= %s OR hour(f2b_ban.banned_at) <= %s", s)
        self.assertEqual(p[2:4], [22, 4])

    def test_items_and_ip_like_escaped(self):
        f = q.make_filters(date(2026, 10, 1), date(2026, 10, 1), jails="sshd", reasons="ssh_bruteforce", site="a.com", ip="1.2_%")
        s, p = compiled(q.apply_filters(self.db.query(F2bBan), f))
        self.assertIn("f2b_ban.jail IN (__[POSTCOMPILE_jail_1])", s)
        self.assertIn("f2b_ban.site = %s", s)
        self.assertIn("LIKE %s ESCAPE", s)
        self.assertIn("%1.2\\_\\%%", p)
        self.assertEqual(q._like_escape("a\\b"), "a\\\\b")


class LabelsTest(unittest.TestCase):
    def test_all_reasons_labeled(self):
        self.assertEqual(len(q.REASON_LABELS), 15)
        self.assertEqual(q.REASON_LABELS["repeat_offender"], "반복 차단(재범)")
        self.assertEqual(list(q.REASON_LABELS)[-1], "unknown")

    def test_recidive_jail_allowed(self):
        f = q.make_filters(date(2026, 10, 1), date(2026, 10, 1), jails="recidive", reasons="repeat_offender")
        self.assertEqual((f.jails, f.reasons), (("recidive",), ("repeat_offender",)))
        self.assertEqual(q.REASON_LABELS["smtp_reject"], "SMTP 수신거부")
        self.assertEqual(q.REASON_LABELS["smtp_scan"], "SMTP 스캔")
        self.assertEqual(list(q.REASON_LABELS)[0], "wp_probe")
        self.assertEqual(list(q.REASON_LABELS)[-1], "unknown")
