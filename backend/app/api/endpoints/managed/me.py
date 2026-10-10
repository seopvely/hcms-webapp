from fastapi import APIRouter, Depends

from app.core.config import settings
from app.core.deps import get_current_staff
from app.models.customer import CustomAuthUser

router = APIRouter()


@router.get("/me")
def me(staff: CustomAuthUser = Depends(get_current_staff)):
    return {
        "id": staff.id,
        "username": staff.username,
        "name": staff.name,
        "email": staff.email,
        "is_admin": bool(staff.is_superuser) or staff.previlege == "1",
        "two_factor_enabled": bool(staff.two_factor_enabled),
        "write_areas": sorted(settings.managed_write_areas),
    }
