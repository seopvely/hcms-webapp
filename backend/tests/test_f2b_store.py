import unittest
from datetime import datetime

from sqlalchemy import BigInteger, create_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from app.models.f2b import F2bBan, F2bBanEvidence
from app.services.f2b_store import BanIn, UnbanIn, apply_unbans, upsert_bans


@compiles(BigInteger, "sqlite")
def _bigint_sqlite(type_, compiler, **kw):  # 테스트용: SQLite 는 INTEGER PRIMARY KEY 만 자동 증가
    return "INTEGER"


def ban(t, **kw):
    d = {"jail": "sshd", "ip": "192.0.2.7", "banned_at": t, "reason": "ssh_bruteforce", "request_count": 1,
         "evidence": [{"logged_at": t, "source_file": "auth.log", "line": "x"}]}
    d.update(kw)
    return BanIn(**d)


class StoreTest(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        F2bBan.metadata.create_all(engine, tables=[F2bBan.__table__, F2bBanEvidence.__table__])
        self.db = sessionmaker(bind=engine)()

    def tearDown(self):
        self.db.close()

    def test_upsert_replaces_evidence(self):
        t = datetime(2026, 10, 14, 1)
        self.assertEqual(upsert_bans(self.db, [ban(t)]), (1, 0))
        self.db.flush()
        self.assertEqual(upsert_bans(self.db, [ban(t, reason_detail="새로", evidence=[])]), (0, 1))
        self.db.flush()
        self.assertEqual(self.db.query(F2bBan).count(), 1)
        self.assertEqual(self.db.query(F2bBanEvidence).count(), 0)
        self.assertEqual(self.db.query(F2bBan).one().reason_detail, "새로")

    def test_resent_unban_is_idempotent(self):
        old, new = datetime(2026, 10, 1), datetime(2026, 10, 14, 1)
        upsert_bans(self.db, [ban(old), ban(new)])  # old 는 해제 기록이 보관기간 밖이라 NULL 로 남은 행
        self.db.flush()
        u = UnbanIn(jail="sshd", ip="192.0.2.7", unbanned_at=datetime(2026, 10, 15, 1))
        self.assertEqual(apply_unbans(self.db, [u]), 1)
        self.db.flush()
        self.assertEqual(apply_unbans(self.db, [u]), 0)  # 응답 유실로 재전송
        self.db.flush()
        rows = {r.banned_at: r.unbanned_at for r in self.db.query(F2bBan)}
        self.assertEqual(rows[new], datetime(2026, 10, 15, 1))
        self.assertIsNone(rows[old])
