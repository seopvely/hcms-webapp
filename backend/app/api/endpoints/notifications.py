"""데스크탑 알림 조회 (/api/notifications) — HCMS 데스크탑 앱(macOS)이 폴링한다.

모바일 푸시와 같은 내용(고객)·직원 알림 이벤트(직원)를 services/inbox 가 사람별로 쌓고, 앱은 id 커서로 새 것만 받는다.
인증은 기존 그대로: 직원 세션 쿠키(POST 는 CSRF·Origin 검사) 또는 고객 Bearer access 토큰.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import STAFF_SESSION_COOKIE, get_current_staff, get_current_user
from app.db.session import get_db
from app.models.desktop_notification import DesktopNotification
from app.services import inbox

router = APIRouter(prefix="/notifications", tags=["notifications"])

POLL_INTERVAL_SECONDS = 30
_bearer = HTTPBearer(auto_error=False)  # 인증 정보가 없으면 403 이 아니라 401 (앱은 401 이면 조회를 멈춘다)


def get_recipient(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
                  db: Session = Depends(get_db)) -> tuple[str, int]:
    """(recipient_type, recipient_id). 직원 세션 쿠키가 있으면 직원, 아니면 고객 토큰."""
    if request.cookies.get(STAFF_SESSION_COOKIE):
        return inbox.STAFF, get_current_staff(request, db).id
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="로그인이 필요합니다.")
    return inbox.CUSTOMER, get_current_user(credentials, db).seq


def _mine(db: Session, who: tuple[str, int]):
    return db.query(DesktopNotification).filter(DesktopNotification.recipient_type == who[0],
                                                DesktopNotification.recipient_id == who[1])


def _unread(db: Session, who: tuple[str, int]) -> int:
    return _mine(db, who).filter(DesktopNotification.read_at.is_(None)).count()


def _iso_utc(dt) -> str:
    # 저장 값은 서버 지역 시각(KST, naive) — 앱 규격은 UTC
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@router.get("/desktop")
def list_desktop(after: str | None = None, limit: int = Query(20, ge=1, le=50),
                 who: tuple[str, int] = Depends(get_recipient), db: Session = Depends(get_db)):
    """after 이후 새 알림(오래된 것부터). after 가 없으면 최초 연결 — items 없이 현재 커서만."""
    base = {"unread_count": _unread(db, who), "poll_interval_seconds": POLL_INTERVAL_SECONDS}
    if after is None:
        last = _mine(db, who).with_entities(func.max(DesktopNotification.id)).scalar() or 0
        return {"items": [], "next_cursor": str(last), "has_more": False, **base}
    try:
        cursor = int(after)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="커서를 처리할 수 없습니다. 처음부터 다시 연결하세요.")
    if cursor < 0:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="커서를 처리할 수 없습니다. 처음부터 다시 연결하세요.")
    rows = _mine(db, who).filter(DesktopNotification.id > cursor).order_by(DesktopNotification.id).limit(limit + 1).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    items = [{"id": str(r.id), "created_at": _iso_utc(r.created_at), "title": r.title, "body": r.body, "route": r.route,
              "category": r.category, "group_key": r.group_key} for r in rows]
    return {"items": items, "next_cursor": str(rows[-1].id) if rows else str(cursor), "has_more": has_more, **base}


class ReadRequest(BaseModel):
    ids: list[str]


@router.post("/read")
def mark_read(body: ReadRequest, who: tuple[str, int] = Depends(get_recipient), db: Session = Depends(get_db)):
    """데스크탑에서 누른 알림을 읽음으로. 내 알림만 바뀐다."""
    ids = [int(i) for i in body.ids if str(i).isdigit()][:200]
    if ids:
        _mine(db, who).filter(DesktopNotification.id.in_(ids), DesktopNotification.read_at.is_(None)).update(
            {DesktopNotification.read_at: datetime.now()}, synchronize_session=False)
        db.commit()
    return {"unread_count": _unread(db, who)}
