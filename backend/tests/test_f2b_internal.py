# backend/tests/test_f2b_internal.py
import unittest

from pydantic import ValidationError

from app.services.f2b_store import BanIn, BansIn, normalize_reason


def ban(**kw):
    d = {"jail": "sshd", "ip": "192.0.2.7", "banned_at": "2026-10-14T23:31:44", "reason": "ssh_bruteforce",
         "reason_detail": "인증 실패 3회", "request_count": 3, "evidence": []}
    d.update(kw)
    return d


class PayloadTest(unittest.TestCase):
    def test_valid(self):
        body = BansIn(bans=[ban()], unbans=[{"jail": "sshd", "ip": "192.0.2.7", "unbanned_at": "2026-10-15T23:31:44"}])
        self.assertEqual(body.bans[0].banned_at.hour, 23)

    def test_limits(self):
        with self.assertRaises(ValidationError):
            BanIn(**ban(evidence=[{"logged_at": "2026-10-14T23:31:40", "source_file": "a", "line": "x"}] * 21))
        with self.assertRaises(ValidationError):
            BanIn(**ban(evidence=[{"logged_at": "2026-10-14T23:31:40", "source_file": "a", "line": "x" * 1001}]))
        with self.assertRaises(ValidationError):
            BanIn(**ban(ip="x" * 46))
        with self.assertRaises(ValidationError):
            BansIn(bans=[ban()] * 501)

    def test_unknown_reason_becomes_unknown(self):
        self.assertEqual(normalize_reason("weird"), "unknown")
        self.assertEqual(normalize_reason("wp_probe"), "wp_probe")
