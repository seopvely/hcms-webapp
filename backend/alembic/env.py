from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

from app.core.config import settings
from app.db.session import Base
import app.models  # noqa: F401  모델 등록(빈 metadata 로 autogenerate 하면 전체 DROP 이 생성됨)
import app.models.ai_dev_subscription  # noqa: F401

config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL.replace("%", "%%"))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# pacmsDB 는 Django(pacms)와 공유한다. pacms 테이블 구조는 Django 마이그레이션만 바꾼다.
# Alembic 은 아래 hcms 전용 테이블만 다룬다 — 새 hcms 전용 테이블을 만들면 여기에 추가.
HCMS_OWNED_TABLES = {
    "push_token",
    "free_maint_alert_log",
    "staff_session",
    "staff_audit_log",
}


def include_object(object, name, type_, reflected, compare_to):
    table = object if type_ == "table" else getattr(object, "table", None)
    table_name = getattr(table, "name", name)
    return table_name in HCMS_OWNED_TABLES


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
