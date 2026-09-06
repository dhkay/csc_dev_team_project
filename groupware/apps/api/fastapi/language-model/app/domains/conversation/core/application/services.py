"""Inbound Port 구현 = 대화 오케스트레이션.

외부(FastAPI/SQLAlchemy/httpx)를 모르고 Outbound Port(Repository) + InferencePort(재사용 LLM
seam) + ModelCatalog 만 주입받는다. stream_turn 이 핵심: 유저 메시지 저장 → (Phase 2 RAG 검색)
→ 프롬프트 빌드 → 추론 스트림 방출 → 완료 시 어시스턴트 메시지 저장.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from dataclasses import replace
from datetime import datetime, timezone

from ....inference.core.application.model_catalog import ModelCatalog
from ....inference.core.application.ports.outbound import (
    CredentialResolverPort,
    InferencePort,
)
from ....inference.core.domain.errors import CredentialNotConfiguredError
from ....inference.core.domain.thinking import output_budget, thinking_runs
from ....inference.core.domain.types import (
    GenerationChunkRecord,
    GenerationRequestRecord,
    ModelSpecRecord,
    PromptMessageRecord,
    TokenUsage,
)
from ..domain.entities import ChatMessage, ChatSession
from ..domain.errors import AssistantDisabledError
from ..domain.types import EffectiveAssistantConfig, IdentityRecord, MessageRole
from .ports.outbound import AssistantConfigResolverPort, ConversationRepositoryPort

_DEFAULT_TITLE = "새 대화"


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ConversationService:
    def __init__(
        self,
        repository: ConversationRepositoryPort,
        inference: InferencePort,
        catalog: ModelCatalog,
        system_prompt: str,
        resolver: CredentialResolverPort | None = None,
        assistant_config: AssistantConfigResolverPort | None = None,
    ) -> None:
        self._repository = repository
        self._inference = inference
        self._catalog = catalog
        # 시스템 프롬프트는 prompts/ 자산에서 렌더돼 주입된다(코어는 파일/로더를 모른다).
        # AI 어시스턴트 설정(플랫폼+조직 병합)이 조직별 프롬프트를 주면 그걸 우선하고, 없으면 이 기본값.
        self._system_prompt = system_prompt
        self._resolver = resolver
        self._assistant_config = assistant_config

    async def _resolve_config(self, organization_id: str) -> EffectiveAssistantConfig | None:
        """조직별 병합 설정 해석(리졸버 없으면 None → 기존 동작 유지)."""
        if self._assistant_config is None:
            return None
        return await self._assistant_config.resolve(organization_id)

    async def list_models(self, identity: IdentityRecord) -> list[ModelSpecRecord]:
        """프론트 드롭다운용 chat 모델 카탈로그(백엔드 SSOT).

        외부 벤더 모델(credential_provider 있음)은 조직의 해당 키 등록 여부로 available 을 per-org
        오버라이드한다(등록 조직만 선택 가능, 미등록은 '준비중' 비활성). 내부(self) 모델은 그대로.
        플랫폼 허용 목록으로 좁히는 단계는 없다: 모델 선택은 조직 몫이고, 외부 모델은 조직 키
        등록 여부가 실질 게이트다.
        """
        cfg = await self._resolve_config(identity.organization_id)
        # 전역 킬스위치가 꺼져 있으면 선택 가능한 모델이 없다(빈 목록).
        if cfg is not None and not cfg.enabled:
            return []
        specs = self._catalog.chat_models()
        if self._resolver is None:
            return specs
        out: list[ModelSpecRecord] = []
        for spec in specs:
            if spec.credential_provider:
                has = await self._resolver.has(
                    identity.organization_id, spec.credential_provider
                )
                out.append(replace(spec, available=spec.available and has))
            else:
                out.append(spec)
        return out

    async def resolve_default_model_key(self, identity: IdentityRecord) -> str:
        """이 조직의 기본 chat 모델 key: 조직 설정 → 카탈로그 기본(내장 Qwen).

        resolve_chat 이 미지/비활성 key 를 카탈로그 기본으로 흡수하므로, 조직이 지운 모델을
        가리키고 있어도 유효한 key 가 나온다.
        """
        cfg = await self._resolve_config(identity.organization_id)
        spec = self._catalog.resolve_chat(
            cfg.default_model if cfg else None, identity.organization_id
        )
        return spec.key

    async def create_session(
        self,
        identity: IdentityRecord,
        model: str | None,
        title: str | None,
        enable_thinking: bool = False,
    ) -> ChatSession:
        # model 은 요청 key(예: "internal-qwen3")를 저장: 실제 served 이름은 매 턴 카탈로그로 resolve.
        # 요청이 모델을 안 주면 조직 기본 모델 → (그것도 없으면) 카탈로그 기본(내장 Qwen) 순으로 떨어진다.
        # 이 폴백이 없으면 조직 기본 모델 설정이 새 대화에 반영되지 않는다(요청 모델이 늘 우선이므로).
        if model is None:
            cfg = await self._resolve_config(identity.organization_id)
            model = cfg.default_model if cfg else None
        spec = self._catalog.resolve_chat(model, identity.organization_id)
        now = _now()
        session = ChatSession(
            id=str(uuid.uuid4()),
            organization_id=identity.organization_id,
            user_id=identity.user_id,
            title=(title or _DEFAULT_TITLE).strip() or _DEFAULT_TITLE,
            model=spec.key,
            enable_thinking=enable_thinking,
            created_at=now,
            updated_at=now,
        )
        return await self._repository.create_session_record(session)

    async def list_sessions(self, identity: IdentityRecord) -> list[ChatSession]:
        return await self._repository.find_session_records(
            identity.organization_id, identity.user_id
        )

    async def get_session(
        self, identity: IdentityRecord, session_id: str
    ) -> ChatSession | None:
        return await self._repository.find_session_record(
            identity.organization_id, identity.user_id, session_id
        )

    async def set_thinking(
        self, identity: IdentityRecord, session_id: str, enable_thinking: bool
    ) -> ChatSession:
        session = await self._require_session(identity, session_id)
        session.enable_thinking = enable_thinking
        session.updated_at = _now()
        return await self._repository.update_session_record(session)

    async def delete_session(self, identity: IdentityRecord, session_id: str) -> None:
        await self._repository.delete_session_record(
            identity.organization_id, identity.user_id, session_id
        )

    async def list_messages(
        self, identity: IdentityRecord, session_id: str
    ) -> list[ChatMessage]:
        await self._require_session(identity, session_id)  # 테넌트 격리 강제
        return await self._repository.find_message_records(session_id)

    async def stream_turn(
        self,
        identity: IdentityRecord,
        session_id: str,
        user_text: str,
        model: str | None = None,
        enable_thinking: bool | None = None,
    ) -> AsyncIterator[GenerationChunkRecord]:
        session = await self._require_session(identity, session_id)
        # 대화창 사고 토글이 넘어오면 이 대화의 저장값을 갱신(재진입 시 복원되도록 영속).
        if enable_thinking is not None:
            session.enable_thinking = enable_thinking

        # AI 어시스턴트 병합 설정(플랫폼 전역 + 조직) 해석: 킬스위치/조직 기본 모델/프롬프트.
        cfg = await self._resolve_config(identity.organization_id)
        if cfg is not None and not cfg.enabled:
            raise AssistantDisabledError("AI 어시스턴트가 비활성화되어 있습니다.")

        # 모델 선택: 요청/세션 모델 → 조직 기본 모델 → 카탈로그 기본(내장 Qwen).
        model_key = model or session.model or (cfg.default_model if cfg else None)
        spec = self._catalog.resolve_chat(model_key, identity.organization_id)
        # 외부 벤더 모델은 조직 자격증명이 필수: 미등록이면 유저 메시지 저장 전에 명확히 실패.
        if spec.credential_provider and self._resolver is not None:
            if not await self._resolver.has(
                identity.organization_id, spec.credential_provider
            ):
                raise CredentialNotConfiguredError(
                    f"조직에 {spec.vendor or '외부'} API 키가 등록되지 않았습니다."
                )

        now = _now()
        await self._repository.create_message_record(
            ChatMessage(
                id=str(uuid.uuid4()),
                session_id=session.id,
                role=MessageRole.USER,
                content=user_text,
                created_at=now,
            )
        )

        history = await self._repository.find_message_records(session.id)

        # 시스템 프롬프트: 병합 설정이 조직/공통 프롬프트를 주면 우선, 없으면 기본(prompts/ 자산).
        system_prompt = cfg.system_prompt if (cfg and cfg.system_prompt) else self._system_prompt
        messages = [PromptMessageRecord(role="system", content=system_prompt)]
        messages += [
            PromptMessageRecord(role=m.role.to_openai(), content=m.content)
            for m in history
        ]
        req = GenerationRequestRecord(
            model=spec.served_model_name,
            messages=messages,
            # 미지정 = 어댑터 기본값. 사고가 도는 경우에만 창 전체를 받아, 사고가 답을 밀어내지 않게 한다.
            max_tokens=output_budget(
                None,
                thinking=thinking_runs(spec.thinking, session.enable_thinking),
                window=spec.max_output_tokens,
            ),
            stream=True,
            enable_thinking=session.enable_thinking,
            thinking_control=spec.thinking,  # 카탈로그가 선언한 사고 제어 형식 → 벤더 어댑터가 옮긴다.
            provider=spec.provider,  # 카탈로그 provider(벤더 id) → RoutingInference 디스패치 키.
            organization_id=identity.organization_id,
            credential_provider=spec.credential_provider,  # 외부 어댑터의 조직 키 해석용.
        )

        parts: list[str] = []
        usage: TokenUsage | None = None
        async for chunk in self._inference.stream(req):
            if chunk.delta:
                parts.append(chunk.delta)
            if chunk.usage is not None:
                usage = chunk.usage
            yield chunk

        assistant_text = "".join(parts)
        await self._repository.create_message_record(
            ChatMessage(
                id=str(uuid.uuid4()),
                session_id=session.id,
                role=MessageRole.ASSISTANT,
                content=assistant_text,
                model=model_key,
                token_usage=usage,
                created_at=_now(),
            )
        )

        # 첫 턴이면 제목을 유저 입력으로 자동 설정.
        prior_count = len(history) - 1  # 방금 저장한 유저 메시지 제외
        if prior_count <= 0 and session.title in ("", _DEFAULT_TITLE):
            session.title = user_text.strip()[:40] or _DEFAULT_TITLE
        session.updated_at = _now()
        await self._repository.update_session_record(session)

    async def _require_session(
        self, identity: IdentityRecord, session_id: str
    ) -> ChatSession:
        session = await self._repository.find_session_record(
            identity.organization_id, identity.user_id, session_id
        )
        if session is None:
            raise LookupError(session_id)
        return session
