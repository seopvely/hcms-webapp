"""홈페이지용 공개 레퍼런스 API — cms GET /api/reference-sites/ 와 같은 응답 형식(SPEC 03 §9).

키는 cms 와 다른 새 값(REFERENCE_SITE_API_KEY)을 상수시간 비교한다. 홈페이지가 hcms 주소·새 키로 바꾸는 것은 인계.
썸네일은 /media 를 닫아도 열리도록 전용 공개 경로로 내보낸다.
"""
import hmac
import mimetypes

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.endpoints.managed.reference_sites import thumbnail_url
from app.core.config import settings
from app.db.session import get_db
from app.models.reference import ReferenceSite, ReferenceSiteCategory
from app.utils.media import resolve_media_path

router = APIRouter(tags=["reference-sites-public"])


@router.get("/reference-sites/")
def list_reference_sites(x_api_key: str | None = Header(None), db: Session = Depends(get_db)):
    if not settings.REFERENCE_SITE_API_KEY:
        raise HTTPException(status_code=503, detail="레퍼런스 API 키가 설정되지 않았습니다.")
    if not x_api_key or not hmac.compare_digest(x_api_key, settings.REFERENCE_SITE_API_KEY):
        raise HTTPException(status_code=401, detail="인증에 실패했습니다.")
    categories = {c.seq: c.name for c in db.query(ReferenceSiteCategory)}
    sites = (db.query(ReferenceSite).filter(ReferenceSite.is_active == True)  # noqa: E712
             .order_by(ReferenceSite.display_order, ReferenceSite.created_at.desc()).all())
    results = [{
        "site_name": s.site_name, "url": s.url, "thumbnail_url": thumbnail_url(s), "description": s.description,
        "tech_stack": s.tech_stack_list(), "category": categories.get(s.category_id), "production_year": s.production_year,
    } for s in sites]
    return {"results": results, "count": len(results)}


@router.get("/public/reference-sites/{seq}/thumbnail")
def reference_thumbnail(seq: int, db: Session = Depends(get_db)):
    s = db.query(ReferenceSite).filter(ReferenceSite.seq == seq).first()
    path = resolve_media_path(s.thumbnail) if s and s.thumbnail and s.thumbnail.startswith("reference_sites/") else None
    if path is None:
        raise HTTPException(status_code=404, detail="썸네일이 없습니다.")
    return FileResponse(path, media_type=mimetypes.guess_type(path)[0] or "application/octet-stream",
                        headers={"Cache-Control": "public, max-age=3600"})
