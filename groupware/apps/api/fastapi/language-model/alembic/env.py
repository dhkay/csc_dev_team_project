"""Alembic 마이그레이션 환경.

- 연결 URL 은 환경변수 DATABASE_URL 을 우선 사용한다(컨테이너/배포에서 db 호스트로 주입).
  미설정 시 alembic.ini 의 sqlalchemy.url 로 폴백.
- 앱이 asyncpg(비동기 드라이버)를 쓰므로 async 엔진으로 마이그레이션을 실행한다.
- language-model 는 도메인이 여럿이라 단일 공유 Base.metadata 를 target 으로 등록한다.
  각 도메인 models 모듈을 import 해야 테이블이 metadata 에 등록된다(아래 import).
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
from app.shared.adapters.outbound.db.base import Base

# 모델 모듈 import = 테이블을 Base.metadata 에 등록(autogenerate/create 대상).
from app.domains.conversation.adapters.outbound.db import models as _conversation_models  # noqa: F401
from app.domains.retrieval.adapters.outbound.db import models as _retrieval_models  # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 연결 URL: 환경변수(DATABASE_URL) 우선 → 없으면 앱 설정(.env 반영) → 그래도 없으면 alembic.ini.
_db_url = os.getenv("DATABASE_URL") or get_settings().database_url
if _db_url:
    config.set_main_option("sqlalchemy.url", _db_url)

target_metadata = Base.metadata


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
