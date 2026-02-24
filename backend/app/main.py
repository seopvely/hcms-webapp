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

app = FastAPI(title="HCMS Customer API", version="1.0.0", root_path="/api")

# Initialize Firebase on startup
init_firebase()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

router = APIRouter()


@router.get("/health")
def health_check():
    return {"status": "ok"}


app.include_router(router)
app.include_router(auth_router)
app.include_router(dashboard_router)
app.include_router(maintenance_router)
app.include_router(news_router)
app.include_router(tasks_router)
app.include_router(estimates_router)
app.include_router(point_usage_router)
app.include_router(push_router)
app.include_router(inquiries_router)
app.include_router(webhook_router)
