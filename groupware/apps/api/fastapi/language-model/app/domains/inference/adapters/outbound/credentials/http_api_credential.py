"""CredentialResolverPort 구현: csc-groupware 내부 resolve 호출(서비스토큰 + TTL 캐시).

조직 공용 외부 API 자격증명(예: Claude 키)을 csc-groupware
`GET /internal/api-credentials/resolve?organizationId=&provider=` 로 해석한다.
video-model 의 http_callback 토큰 배선과 동형(ServiceHttpClient + create_service_token).
매 요청 호출을 피하려 (org, provider) 키로 짧은 TTL 인메모리 캐시를 둔다.
"""

from __future__ import annotations

import time
from collections.abc import Callable

from csc_net_utils.http_client import ServiceHttpClient, ServiceHttpError


class HttpApiCredentialResolver:
    """CredentialResolverPort 구현: 신원 language-model 서비스토큰으로 csc-groupware 호출."""

    def __init__(
        self,
        base_url: str,
        *,
        token_provider: Callable[[], str],
        ttl_s: int = 60,
        timeout: float = 10.0,
    ) -> None:
        # ServiceHttpClient 는 요청마다 httpx client 를 열고 닫으므로 보관할 리소스가 없다.
        self._client = ServiceHttpClient(
            base_url, token_provider=token_provider, timeout=timeout, retries=1
        )
        self._ttl = ttl_s
        # (org, provider) -> (만료 epoch, 자격증명 맵 | None)
        self._cache: dict[tuple[str, str], tuple[float, dict[str, str] | None]] = {}

    async def resolve(
        self, organization_id: str, provider: str
    ) -> dict[str, str] | None:
        key = (organization_id, provider)
        now = time.time()
        cached = self._cache.get(key)
        if cached is not None and cached[0] > now:
            return cached[1]
        try:
            data = await self._client.get(
                f"/internal/api-credentials/resolve"
                f"?organizationId={organization_id}&provider={provider}"
            )
        except ServiceHttpError:
            # csc-groupware 장애 → 캐시가 있으면 그 값으로 degrade, 없으면 미등록(None) 취급.
            #   (외부 모델 가용성이 False 로 떨어질 뿐, 내부 모델은 정상.)
            return cached[1] if cached is not None else None
        result = data if isinstance(data, dict) else None
        self._cache[key] = (now + self._ttl, result)
        return result

    async def has(self, organization_id: str, provider: str) -> bool:
        creds = await self.resolve(organization_id, provider)
        return bool(creds and creds.get("apiKey"))
