from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import create_access_token, create_refresh_token
from app.db.session import get_db
from app.models.company import Company
from app.models.manager import Manager
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    SiteKeyLoginRequest,
    UserResponse,
)
from app.services.auth import authenticate_manager

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
    )


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

    # Update last_login and reset login_attempt_count
    manager.last_login = datetime.now()
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
    )
