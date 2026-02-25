from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "mysql+pymysql://pacms:faQ7Yfh%24Uvr@192.168.0.10:3306/pacmsDB?charset=utf8mb4"
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    FRONTEND_URL: str = "http://localhost:8011"
    HOST: str = "0.0.0.0"
    PORT: int = 9011
    DEBUG: bool = True
    FIREBASE_CREDENTIALS_PATH: str = ""
    WEBHOOK_API_KEY: str = ""

    @property
    def cors_origins(self) -> list[str]:
        origins = [self.FRONTEND_URL, "capacitor://localhost", "http://localhost", "https://hcms.hankyeul.com"]
        return origins

    class Config:
        env_file = ".env"


settings = Settings()
