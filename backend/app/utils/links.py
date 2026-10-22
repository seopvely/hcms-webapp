"""메일 등 hcms 밖으로 보내는 화면 링크 — https://<hcms>/open?to=<경로> 중계 페이지로 감싼다.

/open(frontend/public/open.html)은 HCMS 데스크탑 앱이 설치된 Mac 이면 앱 안에서, 아니면 웹으로 연다.
base 가 hcms(PUBLIC_BASE_URL)가 아니면(컷오버 전 cms 주소 등) /open 이 없으므로 그대로 붙인다.
토큰이 든 링크(/invite#token=, /contract-sign#token=, /estimate-auth?token=)는 감싸지 않는다 —
# 뒤 토큰이 /open 의 쿼리로 옮겨져 접속 로그에 남기 때문이다.
"""
from urllib.parse import quote

from app.core.config import settings


def open_link(path: str, base: str | None = None) -> str:
    """path 는 '/' 로 시작하는 hcms 경로(쿼리 포함 가능)."""
    public = settings.PUBLIC_BASE_URL.rstrip("/")
    base = (base or public).rstrip("/")
    if base != public:
        return f"{base}{path}"
    return f"{public}/open?to={quote(path, safe='/')}"
