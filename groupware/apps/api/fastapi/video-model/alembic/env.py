"""Alembic 마이그레이션 환경.

- 연결 URL 은 환경변수 DATABASE_URL 을 우선 사용한다(컨테이너/배포에서 db 호스트로 주입).
  미설정 시 alembic.ini 의 sqlalchemy.url 로 폴백.
- 앱이 asyncpg(비동기 드라이버)를 쓰므로 async 엔진으로 마이그레이션을 실행한다.
- 도메인별 ORM 모델의 metadata 를 target_metadata 에 등록해
  `alembic revision --autogenerate` 가 변경을 감지하게 한다.
"""

from __future__ import annotations

import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.config import get_settings
from app.domains.video.adapters.outbound.db.models import Base as VideoBase

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 연결 URL: 환경변수(DATABASE_URL) 우선 → 없으면 앱 설정(.env 반영, get_settings) → 그래도 없으면 alembic.ini.
# 앱과 동일한 DSN 을 쓰게 해 "서버는 되는데 alembic 은 딴 DB" 류의 드리프트를 막는다.
_db_url = os.getenv("DATABASE_URL") or get_settings().database_url
if _db_url:
    config.set_main_option("sqlalchemy.url", _db_url)

# autogenerate 대상: 도메인별 Base.metadata.
target_metadata = VideoBase.metadata


def _do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def _run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(_do_run_migrations)
    await connectable.dispose()


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(_run_async_migrations())
