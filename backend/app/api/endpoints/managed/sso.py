"""직원 SSO 티켓 발급 (createsite, wealthreach, searching).

형식은 cms(api/views.py sso_createsite / sso_wealthreach)와 같다 — 수신측을 고치지 않기 위해
iss="cms.hankyeul.com", sub=str(직원 id), aud, HS256, 120초, jti 를 그대로 유지한다.
"""
import time
import uuid
from pathlib import Path

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_staff
from app.db.session import get_db
from app.models.customer import CustomAuthUser
from app.services import staff_auth

router = APIRouter(prefix="/sso", tags=["managed-sso"])

SSO_ISSUER = "cms.hankyeul.com"

RELYING_PARTIES = {
    "createsite": {
        "aud": "createsite.hankyeul.com",
        "secret_file": lambda: settings.CREATESITE_SSO_SECRET_FILE,
        "callback": lambda: settings.CREATESITE_SSO_CALLBACK_URL,
        "require_mfa": False,
    },
    "wealthreach": {
        "aud": "wealthreach",
        "secret_file": lambda: settings.WEALTHREACH_SSO_SECRET_FILE,
        "callback": lambda: settings.WEALTHREACH_SSO_CALLBACK_URL,
        # 운영사 최고권한 — 2단계 인증을 실제로 통과한 세션에만 발급
        "require_mfa": True,
        "label": "wealthreach 관리자",
    },
    "searching": {
        "aud": "searching.hankyeul.com",
        "secret_file": lambda: settings.SEARCHING_SSO_SECRET_FILE,
        "callback": lambda: settings.SEARCHING_SSO_CALLBACK_URL,
        # 영업 리드 수집·메일 발송 도구 — 2단계 인증을 통과한 세션에만(사용자 결정 2026-10-12, 수신측은 kks@ 만 허용). incident-hub JOB-2026-10-12-007
        "require_mfa": True,
        "label": "searching",
    },
}


def _read_secret(path: str) -> str:
    try:
        return Path(path).read_text(encoding="utf-8").strip()
    except OSError:
        return ""


@router.post("/{rp}")
def issue_sso_ticket(
    rp: str,
    request: Request,
    staff: CustomAuthUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
):
    conf = RELYING_PARTIES.get(rp)
    if conf is None:
        raise HTTPException(status_code=404, detail="알 수 없는 SSO 대상입니다.")

    secret = _read_secret(conf["secret_file"]())
    if not secret:
        raise HTTPException(status_code=503, detail=f"{rp} SSO 키가 hcms 에 아직 설정되지 않았습니다.")

    email = (staff.email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="직원 계정에 이메일이 없어 SSO 를 사용할 수 없습니다.")

    payload = {
        "iss": SSO_ISSUER,
        "aud": conf["aud"],
        "sub": str(staff.id),
        "username": staff.username,
        "email": email,
        "name": staff.name or "",
    }
    if conf["require_mfa"]:
        session_amr = (getattr(request.state, "staff_session", None) and request.state.staff_session.amr) or ""
        if not staff.two_factor_enabled or "otp" not in session_amr.split(","):
            raise HTTPException(
                status_code=403,
                detail=f"{conf.get('label', rp)} 로그인은 2단계 인증을 통과한 로그인에서만 사용할 수 있습니다.",
            )
        payload["amr"] = ["pwd", "otp", "mfa"]

    now = int(time.time())
    jti = uuid.uuid4().hex
    payload.update({"iat": now, "exp": now + settings.SSO_TICKET_TTL, "jti": jti})
    ticket = jwt.encode(payload, secret, algorithm="HS256")

    staff_auth.audit(db, request, "sso_issue", user_id=staff.id, target=rp, detail=f"jti={jti}")
    db.commit()
    # 티켓은 fragment(#) 로 전달 — 서버·프록시 로그와 Referer 에 남지 않는다
    return {"redirect_url": f"{conf['callback']()}#ticket={ticket}"}
