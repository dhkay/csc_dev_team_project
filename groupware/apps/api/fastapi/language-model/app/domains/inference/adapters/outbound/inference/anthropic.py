"""Anthropic Messages API InferencePort 어댑터 (외부 벤더 = Claude).

provider="anthropic" 로 라우팅되는 벤더별 어댑터. 조직 공용으로 등록된 Claude 키를 요청의
organization_id + credential_provider 로 csc-groupware 에서 per-request 해석(CredentialResolverPort)해
`POST {base}/v1/messages` 를 호출한다. 키는 전역 설정이 아니라 조직별 등록 키라 매 요청 resolver 로 가져온다.

멀티벤더 확장: 새 외부 벤더(OpenAI 등)는 이 파일을 본떠 벤더별 어댑터를 추가하고 module.py 레지스트리에
provider 키로 등록한다. 어느 자격증명을 쓸지는 카탈로그 spec.credential_provider 로 데이터화되어 요청에
실려오므로(req.credential_provider), 어댑터는 '와이어 포맷'만 벤더별로 구현하면 된다.

Anthropic 규약:
  - 헤더 x-api-key, anthropic-version.
  - system 메시지는 top-level system 으로 분리, max_tokens 필수, temperature 미전송(최신 모델 deprecated).
  - thinking 은 생략하지 않는다(생략하면 모델의 기본값이 사고 여부를 정해, 모델 교체가 곧 사고
    토글이 된다). 무엇을 실을지는 카탈로그가 선언한 제어 형식과 요청 의도로 정한다(core/domain/thinking.py).
    모델이 늘어도 이 파일은 그대로다.
  - 스트리밍 SSE: content_block_delta(text_delta)→토큰, message_start/message_delta→usage, message_stop→종료.
임베딩은 미지원(RAG 는 내부 엔진 사용).
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator

import httpx

from app.shared.adapters.outbound.http.client import create_http_client

from ....core.application.ports.outbound import CredentialResolverPort
from ....core.domain.errors import (
    CredentialNotConfiguredError,
    ExternalInferenceError,
    ExternalQuotaExceededError,
    ExternalRateLimitedError,
)
from ....core.domain.thinking import ThinkingControl
from ....core.domain.types import (
    EmbeddingRecord,
    EmbeddingRequestRecord,
    GenerationChunkRecord,
    GenerationRequestRecord,
    GenerationResultRecord,
    PromptMessageRecord,
    TokenUsage,
)

_ANTHROPIC_VERSION = "2023-06-01"

_log = logging.getLogger(__name__)


def _thinking_wire(req: GenerationRequestRecord) -> dict | None:
    """요청에 실을 thinking 값. None 이면 필드를 넣지 않는다.

    형식 판단은 카탈로그가 준 제어 형식(`thinking_control`)이 하고, 여기서는 옮기기만 한다.
    끌 수 없는 등급(FORCED)은 보낼 값이 없고, 예산은 요청을 만든 쪽이 이미 확보했다.
    """
    control = req.thinking_control
    if control is ThinkingControl.TOGGLE:
        return {"type": "adaptive" if req.enable_thinking else "disabled"}
    if control is ThinkingControl.OMIT and req.enable_thinking:
        # 켜 달라는데 이 모델은 그 형식으로 켤 수 없다. 조용히 무시하면 사고가 도는 줄 알고
        #   결과를 해석하게 되므로 남긴다(카탈로그 형식 선언이 모델과 어긋났다는 신호)
        _log.warning(
            "모델 '%s' 는 사고 요청을 받을 수 없어 무시한다(제어 형식 %s).", req.model, control.value
        )
    return None


# 시점의 문제로 거절한 상태. 429 rate_limit_error, 529 overloaded_error(벤더 문서).
_THROTTLE_STATUSES = frozenset({429, 529})

# 크레딧 부족은 전용 상태가 아니라 400 invalid_request_error 로 온다(실측 본문:
#   "Your credit balance is too low to access the Anthropic API. ..."). 이 문구가 유일한 신호다.
_LOW_CREDIT_MARK = "credit balance is too low"


async def _ensure_ok(resp: httpx.Response) -> None:
    """4xx/5xx 면 벤더 에러 본문까지 담아 예외로 올린다(raise_for_status 는 본문을 버려 진단 불가).

    한도와 크레딧 부족은 전용 예외로 가른다. 조치가 정반대라(기다리기 / 결제 채우기) 라우터가
    다른 상태와 문구로 내려야 한다. 그 밖은 일반 벤더 오류다.
    """
    if resp.status_code < 400:
        return
    body = await resp.aread()
    detail = body.decode("utf-8", "replace")[:500]
    message = f"Anthropic API {resp.status_code}: {detail}"
    if resp.status_code in _THROTTLE_STATUSES:
        raise ExternalRateLimitedError(message)
    if resp.status_code == 400 and _LOW_CREDIT_MARK in detail.lower():
        raise ExternalQuotaExceededError(message)
    raise ExternalInferenceError(message)


def _split_system(
    messages: list[PromptMessageRecord],
) -> tuple[str | None, list[dict[str, str]]]:
    """system 메시지를 top-level system 문자열로 분리, 나머지를 user/assistant 대화로."""
    system_parts: list[str] = []
    convo: list[dict[str, str]] = []
    for m in messages:
        if m.role == "system":
            system_parts.append(m.content)
        else:
            convo.append({"role": m.role, "content": m.content})
    system = "\n\n".join(p for p in system_parts if p) or None
    return system, convo


def _usage(raw: dict | None, *, prev_in: int = 0, prev_out: int = 0) -> TokenUsage | None:
    if not raw and not (prev_in or prev_out):
        return None
    raw = raw or {}
    prompt = raw.get("input_tokens", prev_in)
    completion = raw.get("output_tokens", prev_out)
    return TokenUsage(prompt=prompt, completion=completion, total=prompt + completion)


class AnthropicInference:
    """InferencePort 구현: Anthropic Messages API(조직별 키 per-request 해석)."""

    def __init__(
        self,
        *,
        resolver: CredentialResolverPort,
        base_url: str,
        timeout: float,
        default_max_tokens: int,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._resolver = resolver
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._default_max_tokens = default_max_tokens
        self._transport = transport  # 테스트 주입용(MockTransport). prod 는 None.

    def _client(self) -> httpx.AsyncClient:
        # 연결 수립 실패는 공용 클라이언트가 한 번 더 시도한다. 요청이 벤더에 닿은 뒤의 실패는
        # 재시도되지 않으므로 중복 과금이 생기지 않는다(client.py 주석 참고).
        return create_http_client(
            base_url=self._base_url, timeout=self._timeout, transport=self._transport
        )

    async def _api_key(self, req: GenerationRequestRecord) -> str:
        if not req.organization_id or not req.credential_provider:
            raise CredentialNotConfiguredError("조직 정보가 없어 외부 모델을 사용할 수 없습니다.")
        creds = await self._resolver.resolve(req.organization_id, req.credential_provider)
        api_key = (creds or {}).get("apiKey")
        if not api_key:
            raise CredentialNotConfiguredError("조직에 Claude API 키가 등록되지 않았습니다.")
        return api_key

    def _headers(self, api_key: str) -> dict[str, str]:
        return {
            "x-api-key": api_key,
            "anthropic-version": _ANTHROPIC_VERSION,
            "content-type": "application/json",
        }

    def _payload(self, req: GenerationRequestRecord, *, stream: bool) -> dict:
        system, messages = _split_system(req.messages)
        # temperature 는 보내지 않는다. 최신 Claude 모델(Opus 4.8 등)은 `temperature` 를
        # deprecated 처리해 400 을 반환한다. 챗봇은 temperature 를 노출하지 않으므로 벤더 기본값에 맡긴다.
        payload: dict = {
            "model": req.model,
            "max_tokens": req.max_tokens or self._default_max_tokens,
            "messages": messages,
            "stream": stream,
        }
        thinking = _thinking_wire(req)
        if thinking:
            payload["thinking"] = thinking
        if system:
            payload["system"] = system
        return payload

    async def generate(self, req: GenerationRequestRecord) -> GenerationResultRecord:
        api_key = await self._api_key(req)
        async with self._client() as client:
            resp = await client.post(
                "/v1/messages", json=self._payload(req, stream=False), headers=self._headers(api_key)
            )
            await _ensure_ok(resp)
            data = resp.json()
            blocks = data.get("content") or []
            text = "".join(
                b.get("text", "") for b in blocks if b.get("type") == "text"
            )
            if not text.strip():
                # 빈 본문은 성공이 아니다. 200 이지만 읽을 text 가 없는 형태(사고 전용 응답, 거부,
                #   줄바꿈 직후 잘림)라 그대로 돌려주면 소비자의 파싱 실패로 뒤집혀 보고된다
                raise ExternalInferenceError(
                    f"Anthropic 응답에 text 블록이 없다"
                    f"(stop_reason={data.get('stop_reason')},"
                    f" blocks={[b.get('type') for b in blocks]})"
                )
            return GenerationResultRecord(text=text, usage=_usage(data.get("usage")))

    async def stream(
        self, req: GenerationRequestRecord
    ) -> AsyncIterator[GenerationChunkRecord]:
        api_key = await self._api_key(req)
        in_tokens = 0
        out_tokens = 0
        finish: str | None = None
        async with self._client() as client:
            async with client.stream(
                "POST",
                "/v1/messages",
                json=self._payload(req, stream=True),
                headers=self._headers(api_key),
            ) as resp:
                await _ensure_ok(resp)
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    payload = line[len("data:") :].strip()
                    if not payload:
                        continue
                    try:
                        event = json.loads(payload)
                    except json.JSONDecodeError:
                        continue
                    etype = event.get("type")
                    if etype == "message_start":
                        usage = (event.get("message") or {}).get("usage") or {}
                        in_tokens = usage.get("input_tokens", in_tokens)
                    elif etype == "content_block_delta":
                        delta = event.get("delta") or {}
                        if delta.get("type") == "text_delta":
                            text = delta.get("text", "")
                            if text:
                                yield GenerationChunkRecord(delta=text)
                    elif etype == "message_delta":
                        d = event.get("delta") or {}
                        finish = d.get("stop_reason") or finish
                        usage = event.get("usage") or {}
                        out_tokens = usage.get("output_tokens", out_tokens)
                    elif etype == "message_stop":
                        break
        yield GenerationChunkRecord(
            delta="",
            finish_reason=finish or "stop",
            usage=_usage(None, prev_in=in_tokens, prev_out=out_tokens),
        )

    async def embed(self, req: EmbeddingRequestRecord) -> list[EmbeddingRecord]:
        raise NotImplementedError("Anthropic 은 임베딩을 제공하지 않습니다(RAG 는 내부 엔진 사용).")

    async def aclose(self) -> None:
        return None
