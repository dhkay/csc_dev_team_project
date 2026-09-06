"""Outbound Port: 재사용 LLM seam(엔진 비종속). Protocol 로 선언.

챗봇뿐 아니라 어떤 도메인/백엔드도 이 포트로 LLM 을 사용한다(단일 재사용 지점).
구현: OpenAICompatInference(vLLM/Ollama), EchoInference(stub), 동시성 래퍼.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Protocol

from ...domain.types import (
    EmbeddingRecord,
    EmbeddingRequestRecord,
    GenerationChunkRecord,
    GenerationRequestRecord,
    GenerationResultRecord,
    ImageEngineLoadRecord,
    ImageGenerationRequestRecord,
    ImageGenerationResultRecord,
)


class InferencePort(Protocol):
    """LLM 추론 아웃바운드 포트(엔진 비종속)."""

    async def generate(self, req: GenerationRequestRecord) -> GenerationResultRecord:
        """비스트리밍 생성(전체 텍스트 + usage)."""
        ...

    def stream(self, req: GenerationRequestRecord) -> AsyncIterator[GenerationChunkRecord]:
        """스트리밍 생성: 토큰 청크를 순차 방출(async generator)."""
        ...

    async def embed(self, req: EmbeddingRequestRecord) -> list[EmbeddingRecord]:
        """임베딩(RAG). Phase 1 stub 은 0 벡터."""
        ...

    async def aclose(self) -> None:
        """리소스 정리(httpx client 등). lifespan 종료에서 호출."""
        ...


class ImageGenerationPort(Protocol):
    """이미지 생성 아웃바운드 포트(벤더 비종속). 텍스트 InferencePort 와 별개 역량.

    구현: OpenAIImageInference(OpenAI Images API). 조직별 키를 organization_id +
    credential_provider 로 per-request 해석(CredentialResolverPort). 새 벤더 = 어댑터 추가.
    """

    async def generate(
        self, req: ImageGenerationRequestRecord
    ) -> ImageGenerationResultRecord:
        """이미지 1장 이상 생성(비스트리밍). 결과는 base64 이미지 목록."""
        ...

    async def load(self, provider: str | None = None) -> ImageEngineLoadRecord | None:
        """현재 엔진 부하(공유 큐). 큐 개념이 없는 벤더(요청만큼 확장)는 None.

        None 은 "모른다"가 아니라 "이 엔진엔 줄이 없다"는 뜻이다. 호출부(화면)는 그때 대기 안내를
        아예 띄우지 않는다. 조회 실패도 None 으로 접는다: 부하 표시는 보조 정보라, 이것 때문에
        생성 흐름이 막히면 안 된다.

        `provider` 는 라우팅 어댑터가 어느 엔진을 볼지 고르는 데 쓴다(generate 가 provider 를
        request 안에 담는 것과 대칭). 단일 엔진 leaf 어댑터는 이 인자를 무시한다.
        """
        ...

    async def aclose(self) -> None:
        """리소스 정리(httpx client 등). 현재 요청마다 client 를 열고 닫으므로 no-op."""
        ...


class CredentialResolverPort(Protocol):
    """조직 공용 외부 API 자격증명 해석 아웃바운드 포트.

    외부 provider(예: Claude)가 조직별로 등록된 키를 per-request 로 가져온다. 구현은
    csc-groupware `/internal/api-credentials/resolve` 를 서비스토큰으로 호출(짧은 TTL 캐시).
    provider = api-credential 프로바이더 식별자(예: "ANTHROPIC").
    """

    async def resolve(
        self, organization_id: str, provider: str
    ) -> dict[str, str] | None:
        """복호화된 자격증명 맵(예: {"apiKey": ...}) 또는 미등록 시 None."""
        ...

    async def has(self, organization_id: str, provider: str) -> bool:
        """유효 키 등록 여부(가용성 판정용)."""
        ...
