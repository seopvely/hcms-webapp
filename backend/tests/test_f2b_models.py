# backend/tests/test_f2b_models.py
import unittest

from sqlalchemy.dialects import mysql
from sqlalchemy.schema import CreateTable

from app.models.f2b import F2bAiReview, F2bBan, F2bBanEvidence


class ModelTest(unittest.TestCase):
    def test_tables_and_unique(self):
        ddl = str(CreateTable(F2bBan.__table__).compile(dialect=mysql.dialect()))
        self.assertIn("CREATE TABLE f2b_ban", ddl)
        self.assertIn("CONSTRAINT uq_f2b_ban UNIQUE (jail, ip, banned_at)", ddl)
        self.assertEqual(F2bBanEvidence.__table__.c.ban_id.foreign_keys.pop().ondelete, "CASCADE")
        self.assertIn("attempts", F2bAiReview.__table__.c)

    def test_owned_tables_registered(self):
        src = open("alembic/env.py", encoding="utf-8").read()  # 테스트는 backend/ 에서 실행
        for t in ("f2b_ban", "f2b_ban_evidence", "f2b_ai_review"):
            self.assertIn(f'"{t}"', src)
