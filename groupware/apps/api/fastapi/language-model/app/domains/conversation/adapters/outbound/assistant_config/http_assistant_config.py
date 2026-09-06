"""AssistantConfigResolverPort 구현: csc-groupware 내부 resolve 호출(서비스토큰 + TTL 캐시).

AI 어시스턴트 병합 설정(플랫폼 전역 + 조직 오버라이드)을 csc-groupware
`GET /internal/assistant-config/resolve?organizationId=` 로 해석한다. http_api_credential 과 동형
(ServiceHttpClient + create_service_token + org 키 TTL 캐시). csc-groupware 응답은 camelCase.

장애 degrade: csc-groupware 호출 실패 시 캐시가 있으면 그 값, 없으면 관용 기본값(enabled) 으로
폴백한다. 설정 서버 장애가 챗봇 자체를 끊지 않게(내부 모델 + 기본 프롬프트로 계속 동작). 킬스위치는
설정 서버가 살아 있을 때만 유효(fail-open).
"""

from __future__ import annotations

import time
from collections.abc import Callable

from csc_net_utils.http_client import ServiceHttpClient, ServiceHttpError

from ....core.domain.types import EffectiveAssistantConfig

_PERMISSIVE_DEFAULT = EffectiveAssistantConfig(
    enabled=True, default_model=None, system_prompt=None
)


def _parse(data: object) -> EffectiveAssistantConfig:
    if not isinstance(data, dict):
        return _PERMISSIVE_DEFAULT
    default_model = data.get("defaultModel")
    system_prompt = data.get("systemPrompt")
    return EffectiveAssistantConfig(
        enabled=bool(data.get("enabled", True)),
        default_model=str(default_model) if isinstance(default_model, str) else None,
        system_prompt=str(system_prompt) if isinstance(system_prompt, str) else None,
    )


class HttpAssistantConfigResolver:
    """AssistantConfigResolverPort 구현: language-model 서비스토큰으로 csc-groupware 호출."""

    def __init__(
        self,
        base_url: str,
        *,
        token_provider: Callable[[], str],
        ttl_s: int = 60,
        timeout: float = 10.0,
    ) -> None:
        self._client = ServiceHttpClient(
            base_url, token_provider=token_provider, timeout=timeout, retries=1
        )
        self._ttl = ttl_s
        # org -> (만료 epoch, config)
        self._cache: dict[str, tuple[float, EffectiveAssistantConfig]] = {}

    async def resolve(self, organization_id: str) -> EffectiveAssistantConfig:
        now = time.time()
        cached = self._cache.get(organization_id)
        if cached is not None and cached[0] > now:
            return cached[1]
        try:
            data = await self._client.get(
                f"/internal/assistant-config/resolve?organizationId={organization_id}"
            )
        except ServiceHttpError:
            # 설정 서버 장애 → 캐시가 있으면 그 값, 없으면 관용 기본값(챗봇 유지).
            return cached[1] if cached is not None else _PERMISSIVE_DEFAULT
        result = _parse(data)
        self._cache[organization_id] = (now + self._ttl, result)
        return result
