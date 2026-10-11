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
    # /api/push/send 내부 호출 키(웹훅 키와 분리 — 비우면 비활성)
    PUSH_API_KEY: str = ""
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
    # 계약서 을(한결랩) 정보 — cms EstimateContract 모델 기본값과 같은 값(설정값으로 이동)
    CONTRACT_PARTY_B_NAME: str = "한결랩"
    CONTRACT_PARTY_B_CEO: str = "김경섭"
    CONTRACT_PARTY_B_BUSINESS_NUMBER: str = "328-79-00578"
    CONTRACT_PARTY_B_ADDRESS: str = "경기도 고양시 일산서구 고양대로 666 101-603"
    CONTRACT_PARTY_B_EMAIL: str = "kks@hankyeul.com"
    # /managed 쓰기 허용 영역(쉼표 구분: maintenance,points,inquiries,tasks,...).
    # 이관 절차상 cms 쪽 같은 기능의 쓰기를 막는 시점에 켠다. 비어 있으면 해당 화면은 읽기 전용.
    MANAGED_WRITE_AREAS: str = ""
    # 스케줄러: 켤 job 이름(쉼표). 비어 있으면 아무것도 돌지 않는다 — cms cron 줄을 끄는 날 같이 켠다(SPEC 11 §5).
    ENABLED_JOBS: str = ""
    # 맥미니 iMessage 전달기가 outbox 를 읽을 때 쓰는 서버간 키(없으면 /api/internal 은 503)
    INTERNAL_API_KEY: str = ""
    # 납부내역 → 매출 세금계산서 동기화 기준일(cms SYNC_START_DATE)
    TAX_SYNC_START_DATE: str = "2026-07-01"
    # 유지보수 프로젝트 정기 충전: 이 날짜 이전 회차는 따라잡기 대상에서 뺀다(과거 회차 일괄 충전 방지)
    POINT_CHARGE_CATCHUP_FROM: str = ""
    # 미팅 장소검색(카카오 지역검색). 비우면 주소 직접 입력
    KAKAO_REST_API_KEY: str = ""

    @property
    def managed_write_areas(self) -> set[str]:
        return {a.strip() for a in self.MANAGED_WRITE_AREAS.split(",") if a.strip()}

    @property
    def enabled_jobs(self) -> set[str]:
        return {a.strip() for a in self.ENABLED_JOBS.split(",") if a.strip()}

    @property
    def cors_origins(self) -> list[str]:
        origins = [self.FRONTEND_URL, "capacitor://localhost", "http://localhost", "https://hcms.hankyeul.com"]
        return origins

    @property
    def staff_origins(self) -> set[str]:
        """직원 쿠키 세션의 Origin 허용 — 웹 도메인만(앱·localhost 제외, 직원 화면은 앱에서 막혀 있다)."""
        origins = {"https://hcms.hankyeul.com"}
        if self.FRONTEND_URL.startswith("https://"):
            origins.add(self.FRONTEND_URL)
        return origins

    class Config:
        env_file = ENV_FILE


settings = Settings()
