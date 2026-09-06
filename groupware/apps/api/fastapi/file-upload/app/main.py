"""FastAPI() 부트스트랩 + 라우터 등록 + Depends provider 오버라이드.

file-upload = 파일 업로드 / 오브젝트 스토리지 API. FFmpeg/영상 처리는 video-model 서버 담당.
"""

from __future__ import annotations

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession

from .config import Settings, get_settings
from .container import get_session, provide_storage_service, provide_upload_service
from .domains.upload.adapters.inbound.http.router import get_upload_service
from .domains.upload.adapters.inbound.http.storage_router import get_storage_service
from .domains.upload.module import (
    public_router,
    router as upload_router,
    storage_router,
)
from csc_net_utils import CorrelationIdMiddleware, DEFAULT_EXEMPT_PREFIXES, ServiceTokenMiddleware

_DEV_SECRET_SENTINELS = {"dev-only-service-secret", "dev-only-upload-secret"}


def _assert_secrets_configured(settings: Settings) -> None:
    """dev 외 환경에서 dev 기본 시크릿으로 기동하면 거부(fail-closed)."""
    if settings.app_env == "dev":
        return
    weak = [
        name
        for name, value in (
            ("SERVICE_TOKEN_SECRET", settings.service_token_secret),
            ("UPLOAD_URL_SECRET", settings.upload_url_secret),
        )
        if value in _DEV_SECRET_SENTINELS
    ]
    if weak:
        raise RuntimeError(
            f"{settings.app_env}: {', '.join(weak)} 미설정(dev 기본값). 기동 거부 (fail-closed)"
        )


def create_app() -> FastAPI:
    settings = get_settings()
    _assert_secrets_configured(settings)

    # OpenAPI 스펙은 전 환경 노출(통합 문서 포털 scalar-gateway 수집): 토큰 면제 + 내부망 한정.
    # 개별 Swagger UI/ReDoc 은 dev 에서만(통합 UI 는 포털이 담당).
    is_dev = settings.app_env == "dev"
    openapi_url = "/openapi.json" if settings.expose_openapi else None
    app = FastAPI(
        title=settings.app_name,
        docs_url="/docs" if is_dev else None,
        redoc_url="/redoc" if is_dev else None,
        openapi_url=openapi_url,
    )

    # 보안 Layer 3: 모든 요청에 X-Service-Token 검증(헬스/문서 경로는 제외).
    # 브라우저 직접 호출 경로(/blob PUT, /files GET)도 제외: nginx 공인 IP 제한 +
    # (/blob) 서명 업로드토큰으로 보호한다(브라우저는 서비스토큰을 가질 수 없음).
    app.add_middleware(
        ServiceTokenMiddleware,
        secret=settings.service_token_secret,
        allowed_services=settings.allowed_services_set,
        exempt_prefixes=(*DEFAULT_EXEMPT_PREFIXES, "/blob", "/files/"),
    )

    # ServiceTokenMiddleware 보다 나중에 추가 = 더 바깥 → 토큰 거부(401) 응답에도
    # 상관관계 id 가 붙는다. 장애 조사에서 가장 보고 싶은 게 거부된 요청이다.
    app.add_middleware(CorrelationIdMiddleware)

    # CORS: 브라우저 직접 PUT(/blob), GET(/files) 가 web 앱과 다른 origin 이므로 허용.
    # ServiceTokenMiddleware 보다 나중에 추가 = 더 바깥 → preflight(OPTIONS)를 토큰검사 전에 처리.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins_list,
        allow_methods=["GET", "PUT", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    async def _upload_service(session: AsyncSession = Depends(get_session)):
        return await provide_upload_service(session)

    async def _storage_service(session: AsyncSession = Depends(get_session)):
        return await provide_storage_service(session)

    app.dependency_overrides[get_upload_service] = _upload_service
    app.dependency_overrides[get_storage_service] = _storage_service

    app.include_router(upload_router)
    # 스토리지 화면(공통/조직/개인 파일 브라우저): web-groupware BFF 만 호출한다.
    app.include_router(storage_router)
    # 브라우저 직접 호출(/blob PUT, /files GET): 서비스토큰 예외(미들웨어) + nginx 공인 IP 제한.
    app.include_router(public_router)
    return app


app = create_app()
