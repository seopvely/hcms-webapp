"""/managed 라우터 공용 도우미."""
import math

from fastapi import Depends, HTTPException
from passlib.hash import django_pbkdf2_sha256

from app.core.config import settings
from app.core.deps import get_current_staff
from app.models.customer import CustomAuthUser

# 코드표 (pacms 와 같은 문자열 값 — SPEC 02 §11)
MAINT_STATUS_LABELS = {"1": "접수", "2": "알림", "3": "처리중", "4": "완료"}
WORKER_TYPE_LABELS = {"1": "계약", "2": "기획", "3": "디자인", "4": "프론트엔드", "5": "백엔드", "6": "유지보수"}
POINT_TYPE_LABELS = {"1": "충전", "2": "사용", "3": "책정"}
POINT_STATUS_LABELS = {"1": "입력", "2": "실행"}
REQUEST_TYPE_LABELS = {"maint": "유지보수", "dev": "개발"}


def code(value) -> str | None:
    """varchar 코드 컬럼 값을 문자열로 정규화('' 는 None)."""
    if value is None:
        return None
    text = str(value)
    return text or None


def require_write(area: str):
    """쓰기 허용 영역이 아니면 409. 이관 기간에는 cms 와 hcms 중 한 곳만 쓰도록 영역별로 켠다."""

    def dependency() -> None:
        if area not in settings.managed_write_areas:
            raise HTTPException(
                status_code=409,
                detail="이 기능은 아직 cms 에서 처리합니다(hcms 는 읽기 전용 기간입니다).",
            )

    return Depends(dependency)


def write_enabled(area: str) -> bool:
    return area in settings.managed_write_areas


def verify_step_up(staff: CustomAuthUser, password: str | None) -> None:
    """민감 작업 전 본인 비밀번호 재확인 (cms 와 같은 정책)."""
    try:
        ok = bool(password) and django_pbkdf2_sha256.verify(password, staff.password)
    except ValueError:
        ok = False
    if not ok:
        raise HTTPException(status_code=403, detail="비밀번호가 일치하지 않습니다.")


def page_response(items: list, total: int, page: int, per_page: int) -> dict:
    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": max(math.ceil(total / per_page), 1) if per_page else 1,
    }


StaffDep = Depends(get_current_staff)


def apply_sort(query, sort: str | None, columns: dict, default: list):
    """목록 정렬. sort='field' 또는 '-field'(내림차순). 허용 목록(columns: 이름 → 컬럼)에 없으면 default 순서.

    같은 값끼리는 default 순서로 이어 정렬해 페이지가 바뀌어도 순서가 흔들리지 않게 한다.
    NULL 은 오름·내림 모두 뒤로 보낸다.
    """
    if sort:
        desc = sort.startswith("-")
        col = columns.get(sort.lstrip("-"))
        if col is not None:
            return query.order_by(col.is_(None), col.desc() if desc else col.asc(), *default)
    return query.order_by(*default)
