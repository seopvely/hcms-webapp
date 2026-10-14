# backend/app/api/endpoints/managed/f2b.py
"""web1 Fail2Ban 차단 분석 (/api/managed/f2b) — 관리자 전용 조회 + AI 평가(spec 2026-10-15 §7).

AI 평가는 ai.py 의 작업 방식(_start → GET /managed/ai/jobs/{id})을 그대로 쓴다. 결과는 f2b_ai_review 에 남긴다.
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.endpoints.managed import ai as ai_endpoints
from app.api.endpoints.managed.common import page_response
from app.core.deps import require_staff_admin
from app.db.session import SessionLocal, get_db
from app.models.customer import CustomAuthUser
from app.models.f2b import F2bBan, F2bBanEvidence
from app.services import f2b_query as q
from app.services import f2b_review as rv

router = APIRouter(prefix="/f2b", tags=["managed-f2b"], dependencies=[Depends(require_staff_admin)])
PER_PAGE = 50


def filters_dep(date_from: date, date_to: date, hour_from: int | None = None, hour_to: int | None = None,
                jails: str = "", reasons: str = "", site: str | None = None, ip: str | None = None) -> q.F2bFilters:
    try:
        return q.make_filters(date_from, date_to, hour_from, hour_to, jails, reasons, site, ip)
    except ValueError as e:
        raise HTTPException(400, str(e))


class FiltersBody(BaseModel):
    date_from: date
    date_to: date
    hour_from: int | None = None
    hour_to: int | None = None
    jails: str = ""
    reasons: str = ""
    site: str | None = None
    ip: str | None = None

    def to_filters(self) -> q.F2bFilters:
        try:
            return q.make_filters(self.date_from, self.date_to, self.hour_from, self.hour_to, self.jails, self.reasons, self.site, self.ip)
        except ValueError as e:
            raise HTTPException(400, str(e))


@router.get("/options")
def options():
    return {"jails": q.JAILS, "reasons": [{"code": k, "label": v} for k, v in q.REASON_LABELS.items()]}


@router.get("/summary")
def summary(f: q.F2bFilters = Depends(filters_dep), db: Session = Depends(get_db)):
    return q.summary(db, f)


@router.get("/bans")
def bans(f: q.F2bFilters = Depends(filters_dep), page: int = Query(1, ge=1), db: Session = Depends(get_db)):
    items, total = q.list_bans(db, f, page, PER_PAGE)
    return page_response(items, total, page, PER_PAGE)


@router.get("/bans/{ban_id}")
def ban_detail(ban_id: int, db: Session = Depends(get_db)):
    b = db.get(F2bBan, ban_id)
    if not b:
        raise HTTPException(404, "차단 기록을 찾을 수 없습니다.")
    ev = db.query(F2bBanEvidence).filter(F2bBanEvidence.ban_id == ban_id).order_by(F2bBanEvidence.logged_at, F2bBanEvidence.id).all()
    return {**q.ban_dict(b), "evidence": [{"logged_at": e.logged_at.isoformat(), "source_file": e.source_file, "line": e.line} for e in ev]}


@router.get("/ai-review/cached")
def cached(f: q.F2bFilters = Depends(filters_dep), db: Session = Depends(get_db)):
    row = rv.cached_review(db, f)
    if not row:
        raise HTTPException(404, "캐시 없음")
    return {"review_id": row.id, "result_md": row.result_md or "", "created_at": row.created_at.isoformat()}


@router.post("/ai-review")
def ai_review(body: FiltersBody, request: Request, db: Session = Depends(get_db),
              staff: CustomAuthUser = Depends(require_staff_admin)):
    f = body.to_filters()
    ctx = rv.build_context(db, f, "search")
    if not ctx["total"]:
        raise HTTPException(422, rv.EMPTY_TEXT)
    prompt = rv.render_prompt(ctx, "search")

    def parse(text: str) -> dict:
        s = SessionLocal()
        try:
            row = rv.save_review(s, f, "search", text, staff.id)
            s.commit()
            return {"review_id": row.id, "result_md": text}
        finally:
            s.close()

    return ai_endpoints._start(staff, "f2b_review", f.hash()[:16], prompt, "sonnet", parse, None, request)
