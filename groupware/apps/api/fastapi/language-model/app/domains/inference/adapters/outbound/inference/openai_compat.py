"""InferencePort 구현: OpenAI 호환 엔진(vLLM / Ollama 공용).

같은 어댑터로 두 엔진을 모두 호출한다(엔진 교체 = INFERENCE_BASE_URL/카탈로그 config 만).
스트리밍은 httpx 의 client.stream 으로 `data:` SSE 라인을 파싱하고 `[DONE]` 에서 종료한다.
연결 끊김(클라 abort)은 상위 EventSourceResponse 가 제너레이터를 취소 → 이 스트림도 취소된다.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx

from app.shared.adapters.outbound.http.client import create_http_client

from ....core.domain.errors import (
    InferenceEngineTimeoutError,
    InferenceEngineUnavailableError,
)
from ....core.domain.types import (
    EmbeddingRecord,
    EmbeddingRequestRecord,
    GenerationChunkRecord,
    GenerationRequestRecord,
    GenerationResultRecord,
    TokenUsage,
)


def _messages_payload(req: GenerationRequestRecord) -> list[dict[str, str]]:
    return [{"role": m.role, "content": m.content} for m in req.messages]


def _usage(raw: dict | None) -> TokenUsage | None:
    if not raw:
        return None
    return TokenUsage(
        prompt=raw.get("prompt_tokens", 0),
        completion=raw.get("completion_tokens", 0),
        total=raw.get("total_tokens", 0),
    )


class OpenAICompatInference:
    """InferencePort 구현. 프로세스 수명 동안 httpx.AsyncClient 를 재사용한다."""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout: float = 120.0,
        enable_thinking: bool = False,
    ) -> None:
        # 자체 GPU 엔진(vLLM 등)이라 과금은 없지만, 기동 직후나 순간적인 연결 실패를 한 번 더
        # 시도해 살리는 값은 같다. 재시도는 연결 수립 단계뿐이다(client.py 주석 참고).
        self._client = create_http_client(
            base_url=base_url,
            timeout=timeout,
            headers={"Authorization": f"Bearer {api_key}"},
        )
        # Qwen3 등 하이브리드 사고 모델의 <think> 출력 제어. vLLM 은 chat_template_kwargs 로 존중,
        # Ollama/기타는 이 필드를 무시(무해). 챗봇 기본 = 사고 off(간결한 답).
        self._enable_thinking = enable_thinking

    def _think_kwargs(self, req: GenerationRequestRecord) -> dict:
        # 요청별 오버라이드(대화창 토글) 우선, 없으면 어댑터 기본값.
        enabled = self._enable_thinking if req.enable_thinking is None else req.enable_thinking
        return {"chat_template_kwargs": {"enable_thinking": enabled}}

    def _transport_error(self, exc: httpx.RequestError) -> Exception:
        """네트워크 레벨 실패를 도메인 에러로 승격: 단, 타임아웃과 연결 불가를 가른다.

        공유 엔진(csc-ai-vllm 은 dev/staging/prod 공용 GPU 1장)은 바쁠 때 거절하지 않고 큐에 담아
        느려진다. 그 지연은 `ReadTimeout` 으로 오는데, 이걸 '연결 실패'로 뭉뚱그리면 살아 있는 엔진의
        기동 상태를 뒤지게 된다(조치가 정반대). 논스트리밍 생성은 응답 전까지 바이트가 없어 read 타임아웃이
        사실상 '큐 대기 + 전체 디코드' 총 예산으로 동작하므로, 혼잡할수록 이 경로로 샌다.

        ReadTimeout 만 지연으로 본다. TimeoutException 에는 ConnectTimeout 도 포함되는데 그건
        '엔진에 닿지 못했다'는 뜻이라 의미가 정반대다(연결 불가). Write/Pool 도 우리 쪽/네트워크 문제다.
        """
        if isinstance(exc, httpx.ReadTimeout):
            return InferenceEngineTimeoutError(
                f"추론 엔진 응답 지연 ({self._client.base_url}, {self._client.timeout.read}s 초과): {exc}"
            )
        return InferenceEngineUnavailableError(
            f"추론 엔진 연결 실패 ({self._client.base_url}): {exc}"
        )

    async def generate(self, req: GenerationRequestRecord) -> GenerationResultRecord:
        body = {
            "model": req.model,
            "messages": _messages_payload(req),
            "temperature": req.temperature,
            "stream": False,
            **self._think_kwargs(req),
        }
        if req.max_tokens is not None:
            body["max_tokens"] = req.max_tokens
        try:
            resp = await self._client.post("/chat/completions", json=body)
            resp.raise_for_status()
        except httpx.RequestError as exc:  # 연결/타임아웃 = 엔진 미기동/네트워크
            raise self._transport_error(exc) from exc
        data = resp.json()
        text = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
        return GenerationResultRecord(text=text, usage=_usage(data.get("usage")))

    async def stream(
        self, req: GenerationRequestRecord
    ) -> AsyncIterator[GenerationChunkRecord]:
        body = {
            "model": req.model,
            "messages": _messages_payload(req),
            "temperature": req.temperature,
            "stream": True,
            "stream_options": {"include_usage": True},
            **self._think_kwargs(req),
        }
        if req.max_tokens is not None:
            body["max_tokens"] = req.max_tokens
        try:
            async with self._client.stream(
                "POST", "/chat/completions", json=body
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    payload = line[len("data:") :].strip()
                    if payload == "[DONE]":
                        break
                    try:
                        event = json.loads(payload)
                    except json.JSONDecodeError:
                        continue
                    choices = event.get("choices") or []
                    usage = _usage(event.get("usage"))
                    if not choices:
                        # usage-only 종료 청크(include_usage).
                        if usage is not None:
                            yield GenerationChunkRecord(delta="", finish_reason=None, usage=usage)
                        continue
                    choice = choices[0]
                    delta = (choice.get("delta") or {}).get("content") or ""
                    finish = choice.get("finish_reason")
                    if delta or finish or usage:
                        yield GenerationChunkRecord(
                            delta=delta, finish_reason=finish, usage=usage
                        )
        except httpx.RequestError as exc:  # 연결/타임아웃 = 엔진 미기동/네트워크
            raise self._transport_error(exc) from exc

    async def embed(self, req: EmbeddingRequestRecord) -> list[EmbeddingRecord]:
        try:
            resp = await self._client.post(
                "/embeddings", json={"model": req.model, "input": req.inputs}
            )
            resp.raise_for_status()
        except httpx.RequestError as exc:
            raise self._transport_error(exc) from exc
        data = resp.json()
        return [EmbeddingRecord(vector=item["embedding"]) for item in data.get("data", [])]

    async def aclose(self) -> None:
        await self._client.aclose()
