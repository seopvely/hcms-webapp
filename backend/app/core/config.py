from pathlib import Path

from pydantic_settings import BaseSettings

# cron·alembic 등 cwd 가 달라도 backend/.env 를 읽도록 절대경로로 고정
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    # 비밀값은 기본값 없이 .env 에서만 읽는다(없으면 기동 실패)
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    FRONTEND_URL: str = "https://hcms.hankyeul.com"
    HOST: str = "0.0.0.0"
    PORT: int = 9011
    DEBUG: bool = False
    FIREBASE_CREDENTIALS_PATH: str = ""
    WEBHOOK_API_KEY: str = ""
    PACMS_API_BASE_URL: str = "https://cms.hankyeul.com"
    PACMS_ESTIMATE_WEBHOOK_API_KEY: str = ""
    # 메일 링크 base URL — 하드코딩 금지. 고객용은 hcms, 직원용은 /managed 컷오버 때 hcms 로 바꾼다
    PUBLIC_BASE_URL: str = "https://hcms.hankyeul.com"
    STAFF_BASE_URL: str = "https://cms.hankyeul.com"
    # 직원 세션(httpOnly 쿠키). 개발 환경(http)에서만 STAFF_COOKIE_SECURE=False
    STAFF_SESSION_HOURS: int = 12
    STAFF_PENDING_MINUTES: int = 10
    STAFF_COOKIE_SECURE: bool = True
    # 대리 로그인(직원 → 고객 화면) 토큰 유효 시간
    IMPERSONATION_MINUTES: int = 30
    # SSO 발급 (cms 와 같은 형식). 키 파일은 cms(/home/pacms/.*_sso_secret)와 같은 값을 hcms 가 읽을 수 있게 복사해 둔다
    CREATESITE_SSO_SECRET_FILE: str = "/home/hcms/.secrets/createsite_sso_secret"
    CREATESITE_SSO_CALLBACK_URL: str = "https://createsite.hankyeul.com/sso/callback"
    WEALTHREACH_SSO_SECRET_FILE: str = "/home/hcms/.secrets/wealthreach_sso_secret"
    WEALTHREACH_SSO_CALLBACK_URL: str = "https://wealthreach.hankyeul.com/sso/callback"
    SSO_TICKET_TTL: int = 120
    # /managed 쓰기 허용 영역(쉼표 구분: maintenance,points,inquiries,tasks,...).
    # 이관 절차상 cms 쪽 같은 기능의 쓰기를 막는 시점에 켠다. 비어 있으면 해당 화면은 읽기 전용.
    MANAGED_WRITE_AREAS: str = ""

    @property
    def managed_write_areas(self) -> set[str]:
        return {a.strip() for a in self.MANAGED_WRITE_AREAS.split(",") if a.strip()}

    @property
    def cors_origins(self) -> list[str]:
        origins = [self.FRONTEND_URL, "capacitor://localhost", "http://localhost", "https://hcms.hankyeul.com"]
        return origins

    class Config:
        env_file = ENV_FILE


settings = Settings()
