"""arq Worker 엔트리포인트 (video-ai-server, 무상태 컴퓨트): RAG 인제스트/임베딩용.

Phase 2 에서 문서 인제스트(청킹→임베딩(vLLM)→Qdrant upsert→language-model 콜백)를 여기에 채운다.
지금은 함수 없는 스캐폴드(기동만). 기동: `arq app.worker.WorkerSettings`.
같은 이미지를 API(uvicorn) / Worker(arq) 두 모드로 기동한다.
"""

from __future__ import annotations

from typing import Any

from arq.connections import RedisSettings

from .config import get_settings


async def on_startup(ctx: dict[str, Any]) -> None:
    # Phase 2: 워커 서비스(임베딩+Qdrant+콜백) 조립을 ctx 에 보관.
    return None


class WorkerSettings:
    functions: list = []  # Phase 2: [ingest_document]
    on_startup = on_startup
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    max_jobs = 2
    max_tries = 5
    job_timeout = 60 * 30
