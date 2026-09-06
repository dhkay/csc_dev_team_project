"""FastAPI() 부트스트랩: 실사용 표면(루트) + 검증 표면(/lab 서브앱).

data-collector = 외부 데이터 수집 서버. 두 개의 API 표면을 한 프로세스에서 낸다.

  루트   실사용. 소스마다 조회(`/…/latest`)와 재수집(`/…/refresh`)을 낸다. API 는 캐시 조회 +
         refresh enqueue 만 하고 실제 수집은 워커(app/worker.py)가 한다. 소스 목록의 단일
         출처는 app/source_catalog.py 이므로 여기 개수를 적지 않는다(적으면 곧 어긋난다).
  /lab   아직 실사용하지 않는 외부 API 검증 표면. 서브앱으로 분리한 이유는 문서 분리 하나뿐이다:
         자기 /lab/openapi.json 을 내어 scalar-gateway 가 별도 문서로 수집하므로, 포털 드롭다운에서
         실사용 API 와 테스트 API 가 섞이지 않는다.

내부 전용(서비스토큰): 공개 라우트 없음.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from sqlalchemy.ext.asyncio import AsyncSession

from csc_net_utils import CorrelationIdMiddleware, DEFAULT_EXEMPT_PREFIXES, ServiceTokenMiddleware

from .config import Settings, get_settings
from .container import (
    close_lab_clients,
    close_pool,
    get_session,
    init_pool,
    provide_collection_service,
    provide_lab_probe_service,
    provide_source_catalog,
)
from .domains.catalog.adapters.inbound.http.deps import get_source_catalog
from .domains.catalog.module import router as catalog_router
from .domains.datalab.adapters.inbound.http.router import (
    get_collection_service as get_datalab_collection_service,
)
from .domains.datalab.module import router as datalab_router
from .domains.google_search.adapters.inbound.http.router import (
    get_collection_service as get_google_search_collection_service,
)
from .domains.google_search.module import router as google_search_router
from .domains.google_trends.adapters.inbound.http.router import (
    get_collection_service as get_google_trends_collection_service,
)
from .domains.google_trends.module import router as google_trends_router
from .domains.nate.adapters.inbound.http.router import (
    get_collection_service as get_nate_collection_service,
)
from .domains.nate.module import router as nate_router
from .domains.naver_searchad.adapters.inbound.http.router import (
    get_collection_service as get_naver_searchad_collection_service,
)
from .domains.naver_searchad.module import router as naver_searchad_router
from .domains.naver_trend.adapters.inbound.http.router import (
    get_collection_service as get_naver_trend_collection_service,
)
from .domains.naver_trend.module import router as naver_trend_router
from .domains.wikipedia.adapters.inbound.http.router import (
    get_collection_service as get_wikipedia_collection_service,
)
from .domains.wikipedia.module import router as wikipedia_router
from .domains.youtube.adapters.inbound.http.router import (
    get_collection_service as get_youtube_collection_service,
)
from .domains.youtube.module import router as youtube_router
from .domains.lab.adapters.inbound.http.router import get_lab_probe_service
from .domains.lab.module import router as lab_router

LAB_MOUNT = "/lab"

# 서브앱의 문서 경로는 부모 미들웨어에게 "/lab/openapi.json" 이라는 절대경로로 보인다.
#   Starlette Mount 는 scope["path"] 를 다시 쓰지 않고 root_path 만 늘리기 때문이다. 그래서
#   DEFAULT_EXEMPT_PREFIXES 의 "/openapi.json" 은 마운트 아래에서 절대 매칭되지 않는다.
#   서브앱에 미들웨어를 한 벌 더 다는 방식도 답이 아니다(거기서도 path 는 여전히 절대경로다).
#   이 줄이 없으면 dev 에서 /lab/docs 가 조용히 401 이 된다. 포털은 토큰을 보내므로 안 드러난다.
_EXEMPT_PREFIXES = DEFAULT_EXEMPT_PREFIXES + tuple(
    f"{LAB_MOUNT}{prefix}" for prefix in DEFAULT_EXEMPT_PREFIXES
)

_DEV_SECRET_SENTINELS = {"dev-only-service-secret"}

# 실사용 수집 소스의 라우터와 서비스 스텁. 새 소스 = 여기 각각 한 줄.
_SOURCE_ROUTERS = (
    datalab_router,
    google_search_router,
    google_trends_router,
    nate_router,
    naver_searchad_router,
    naver_trend_router,
    wikipedia_router,
    youtube_router,
)
_COLLECTION_SERVICE_STUBS = (
    get_datalab_collection_service,
    get_google_search_collection_service,
    get_google_trends_collection_service,
    get_nate_collection_service,
    get_naver_searchad_collection_service,
    get_naver_trend_collection_service,
    get_wikipedia_collection_service,
    get_youtube_collection_service,
)


def _assert_secrets_configured(settings: Settings) -> None:
    """dev 외 환경에서 dev 기본 시크릿으로 기동하면 거부(fail-closed)."""
    if settings.app_env == "dev":
        return
    if settings.service_token_secret in _DEV_SECRET_SENTINELS:
        raise RuntimeError(
            f"{settings.app_env}: SERVICE_TOKEN_SECRET 미설정(dev 기본값). 기동 거부 (fail-closed)"
        )


@asynccontextmanager
async def _lifespan(app: FastAPI):
    # 마운트된 서브앱의 lifespan 은 실행되지 않는다. lab 의 httpx 풀도 여기서 닫는다.
    await init_pool()
    try:
        yield
    finally:
        await close_lab_clients()
        await close_pool()


def _create_lab_app(settings: Settings) -> FastAPI:
    is_dev = settings.app_env == "dev"
    lab = FastAPI(
        title=f"{settings.app_name} (lab)",
        description=(
            "아직 실사용하지 않는 외부 데이터 수집 API 검증 표면.\n\n"
            "업스트림 응답을 그대로 보여주는 것이 목적이라, 업스트림에 닿았다면 **응답 상태는 항상 200** 이고 "
            "업스트림의 4xx/5xx 는 `upstream.status` 로 드러난다. 우리 401(서비스토큰 거부)과 "
            "업스트림 401(네이버 스코프 미등록)은 고치는 방법이 전혀 다르기 때문이다.\n\n"
            "자격증명은 **플랫폼 키**(수집 서버 env)다. 조직 자격증명이 아니므로 여기 결과는 "
            "특정 조직의 자격 상태에 대한 근거가 아니다."
        ),
        docs_url="/docs" if is_dev else None,
        redoc_url="/redoc" if is_dev else None,
        openapi_url="/openapi.json" if settings.expose_openapi else None,
    )
    lab.dependency_overrides[get_lab_probe_service] = provide_lab_probe_service
    lab.include_router(lab_router)
    return lab


def create_app() -> FastAPI:
    settings = get_settings()
    _assert_secrets_configured(settings)

    is_dev = settings.app_env == "dev"
    app = FastAPI(
        title=settings.app_name,
        docs_url="/docs" if is_dev else None,
        redoc_url="/redoc" if is_dev else None,
        openapi_url="/openapi.json" if settings.expose_openapi else None,
        lifespan=_lifespan,
    )

    # 보안 Layer 3: 모든 요청에 X-Service-Token 검증(헬스/문서 경로는 제외).
    #   마운트된 /lab/* 도 이 스택을 통과한다(Mount 는 부모 라우터의 라우트이고 미들웨어가 그 라우터를 감싼다).
    app.add_middleware(
        ServiceTokenMiddleware,
        secret=settings.service_token_secret,
        allowed_services=settings.allowed_services_set,
        exempt_prefixes=_EXEMPT_PREFIXES,
    )

    # ServiceTokenMiddleware 보다 나중에 추가 = 더 바깥 → 토큰 거부(401) 응답에도
    # 상관관계 id 가 붙는다. 장애 조사에서 가장 보고 싶은 게 거부된 요청이다.
    app.add_middleware(CorrelationIdMiddleware)

    async def _collection_service(session: AsyncSession = Depends(get_session)):
        return await provide_collection_service(session)

    # 소스 라우터마다 자기 스텁을 갖는다(라우터 파일이 서로를 import 하지 않게). 오버라이드는
    #   여기 한 곳에서 같은 provider 로 묶는다.
    for stub in _COLLECTION_SERVICE_STUBS:
        app.dependency_overrides[stub] = _collection_service
    # 카탈로그 스텁은 하나뿐이다(catalog/.../deps.py). 카탈로그 라우트와 소스 라우트의 분야 검증이
    #   같은 키를 공유하므로 오버라이드도 한 번이면 된다.
    app.dependency_overrides[get_source_catalog] = provide_source_catalog

    app.include_router(catalog_router)
    for source_router in _SOURCE_ROUTERS:
        app.include_router(source_router)

    @app.get("/health", include_in_schema=False)
    async def health() -> dict[str, str]:
        # 토큰 면제 경로. 의도적으로 DB/redis 를 보지 않는다: 의존성까지 확인하면 순간적인
        #   PG 장애가 컨테이너 재시작 루프로 번진다. 준비성 확인이 필요하면 별도 경로를 판다.
        return {"status": "ok"}

    # lab 은 마지막에 마운트한다. 끄면 라우트 자체가 없어져 401 이 아니라 404 가 난다
    #   (표면이 없다는 사실이 응답으로 분명해진다).
    if settings.lab_enabled:
        app.mount(LAB_MOUNT, _create_lab_app(settings))

    return app


app = create_app()
