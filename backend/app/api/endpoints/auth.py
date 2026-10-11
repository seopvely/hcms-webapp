import re
import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.endpoints.staff_auth import login_staff
from app.services.staff_auth import client_ip
from app.core.deps import get_current_user
from app.core.security import create_access_token, create_refresh_token, decode_customer_token
from app.db.session import get_db
from app.models.company import Company
from app.models.manager import Manager
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    UserResponse,
)
from app.services.auth import (
    authenticate_manager,
    hash_django_password,
    verify_django_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

# 고객 로그인 IP 제한: 15분 안 실패 30회. uvicorn 단일 프로세스라 메모리에 둔다(재시작하면 초기화).
_IP_FAIL_LIMIT = 30
_IP_FAIL_WINDOW = 15 * 60
_ip_fails: dict[str, deque] = defaultdict(deque)


def _ip_blocked(ip: str | None) -> bool:
    if not ip:
        return False
    q = _ip_fails[ip]
    cutoff = time.monotonic() - _IP_FAIL_WINDOW
    while q and q[0] < cutoff:
        q.popleft()
    if not q:
        _ip_fails.pop(ip, None)
        return False
    return len(q) >= _IP_FAIL_LIMIT


def _ip_failed(ip: str | None) -> None:
    if ip:
        _ip_fails[ip].append(time.monotonic())


@router.post("/login")
def login(request: LoginRequest, http_request: Request, response: Response, db: Session = Depends(get_db)):
    """통합 로그인. 아이디에 '@' 가 있으면 직원(이메일), 없으면 고객(login_id)."""
    if "@" in request.login_id:
        return login_staff(db, http_request, response, request.login_id, request.password)

    company_id = None
    if request.site_key:
        company = db.query(Company).filter(Company.site_key == request.site_key).first()
        if not company:
            raise HTTPException(status_code=401, detail="유효하지 않은 사이트 키입니다.")
        company_id = company.seq

    ip = client_ip(http_request)
    if _ip_blocked(ip):
        raise HTTPException(status_code=429, detail="로그인 실패가 많아 잠시 제한되었습니다. 15분 후 다시 시도해주세요.")
    try:
        manager = authenticate_manager(db, request.login_id, request.password, company_id=company_id)
    except PermissionError as e:
        _ip_failed(ip)
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        _ip_failed(ip)
        raise HTTPException(status_code=401, detail=str(e))

    if not manager:
        _ip_failed(ip)
        raise HTTPException(
            status_code=401, detail="아이디 또는 비밀번호가 일치하지 않습니다."
        )

    token_data = {"sub": str(manager.seq), "login_id": manager.login_id}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    user = UserResponse(
        seq=manager.seq,
        login_id=manager.login_id,
        name=manager.name,
        email=manager.email,
        company_name=manager.company.name if manager.company else None,
        company_id=manager.company_id,
    )

    return {
        "kind": "customer",
        **LoginResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            user=user,
            is_first_login=bool(manager.is_first_login),
        ).model_dump(),
    }


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/refresh")
def refresh(request: RefreshRequest, db: Session = Depends(get_db)):
    """고객 refresh 토큰으로 새 access 토큰을 발급한다(잠긴 계정은 거부)."""
    payload = decode_customer_token(request.refresh_token, "refresh")
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid token")
    manager = db.query(Manager).filter(Manager.seq == int(payload["sub"])).first()
    if manager is None or manager.login_permit_tf == "2":
        raise HTTPException(status_code=401, detail="Invalid token")
    return {"access_token": create_access_token({"sub": str(manager.seq), "login_id": manager.login_id})}


@router.post("/change-password")
def change_password(
    request: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: Manager = Depends(get_current_user),
):
    # 현재 비밀번호 확인
    if not verify_django_password(request.current_password, current_user.password):
        raise HTTPException(status_code=400, detail="현재 비밀번호가 올바르지 않습니다.")

    # 새 비밀번호 확인
    if request.new_password != request.confirm_password:
        raise HTTPException(
            status_code=400, detail="새 비밀번호와 확인 비밀번호가 일치하지 않습니다."
        )

    # 비밀번호 복잡성 검사 (영문자 + 숫자 + 특수문자, 8자 이상)
    if not re.match(
        r"^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$",
        request.new_password,
    ):
        raise HTTPException(
            status_code=400,
            detail="비밀번호는 최소 8자 이상이며, 영문자, 숫자, 특수문자를 포함해야 합니다.",
        )

    # Django pbkdf2_sha256 형식으로 비밀번호 해시 후 저장
    current_user.password = hash_django_password(request.new_password)
    current_user.is_first_login = False
    db.commit()

    return {"message": "비밀번호가 성공적으로 변경되었습니다."}
