# backend/app/services/f2b_store.py
"""web1 수집기 레코드 저장 — (jail, ip, banned_at) upsert, 근거 줄 교체, unban 반영."""
from datetime import datetime

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.models.f2b import F2bBan, F2bBanEvidence
from app.services.f2b_query import REASON_LABELS


class EvidenceIn(BaseModel):
    logged_at: datetime
    source_file: str = Field("", max_length=255)
    line: str = Field(..., max_length=1000)


class BanIn(BaseModel):
    jail: str = Field(..., max_length=40)
    ip: str = Field(..., max_length=45)
    banned_at: datetime
    reason: str = Field("unknown", max_length=40)
    reason_detail: str = Field("", max_length=255)
    site: str | None = Field(None, max_length=255)
    request_count: int = Field(0, ge=0)
    status_summary: dict[str, int] | None = None
    user_agent: str | None = Field(None, max_length=500)
    evidence: list[EvidenceIn] = Field(default_factory=list, max_length=20)


class UnbanIn(BaseModel):
    jail: str = Field(..., max_length=40)
    ip: str = Field(..., max_length=45)
    unbanned_at: datetime


class BansIn(BaseModel):
    bans: list[BanIn] = Field(default_factory=list, max_length=500)
    unbans: list[UnbanIn] = Field(default_factory=list, max_length=500)


def normalize_reason(reason: str) -> str:
    return reason if reason in REASON_LABELS else "unknown"


def upsert_bans(db: Session, bans: list[BanIn]) -> tuple[int, int]:
    inserted = updated = 0
    for b in bans:
        row = db.query(F2bBan).filter(F2bBan.jail == b.jail, F2bBan.ip == b.ip, F2bBan.banned_at == b.banned_at).first()
        if row is None:
            row = F2bBan(jail=b.jail, ip=b.ip, banned_at=b.banned_at)
            db.add(row)
            inserted += 1
        else:
            db.query(F2bBanEvidence).filter(F2bBanEvidence.ban_id == row.id).delete(synchronize_session=False)
            updated += 1
        row.reason = normalize_reason(b.reason)
        row.reason_detail = b.reason_detail
        row.site = b.site
        row.request_count = b.request_count
        row.status_summary = b.status_summary
        row.user_agent = b.user_agent
        db.flush()
        for e in b.evidence:
            db.add(F2bBanEvidence(ban_id=row.id, logged_at=e.logged_at, source_file=e.source_file, line=e.line))
    return inserted, updated


def apply_unbans(db: Session, unbans: list[UnbanIn]) -> int:
    n = 0
    for u in unbans:
        row = (db.query(F2bBan)
               .filter(F2bBan.jail == u.jail, F2bBan.ip == u.ip, F2bBan.banned_at <= u.unbanned_at, F2bBan.unbanned_at.is_(None))
               .order_by(F2bBan.banned_at.desc()).first())
        if row:
            row.unbanned_at = u.unbanned_at
            n += 1
    return n
