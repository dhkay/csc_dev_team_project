"""OpenAI Images API ImageGenerationPort 어댑터 (외부 벤더 = OpenAI).

텍스트 어댑터(anthropic.py)와 동형: 조직 공용으로 등록된 OpenAI 키를 요청의 organization_id +
credential_provider 로 csc-groupware 에서 per-request 해석(CredentialResolverPort)해
`POST {base}/v1/images/generations` 를 호출한다. 키는 전역 설정이 아니라 조직별 등록 키라
매 요청 resolver 로 가져온다.

멀티벤더 확장: 새 이미지 벤더는 이 파일을 본떠 어댑터를 추가하고 module.py 에서 provider 로 배선한다.
어느 자격증명을 쓸지는 카탈로그 spec.credential_provider 로 데이터화되어 요청에 실려온다.

OpenAI 규약(gpt-image-1):
  - 헤더 Authorization: Bearer <key>.
  - body {model, prompt, size, quality, n[, moderation]}. 응답은 항상 b64_json(data[].b64_json).
"""

from __future__ import annotations

import json

import httpx

from app.shared.adapters.outbound.http.client import create_http_client

from ....core.application.ports.outbound import CredentialResolverPort
from ....core.domain.image_failure import ImageFailure, ImageGenerationFailedError
from ....core.domain.types import (
    ImageEngineLoadRecord,
    ImageGenerationRequestRecord,
    ImageGenerationResultRecord,
    ImageResultRecord,
    ImageTokenUsage,
)


def _supports_moderation(model: str) -> bool:
    """`moderation` 은 gpt-image 계열 전용: dall-e-* 에 보내면 unknown parameter 400 이 난다."""
    return model.startswith("gpt-image")


def _vendor_error(text: str) -> tuple[str, str, str]:
    """OpenAI 에러 본문 → (message, code, type). 파싱 실패/누락은 ''.

    형태: {"error": {"message": ..., "type": ..., "code": ...}}
    """
    try:
        data = json.loads(text)
    except (ValueError, TypeError):
        return "", "", ""
    err = data.get("error") if isinstance(data, dict) else None
    if not isinstance(err, dict):
        return "", "", ""

    def s(key: str) -> str:
        v = err.get(key)
        return v if isinstance(v, str) else ""

    return s("message"), s("code"), s("type")


# OpenAI 에러 code/type → 공용 사유. 벤더 지식은 여기(어댑터)에만 두고, 문구/상태는 카탈로그가 소유한다.
_BILLING_CODES = {"billing_hard_limit_reached", "insufficient_quota"}
_RATE_CODES = {"rate_limit_exceeded"}


def _classify(status: int, message: str, code: str, vendor_type: str) -> ImageFailure:
    """OpenAI 에러 → ImageFailure. 실측 형태 기준(code 우선, 없으면 상태/문구로 보강)."""
    if code in _BILLING_CODES or "billing" in vendor_type:
        return ImageFailure.QUOTA_EXCEEDED
    if status == 429 or code in _RATE_CODES:
        return ImageFailure.RATE_LIMITED
    if code == "moderation_blocked" or "safety system" in message:
        return ImageFailure.CONTENT_REJECTED
    return ImageFailure.VENDOR_ERROR


def _usage(raw: object) -> ImageTokenUsage | None:
    """OpenAI images usage → 도메인 사용량. 이미지 비용의 유일한 근거다.

    gpt-image 계열만 usage 를 준다(dall-e 는 없다) → 없으면 None 이고, 호출자는 그걸
    'usage-missing'(0 이 아니라 모름)으로 다룬다.

    형태: {"input_tokens": N, "output_tokens": N,
           "input_tokens_details": {"text_tokens": N, "image_tokens": N}}
    details 가 없으면 입력 전량을 텍스트로 본다. 이 파이프라인은 프롬프트만 보내고 입력 이미지를
    붙이지 않으므로 그게 실제와 맞다(단가가 싼 쪽으로 미는 임의 선택이 아니다).
    """
    if not isinstance(raw, dict):
        return None
    details = raw.get("input_tokens_details")
    details = details if isinstance(details, dict) else {}
    input_total = _as_int(raw.get("input_tokens"))
    input_image = _as_int(details.get("image_tokens"))
    input_text = _as_int(details.get("text_tokens")) or max(input_total - input_image, 0)
    return ImageTokenUsage(
        input_text=input_text,
        input_image=input_image,
        output_image=_as_int(raw.get("output_tokens")),
    )


def _as_int(value: object) -> int:
    """벤더 값이 숫자가 아니거나 없으면 0: NaN/None 이 비용 계산으로 흘러가면 금액이 깨진다."""
    return value if isinstance(value, int) and value >= 0 else 0


async def _ensure_ok(resp: httpx.Response) -> None:
    """4xx/5xx 면 벤더 사유를 공용 사유로 분류해 올린다(문구/상태는 카탈로그가 정한다)."""
    if resp.status_code < 400:
        return
    body = await resp.aread()
    text = body.decode("utf-8", "replace")
    message, code, vendor_type = _vendor_error(text)
    failure = _classify(resp.status_code, message, code, vendor_type)
    # 분류 못 한 경우만 원문이 진단 단서라 detail 로 남긴다(카탈로그가 그때만 문구에 덧붙인다).
    detail = message or f"OpenAI Images API {resp.status_code}: {text[:200]}"
    raise ImageGenerationFailedError(failure, detail)


class OpenAIImageInference:
    """ImageGenerationPort 구현: OpenAI Images API(조직별 키 per-request 해석)."""

    def __init__(
        self,
        *,
        resolver: CredentialResolverPort,
        base_url: str,
        timeout: float,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._resolver = resolver
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._transport = transport  # 테스트 주입용(MockTransport). prod 는 None.

    def _client(self) -> httpx.AsyncClient:
        # 이미지 생성은 호출당 과금이라 '보낸 요청'을 다시 보내면 곧바로 돈이 샌다.
        # 공용 클라이언트는 연결 수립 단계만 재시도하므로 그 위험이 없다(client.py 주석 참고).
        return create_http_client(
            base_url=self._base_url, timeout=self._timeout, transport=self._transport
        )

    async def _api_key(self, req: ImageGenerationRequestRecord) -> str:
        if not req.organization_id or not req.credential_provider:
            raise ImageGenerationFailedError(
                ImageFailure.CREDENTIAL_MISSING, "요청에 조직 정보가 없습니다"
            )
        creds = await self._resolver.resolve(req.organization_id, req.credential_provider)
        api_key = (creds or {}).get("apiKey")
        if not api_key:
            raise ImageGenerationFailedError(
                ImageFailure.CREDENTIAL_MISSING, f"{req.credential_provider} 키 미등록"
            )
        return api_key

    async def generate(
        self, req: ImageGenerationRequestRecord
    ) -> ImageGenerationResultRecord:
        api_key = await self._api_key(req)
        payload: dict[str, object] = {
            "model": req.model,
            "prompt": req.prompt,
            "size": req.size,
            "quality": req.quality,
            "n": req.n,
        }
        # 마케팅 영상 스틸은 브랜드/제품 묘사가 많아 기본 모더레이션(auto)이 과탐지로 거부하는 일이 잦다
        # ("Your request was rejected by the safety system"). OpenAI 가 이 오탐을 위해 제공하는 설정이
        # moderation='low' 다(끄는 게 아니라 덜 엄격하게: 실제 유해 요청은 여전히 차단된다).
        if _supports_moderation(req.model):
            payload["moderation"] = "low"
        headers = {"Authorization": f"Bearer {api_key}", "content-type": "application/json"}
        try:
            async with self._client() as client:
                resp = await client.post(
                    "/v1/images/generations", json=payload, headers=headers
                )
        except httpx.RequestError as exc:  # 연결/타임아웃 = 벤더 API 도달 불가
            raise ImageGenerationFailedError(
                ImageFailure.VENDOR_UNREACHABLE, f"{self._base_url}: {exc}"
            ) from exc
        await _ensure_ok(resp)
        data = resp.json()
        images = [
            ImageResultRecord(b64=item["b64_json"], mime="image/png")
            for item in (data.get("data") or [])
            if item.get("b64_json")
        ]
        if not images:
            raise ImageGenerationFailedError(
                ImageFailure.VENDOR_ERROR, "응답에 이미지가 없습니다"
            )
        return ImageGenerationResultRecord(images=images, usage=_usage(data.get("usage")))

    async def load(self, provider: str | None = None) -> ImageEngineLoadRecord | None:
        """외부 벤더는 우리가 줄 서는 큐가 없다(요청만큼 확장): 대기 안내를 띄울 것도 없다."""
        return None

    async def aclose(self) -> None:
        return None
