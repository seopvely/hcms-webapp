"""직원 관리 API (/api/managed/*). 라우터 전체에 직원 인증을 건다 — 개별 엔드포인트에서 빠뜨리지 않도록."""
from fastapi import APIRouter, Depends

from app.core.deps import get_current_staff
from app.api.endpoints.managed.comment_templates import router as comment_templates_router
from app.api.endpoints.managed.dashboard import router as dashboard_router
from app.api.endpoints.managed.impersonate import router as impersonate_router
from app.api.endpoints.managed.lookup import router as lookup_router
from app.api.endpoints.managed.maintenance import router as maintenance_router
from app.api.endpoints.managed.me import router as me_router
from app.api.endpoints.managed.points import router as points_router
from app.api.endpoints.managed.sso import router as sso_router
from app.api.endpoints.managed.staff_accounts import router as staff_accounts_router

router = APIRouter(prefix="/managed", tags=["managed"], dependencies=[Depends(get_current_staff)])
router.include_router(me_router)
router.include_router(dashboard_router)
router.include_router(impersonate_router)
router.include_router(sso_router)
router.include_router(staff_accounts_router)
router.include_router(lookup_router)
router.include_router(maintenance_router)
router.include_router(points_router)
router.include_router(comment_templates_router)
