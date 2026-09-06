"""FastAPI() 부트스트랩: metrics-agent.

호스트당 1개로 떠서 CPU/GPU/VRAM/RAM 스냅샷(GET /metrics/snapshot)을 제공한다. DB 없음.
lifespan 에서 psutil cpu_percent 기준선을 워밍업해 첫 폴의 거짓 0% 를 피한다.
"""

from __future__ import annotations

import contextlib
from collections.abc import AsyncIterator

from fastapi import FastAPI

from csc_net_utils import CorrelationIdMiddleware, ServiceTokenMiddleware

from .config import Settings, get_settings
from .container import get_metrics_service_singleton, provide_metrics_service
from .domains.metrics.adapters.inbound.http.router import (
    get_metrics_service,
    router as metrics_router,
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
    # cpu_percent(interval=None) 첫 샘플 0.0 방지: 기동 시 기준선 워밍업.
    with contextlib.suppress(Exception):
        get_metrics_service_singleton().prime()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    _assert_secrets_configured(settings)

    is_dev = settings.app_env == "dev"
    openapi_url = "/openapi.json" if settings.expose_openapi else None
    app = FastAPI(
        title=settings.app_name,
        lifespan=lifespan,
        docs_url="/docs" if is_dev else None,
        redoc_url="/redoc" if is_dev else None,
        openapi_url=openapi_url,
    )

    # 보안 Layer 3: 모든 요청에 X-Service-Token 검증(헬스/문서 경로 제외).
    app.add_middleware(
        ServiceTokenMiddleware,
        secret=settings.service_token_secret,
        allowed_services=settings.allowed_services_set,
    )

    # ServiceTokenMiddleware 보다 나중에 추가 = 더 바깥 → 토큰 거부(401) 응답에도
    # 상관관계 id 가 붙는다. 장애 조사에서 가장 보고 싶은 게 거부된 요청이다.
    app.add_middleware(CorrelationIdMiddleware)

    app.dependency_overrides[get_metrics_service] = provide_metrics_service
    app.include_router(metrics_router)

    @app.get("/health", include_in_schema=False)
    async def health() -> dict[str, str]:
        # 토큰 면제 경로(DEFAULT_EXEMPT_PREFIXES): 컨테이너 헬스체크용.
        return {"status": "ok"}

    return app


app = create_app()
