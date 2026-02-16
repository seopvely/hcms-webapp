import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.security import create_access_token, create_refresh_token
from app.db.session import get_db
from app.models.company import Company
from app.models.manager import Manager
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    SiteKeyLoginRequest,
    UserResponse,
)
from app.services.auth import (
    authenticate_manager,
    hash_django_password,
    verify_django_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    try:
        manager = authenticate_manager(db, request.login_id, request.password)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))

    if not manager:
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

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=user,
        is_first_login=bool(manager.is_first_login),
    )


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


@router.post("/site-key-login", response_model=LoginResponse)
def site_key_login(request: SiteKeyLoginRequest, db: Session = Depends(get_db)):
    # Look up company by site_key
    company = db.query(Company).filter(Company.site_key == request.site_key).first()
    if not company:
        raise HTTPException(status_code=401, detail="유효하지 않은 사이트 키입니다.")

    # Find manager by login_id and company_id
    manager = (
        db.query(Manager)
        .filter(
            Manager.login_id == request.login_id, Manager.company_id == company.seq
        )
        .first()
    )
    if not manager:
        raise HTTPException(
            status_code=401, detail="해당 사이트에 등록되지 않은 관리자입니다."
        )

    # Reset login_attempt_count (site_key 로그인은 last_login 업데이트 안 함)
    manager.login_attempt_count = 0
    db.commit()
    db.refresh(manager)

    # Generate tokens
    token_data = {"sub": str(manager.seq), "login_id": manager.login_id}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    # Build user response
    user = UserResponse(
        seq=manager.seq,
        login_id=manager.login_id,
        name=manager.name,
        email=manager.email,
        company_name=manager.company.name if manager.company else None,
        company_id=manager.company_id,
    )

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=user,
        is_first_login=bool(manager.is_first_login),
    )
