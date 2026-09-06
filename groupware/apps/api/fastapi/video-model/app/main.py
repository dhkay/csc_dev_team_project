"""FastAPI() 부트스트랩 + 라우터 등록 + Depends provider 오버라이드 + 스위퍼 lifespan.

video-model = 미디어 작업 오케스트레이션 API. 별도 arq Worker(app/worker.py)가
video-ai-server 에서 실제 처리를 수행한다.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator

from fastapi import Depends, FastAPI
from sqlalchemy.ext.asyncio import AsyncSession

from .config import Settings, get_settings
from .container import (
    get_arq_pool,
    get_session,
    provide_video_job_service,
    run_video_reconcile_once,
)
from .domains.video.adapters.inbound.http.router import (
    get_video_job_service,
    pipeline_router as video_pipeline_router,
    router as video_router,
)
from csc_net_utils import CorrelationIdMiddleware, ServiceTokenMiddleware

_logger = logging.getLogger(__name__)

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
    settings = get_settings()
    stop = asyncio.Event()

    async def sweeper() -> None:
        # 리컨실리에이션: 콜백 유실/워커 사망으로 묶인 작업을 주기 복구.
        #
        # 실패를 삼키지 않고 남긴다. 예외를 먹으면 루프는 살지만 아무 일도 하지 않고, 그 상태에
        #   아무 신호가 없다. 이 루프가 렌더 복구의 유일한 주인이라(재큐잉 예산도 여기 있다) 조용히
        #   멈추면 모든 렌더가 '만드는 중' 으로 굳고, 원인을 찾는 사람은 워커부터 뒤지게 된다.
        #   루프는 계속 돌려야 한다: DB/redis 가 잠깐 끊긴 것뿐이면 다음 틱에 복구된다.
        while not stop.is_set():
            try:
                await run_video_reconcile_once()
            except Exception:  # noqa: BLE001 - 한 틱의 실패로 복구 루프를 끝내지 않는다.
                _logger.exception("렌더 리컨실리에이션 실패: 다음 틱에 다시 시도한다")
            with contextlib.suppress(asyncio.TimeoutError):
                await asyncio.wait_for(stop.wait(), timeout=settings.sweeper_interval_s)

    task = asyncio.create_task(sweeper())
    try:
        yield
    finally:
        stop.set()
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


def create_app() -> FastAPI:
    settings = get_settings()
    _assert_secrets_configured(settings)

    # OpenAPI 스펙은 전 환경 노출(통합 문서 포털 scalar-gateway 수집): 토큰 면제 + 내부망 한정.
    # 개별 Swagger UI/ReDoc 은 dev 에서만(통합 UI 는 포털이 담당).
    is_dev = settings.app_env == "dev"
    openapi_url = "/openapi.json" if settings.expose_openapi else None
    app = FastAPI(
        title=settings.app_name,
        lifespan=lifespan,
        docs_url="/docs" if is_dev else None,
        redoc_url="/redoc" if is_dev else None,
        openapi_url=openapi_url,
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

    # video: Inbound Port provider 오버라이드 (session + arq pool 주입).
    async def _video_job_service(session: AsyncSession = Depends(get_session)):
        pool = await get_arq_pool()
        return await provide_video_job_service(session, pool)

    app.dependency_overrides[get_video_job_service] = _video_job_service

    app.include_router(video_router)
    app.include_router(video_pipeline_router)
    return app


app = create_app()
