"""FastAPI() 부트스트랩 + 라우터 등록 + Depends provider 오버라이드 + 커넥션 lifespan.

log-server = 로그 수집/조회 API. 별도 컨슈머 프로세스(app/worker.py)가 Kafka 에서 꺼내
ClickHouse 에 적재한다. 같은 이미지, 다른 command.
"""

from __future__ import annotations

import contextlib
from collections.abc import AsyncIterator

from fastapi import FastAPI

from csc_net_utils import CorrelationIdMiddleware, ServiceTokenMiddleware

from .config import Settings, get_settings
from .container import (
    provide_log_ingestion_service,
    provide_log_query_service,
    start_resources,
    stop_resources,
)
from .domains.ingestion.adapters.inbound.http.router import (
    get_log_ingestion_service,
    router as ingestion_router,
)
from .domains.query.adapters.inbound.http.router import (
    get_log_query_service,
    router as query_router,
)

_DEV_SECRET_SENTINELS = {"dev-only-service-secret", "dev-only-upload-secret"}


def _assert_secrets_configured(settings: Settings) -> None:
    """dev 외 환경에서 dev 기본 시크릿으로 기동하면 거부(fail-closed)."""
    if settings.app_env == "dev":
        return
    if settings.service_token_secret in _DEV_SECRET_SENTINELS:
        raise RuntimeError(
            f"{settings.app_env}: SERVICE_TOKEN_SECRET 미설정(dev 기본값). 기동 거부 (fail-closed)"
        )


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    await start_resources()
    try:
        yield
    finally:
        # 종료 시 프로듀서 버퍼를 flush 한다. 마지막 로그가 사라지는 걸 막는다.
        with contextlib.suppress(Exception):
            await stop_resources()


def create_app() -> FastAPI:
    settings = get_settings()
    _assert_secrets_configured(settings)

    is_dev = settings.app_env == "dev"
    app = FastAPI(
        title=settings.app_name,
        lifespan=lifespan,
        docs_url="/docs" if is_dev else None,
        redoc_url="/redoc" if is_dev else None,
        openapi_url="/openapi.json" if settings.expose_openapi else None,
    )

    # 보안 Layer 3: 모든 요청에 X-Service-Token 검증(헬스/문서 경로는 제외).
    app.add_middleware(
        ServiceTokenMiddleware,
        secret=settings.service_token_secret,
        allowed_services=settings.allowed_services_set,
    )

    # ServiceTokenMiddleware 보다 나중에 추가 = 더 바깥 → 토큰 거부(401) 응답에도
    # 상관관계 id 가 붙는다. 장애 조사에서 가장 보고 싶은 게 거부된 요청이다.
    app.add_middleware(CorrelationIdMiddleware)

    app.dependency_overrides[get_log_ingestion_service] = provide_log_ingestion_service
    app.dependency_overrides[get_log_query_service] = provide_log_query_service

    app.include_router(ingestion_router)
    app.include_router(query_router)
    return app


app = create_app()
