"""DI 조립: Depends provider 정의 (language-model).

AsyncSession 팩토리 + 도메인 서비스 provider + 프로세스 수명 InferencePort/ModelCatalog 싱글톤.
InferencePort 는 httpx client 를 보유하므로 lifespan 종료에서 aclose() 한다.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from .config import get_settings
from .domains.conversation.core.application.ports.inbound import ConversationInboundPort
from .domains.conversation.core.application.ports.outbound import AssistantConfigResolverPort
from .domains.conversation.module import (
    build_assistant_config_resolver,
    build_conversation_service,
)
from .domains.inference.core.application.model_catalog import ModelCatalog
from .domains.inference.core.application.ports.inbound import (
    ImageGenerationInboundPort,
    InferenceGenerationInboundPort,
)
from .domains.inference.core.application.services import (
    ImageGenerationService,
    InferenceGenerationService,
)
from .domains.inference.core.application.ports.outbound import (
    CredentialResolverPort,
    ImageGenerationPort,
    InferencePort,
)
from .domains.inference.module import (
    build_credential_resolver,
    build_image_generation,
    build_inference,
    build_model_catalog,
)
from .domains.retrieval.core.application.ports.inbound import RetrievalInboundPort
from .domains.retrieval.module import build_retrieval_service
from .shared.prompts.library import PromptLibrary

_settings = get_settings()
# DB 가 재시작하거나(배포/점검) 유휴 커넥션이 끊기면(pgbouncer/클라우드 PG idle timeout) 풀에 남은
#   커넥션은 죽어 있다. pre_ping 이 없으면 그걸 검사 없이 꺼내 써서 그 요청이 500 으로 죽는다.
#   증상은 `InterfaceError: connection is closed` 다.
_engine = create_async_engine(
    _settings.database_url,
    pool_pre_ping=True,
    pool_recycle=1800,
)
_session_factory = async_sessionmaker(_engine, expire_on_commit=False)

# 프로세스 수명 싱글톤(요청마다 재생성 금지: httpx client/세마포어/자격증명 캐시 보유).
_inference: InferencePort | None = None
_image: ImageGenerationPort | None = None
_catalog: ModelCatalog | None = None
_resolver: CredentialResolverPort | None = None
_assistant_config: AssistantConfigResolverPort | None = None
_prompts: PromptLibrary | None = None


def get_prompt_library() -> PromptLibrary:
    global _prompts
    if _prompts is None:
        s = get_settings()
        root = (
            Path(s.prompts_dir)
            if s.prompts_dir
            else Path(__file__).resolve().parent.parent / "prompts"
        )
        _prompts = PromptLibrary(root)
    return _prompts


def get_credential_resolver() -> CredentialResolverPort:
    global _resolver
    if _resolver is None:
        _resolver = build_credential_resolver(get_settings())
    return _resolver


def get_assistant_config_resolver() -> AssistantConfigResolverPort:
    global _assistant_config
    if _assistant_config is None:
        _assistant_config = build_assistant_config_resolver(get_settings())
    return _assistant_config


def get_inference() -> InferencePort:
    global _inference
    if _inference is None:
        _inference = build_inference(get_settings(), get_credential_resolver())
    return _inference


def get_image_generation() -> ImageGenerationPort:
    global _image
    if _image is None:
        _image = build_image_generation(get_settings(), get_credential_resolver())
    return _image


def get_model_catalog() -> ModelCatalog:
    global _catalog
    if _catalog is None:
        _catalog = build_model_catalog(get_settings())
    return _catalog


async def close_inference() -> None:
    global _inference, _image
    if _inference is not None:
        await _inference.aclose()
        _inference = None
    if _image is not None:
        await _image.aclose()
        _image = None


async def get_session() -> AsyncIterator[AsyncSession]:
    async with _session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def provide_conversation_service(
    session: AsyncSession,
) -> ConversationInboundPort:
    # ai-chat 기능의 시스템 프롬프트를 prompts/ 자산에서 렌더해 주입한다.
    system_prompt = get_prompt_library().render("chat-assistant")
    return build_conversation_service(
        session,
        get_inference(),
        get_model_catalog(),
        system_prompt,
        get_credential_resolver(),
        get_assistant_config_resolver(),
    )


def provide_inference_generation_service() -> InferenceGenerationInboundPort:
    # 무상태 생성: 세션 불필요. 프로세스 수명 inference/catalog 싱글톤 재사용.
    return InferenceGenerationService(get_inference(), get_model_catalog())


def provide_image_generation_service() -> ImageGenerationInboundPort:
    # 무상태 이미지 생성: 세션 불필요. 프로세스 수명 image/catalog 싱글톤 재사용.
    s = get_settings()
    return ImageGenerationService(
        get_image_generation(),
        get_model_catalog(),
        default_size=s.image_default_size,
        default_quality=s.image_default_quality,
        # 내장 엔진이 막히면 외부 모델로 강등(끊김 방지). 과금이 따르므로 env 로 끌 수 있다.
        external_fallback=s.image_external_fallback,
    )


async def provide_retrieval_service(
    session: AsyncSession,
) -> RetrievalInboundPort:
    s = get_settings()
    return build_retrieval_service(
        session,
        get_inference(),
        s.qdrant_url,
        s.qdrant_api_key,
        s.embedding_served_model_name,
    )
