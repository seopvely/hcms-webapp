# backend/app/api/endpoints/internal_f2b.py
"""web1 Fail2Ban 수집기·Daily Report 용 내부 API (/api/internal/f2b) — 인증은 internal.py 와 같은 X-Internal-Key."""
from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.endpoints.internal import _auth
from app.db.session import get_db
from app.models.f2b import F2bAiReview
from app.services.f2b_store import BansIn, apply_unbans, upsert_bans

router = APIRouter(prefix="/internal/f2b", tags=["internal"], dependencies=[Depends(_auth)])


@router.post("/bans")
def post_bans(body: BansIn, db: Session = Depends(get_db)):
    inserted, updated = upsert_bans(db, body.bans)
    db.flush()
    unbanned = apply_unbans(db, body.unbans)
    db.commit()
    return {"inserted": inserted, "updated": updated, "unbanned": unbanned}


@router.get("/daily-review")
def daily_review(day: date = Query(..., alias="date"), db: Session = Depends(get_db)):
    row = (db.query(F2bAiReview).filter(F2bAiReview.kind == "daily", F2bAiReview.period_from == datetime.combine(day, time.min))
           .order_by(F2bAiReview.id.desc()).first())
    if not row:
        raise HTTPException(404, "no review")
    return {"status": row.status, "result_md": row.result_md or "", "error": row.error, "model": row.model,
            "created_at": row.created_at.isoformat() if row.created_at else None}
