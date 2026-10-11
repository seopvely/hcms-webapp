import hmac

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.manager import Manager
from app.schemas.push import PushTokenRegister, PushTokenResponse, PushSendRequest
from app.services.push import (
    register_token,
    unregister_token,
    get_active_tokens,
    send_push_to_user,
    send_push_to_all,
)

router = APIRouter(prefix="/push", tags=["push"])


@router.post("/register", response_model=PushTokenResponse)
def register_push_token(
    request: PushTokenRegister,
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """푸시 토큰 등록."""
    if request.platform not in ("ios", "android"):
        raise HTTPException(status_code=400, detail="platform must be 'ios' or 'android'")

    token = register_token(
        db=db,
        manager_seq=current_user.seq,
        token=request.token,
        platform=request.platform,
    )
    return token


@router.delete("/unregister")
def unregister_push_token(
    request: PushTokenRegister,
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """푸시 토큰 해제."""
    success = unregister_token(db=db, token=request.token)
    if not success:
        raise HTTPException(status_code=404, detail="Token not found")
    return {"message": "Token unregistered successfully"}


@router.get("/tokens", response_model=list[PushTokenResponse])
def list_my_tokens(
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """내 등록된 푸시 토큰 목록."""
    tokens = get_active_tokens(db=db, manager_seq=current_user.seq)
    return tokens


def _verify_internal_key(x_api_key: str = Header(...)):
    # 고객 토큰으로는 호출 불가. 전용 내부 키로만(웹훅 키와 분리 — pacms 쪽에 보이지 않게)
    if not settings.PUSH_API_KEY or not hmac.compare_digest(x_api_key, settings.PUSH_API_KEY):
        raise HTTPException(status_code=403, detail="Forbidden")
    return x_api_key


@router.post("/send", dependencies=[Depends(_verify_internal_key)])
def send_push(
    request: PushSendRequest,
    db: Session = Depends(get_db),
):
    """푸시 발송 (내부 전용)."""
    if request.manager_seq:
        count = send_push_to_user(
            db=db,
            manager_seq=request.manager_seq,
            title=request.title,
            body=request.body,
            data=request.data,
        )
    else:
        count = send_push_to_all(
            db=db,
            title=request.title,
            body=request.body,
            data=request.data,
        )

    return {"message": f"Push sent to {count} device(s)"}
