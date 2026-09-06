"""Alembic 마이그레이션 환경 (async, DATABASE_URL 단일 출처).

- 접속 URL 은 alembic.ini 가 아니라 앱 설정(get_settings().database_url = DATABASE_URL)에서 가져온다.
  → 컨테이너 기동 시 `alembic upgrade head` 가 앱과 같은 DB(db:5432/file_upload)를 본다.
- asyncpg 드라이버라 async 엔진으로 실행한다.
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.config import get_settings
from app.domains.upload.adapters.outbound.db.models import Base

config = context.config
# alembic.ini 의 sqlalchemy.url 을 앱 설정값으로 덮어쓴다(단일 출처).
config.set_main_option("sqlalchemy.url", get_settings().database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
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


def run_migrations_online() -> None:
    asyncio.run(_run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
