"""FastAPI() 부트스트랩: language-model.

재사용 LLM 역량 API(추론/챗봇 세션/RAG). GPU 추론은 별도 vLLM 컨테이너(OpenAI 호환)로 위임.
lifespan 에서 InferencePort 싱글톤(httpx client)을 종료 정리한다.
"""

from __future__ import annotations

import contextlib
from collections.abc import AsyncIterator

from fastapi import Depends, FastAPI
from sqlalchemy.ext.asyncio import AsyncSession

from .config import Settings, get_settings
from .container import (
    close_inference,
    get_session,
    provide_conversation_service,
    provide_image_generation_service,
    provide_inference_generation_service,
    provide_retrieval_service,
)
from .domains.conversation.adapters.inbound.http.router import (
    get_conversation_service,
    router as conversation_router,
)
from .domains.inference.adapters.inbound.http.router import (
    get_image_generation_service,
    get_inference_generation_service,
    router as inference_router,
)
from .domains.retrieval.adapters.inbound.http.router import (
    get_retrieval_service,
    router as retrieval_router,
)
from csc_net_utils import CorrelationIdMiddleware, ServiceTokenMiddleware

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
    try:
        yield
    finally:
        # InferencePort(httpx client) 정리.
        with contextlib.suppress(Exception):
            await close_inference()


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

    # Inbound Port provider 오버라이드 (session 주입 + 싱글톤 inference/catalog).
    async def _conversation_service(session: AsyncSession = Depends(get_session)):
        return await provide_conversation_service(session)

    async def _retrieval_service(session: AsyncSession = Depends(get_session)):
        return await provide_retrieval_service(session)

    app.dependency_overrides[get_conversation_service] = _conversation_service
    app.dependency_overrides[get_retrieval_service] = _retrieval_service
    # 무상태 생성: 세션 불필요(동기 provider).
    app.dependency_overrides[get_inference_generation_service] = (
        provide_inference_generation_service
    )
    # 무상태 이미지 생성: 세션 불필요(동기 provider).
    app.dependency_overrides[get_image_generation_service] = (
        provide_image_generation_service
    )

    app.include_router(conversation_router)
    app.include_router(inference_router)
    app.include_router(retrieval_router)
    return app


app = create_app()
