"""직원 관리 API (/api/managed/*). 라우터 전체에 직원 인증을 건다 — 개별 엔드포인트에서 빠뜨리지 않도록."""
from fastapi import APIRouter, Depends

from app.core.deps import get_current_staff
from app.api.endpoints.managed.accounts import router as accounts_router
from app.api.endpoints.managed.ai_prompts import router as ai_prompts_router
from app.api.endpoints.managed.alarms import router as alarms_router
from app.api.endpoints.managed.billing import router as billing_router
from app.api.endpoints.managed.fde import router as fde_router
from app.api.endpoints.managed.maint_renewal import router as maint_renewal_router
from app.api.endpoints.managed.meetings import router as meetings_router
from app.api.endpoints.managed.subscriptions import router as subscriptions_router
from app.api.endpoints.managed.comment_templates import router as comment_templates_router
from app.api.endpoints.managed.contracts import router as contracts_router
from app.api.endpoints.managed.conversion import router as conversion_router
from app.api.endpoints.managed.dashboard import router as dashboard_router
from app.api.endpoints.managed.domains import router as domains_router
from app.api.endpoints.managed.estimates import router as estimates_router
from app.api.endpoints.managed.jobs import router as jobs_router
from app.api.endpoints.managed.impersonate import router as impersonate_router
from app.api.endpoints.managed.inquiries import router as inquiries_router
from app.api.endpoints.managed.lookup import router as lookup_router
from app.api.endpoints.managed.maintenance import router as maintenance_router
from app.api.endpoints.managed.me import router as me_router
from app.api.endpoints.managed.news import router as news_router
from app.api.endpoints.managed.outsourcing import router as outsourcing_router
from app.api.endpoints.managed.points import router as points_router
from app.api.endpoints.managed.project_board import router as project_board_router
from app.api.endpoints.managed.projects import router as projects_router
from app.api.endpoints.managed.sales import router as sales_router
from app.api.endpoints.managed.sso import router as sso_router
from app.api.endpoints.managed.staff_accounts import router as staff_accounts_router
from app.api.endpoints.managed.tasks import router as tasks_router
from app.api.endpoints.managed.tax import router as tax_router
from app.api.endpoints.managed.todos import router as todos_router

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
router.include_router(inquiries_router)
router.include_router(tasks_router)
router.include_router(accounts_router)
router.include_router(news_router)
router.include_router(project_board_router)
router.include_router(estimates_router)
router.include_router(sales_router)
router.include_router(contracts_router)
router.include_router(conversion_router)
router.include_router(projects_router)
router.include_router(domains_router)
router.include_router(outsourcing_router)
router.include_router(billing_router)
router.include_router(subscriptions_router)
router.include_router(maint_renewal_router)
router.include_router(fde_router)
router.include_router(alarms_router)
router.include_router(todos_router)
router.include_router(meetings_router)
router.include_router(tax_router)
router.include_router(ai_prompts_router)
router.include_router(jobs_router)
