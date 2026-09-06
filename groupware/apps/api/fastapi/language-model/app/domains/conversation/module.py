"""도메인 DI wiring: Port -> 구현 바인딩 (conversation).

Repository + InferencePort + ModelCatalog -> ConversationService 조립.
"""

from __future__ import annotations

from csc_net_utils.service_token import create_service_token
from sqlalchemy.ext.asyncio import AsyncSession

from ..inference.core.application.model_catalog import ModelCatalog
from ..inference.core.application.ports.outbound import (
    CredentialResolverPort,
    InferencePort,
)
from .adapters.inbound.http.router import router
from .adapters.outbound.assistant_config.http_assistant_config import HttpAssistantConfigResolver
from .adapters.outbound.db.repository import ConversationRepository
from .core.application.ports.inbound import ConversationInboundPort
from .core.application.ports.outbound import AssistantConfigResolverPort
from .core.application.services import ConversationService

__all__ = ["router", "build_conversation_service", "build_assistant_config_resolver"]


def build_assistant_config_resolver(settings) -> AssistantConfigResolverPort:  # noqa: ANN001
    """AI 어시스턴트 병합 설정 resolver: csc-groupware 내부 엔드포인트를 language-model 신원으로 호출.

    조직 자격증명 resolver(build_credential_resolver)와 동형: 같은 groupware_url + 서비스토큰 + TTL.
    """

    def token() -> str:
        return create_service_token(
            settings.service_token_secret, settings.worker_service_name
        )

    return HttpAssistantConfigResolver(
        settings.groupware_url,
        token_provider=token,
        ttl_s=settings.credential_cache_ttl_s,
    )


def build_conversation_service(
    session: AsyncSession,
    inference: InferencePort,
    catalog: ModelCatalog,
    system_prompt: str,
    resolver: CredentialResolverPort | None = None,
    assistant_config: AssistantConfigResolverPort | None = None,
) -> ConversationInboundPort:
    repository = ConversationRepository(session)
    return ConversationService(
        repository, inference, catalog, system_prompt, resolver, assistant_config
    )
