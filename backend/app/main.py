import logging

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.firebase import init_firebase
from app.api.endpoints.auth import router as auth_router
from app.api.endpoints.dashboard import router as dashboard_router
from app.api.endpoints.maintenance import router as maintenance_router
from app.api.endpoints.news import router as news_router
from app.api.endpoints.tasks import router as tasks_router
from app.api.endpoints.estimates import router as estimates_router
from app.api.endpoints.point_usage import router as point_usage_router
from app.api.endpoints.push import router as push_router
from app.api.endpoints.inquiries import router as inquiries_router
from app.api.endpoints.webhook import router as webhook_router
from app.api.endpoints.project_board import router as project_board_router
from app.api.endpoints.dev_requests import router as dev_requests_router
from app.api.endpoints.ai_dev_subscription import router as ai_dev_subscription_router
from app.api.endpoints.maint_subscription import router as maint_subscription_router
from app.api.endpoints.maint_renewal import router as maint_renewal_router
from app.api.endpoints.staff_auth import router as staff_auth_router
from app.api.endpoints.reference_sites_public import router as reference_sites_public_router
from app.api.endpoints.invite import router as invite_router
from app.api.endpoints.public_contracts import router as public_contracts_router
from app.api.endpoints.managed import router as managed_router
from app.api.endpoints.internal import router as internal_router

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="HCMS Customer API", version="1.0.0")

init_firebase()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")


@api_router.get("/health")
def health_check():
    return {"status": "ok"}


api_router.include_router(auth_router)
api_router.include_router(internal_router)
api_router.include_router(dashboard_router)
api_router.include_router(maintenance_router)
api_router.include_router(news_router)
api_router.include_router(tasks_router)
api_router.include_router(estimates_router)
api_router.include_router(point_usage_router)
api_router.include_router(push_router)
api_router.include_router(inquiries_router)
api_router.include_router(webhook_router)
api_router.include_router(project_board_router)
api_router.include_router(dev_requests_router)
api_router.include_router(ai_dev_subscription_router)
api_router.include_router(maint_subscription_router)
api_router.include_router(maint_renewal_router)
api_router.include_router(staff_auth_router)
api_router.include_router(reference_sites_public_router)
api_router.include_router(invite_router)
api_router.include_router(public_contracts_router)
api_router.include_router(managed_router)

app.include_router(api_router)
