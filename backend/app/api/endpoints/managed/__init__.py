"""직원 관리 API (/api/managed/*). 라우터 전체에 직원 인증을 건다 — 개별 엔드포인트에서 빠뜨리지 않도록."""
from fastapi import APIRouter, Depends

from app.core.deps import get_current_staff
from app.api.endpoints.managed.me import router as me_router

router = APIRouter(prefix="/managed", tags=["managed"], dependencies=[Depends(get_current_staff)])
router.include_router(me_router)
