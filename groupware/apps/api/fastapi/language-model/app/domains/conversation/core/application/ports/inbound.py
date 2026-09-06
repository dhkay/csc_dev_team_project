"""Inbound Port: 서비스 호출 계약 (router 가 사용). Protocol 로 선언."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Protocol

from .....inference.core.domain.types import GenerationChunkRecord, ModelSpecRecord
from ...domain.entities import ChatMessage, ChatSession
from ...domain.types import IdentityRecord


class ConversationInboundPort(Protocol):
    """조직 소속원 개인별 대화 세션/메시지 오케스트레이션 계약."""

    async def list_models(
        self, identity: IdentityRecord
    ) -> list[ModelSpecRecord]:
        """프론트 드롭다운용 chat 모델 카탈로그(백엔드 SSOT).

        외부(external) 모델은 조직 자격증명 등록 여부로 available 을 per-org 오버라이드한다.
        """
        ...

    async def resolve_default_model_key(self, identity: IdentityRecord) -> str:
        """이 조직의 기본 chat 모델 key: 조직 설정 → 카탈로그 기본(내장 Qwen).

        프론트가 새 대화를 시작할 때 무엇을 미리 고를지 정하는 값이다. 이게 없으면 프론트가
        자기 상수로 모델을 고르게 되고, 조직 기본 모델 설정이 화면에 반영되지 않는다.
        """
        ...

    async def create_session(
        self,
        identity: IdentityRecord,
        model: str | None,
        title: str | None,
        enable_thinking: bool = False,
    ) -> ChatSession: ...

    async def list_sessions(self, identity: IdentityRecord) -> list[ChatSession]: ...

    async def get_session(
        self, identity: IdentityRecord, session_id: str
    ) -> ChatSession | None: ...

    async def set_thinking(
        self, identity: IdentityRecord, session_id: str, enable_thinking: bool
    ) -> ChatSession: ...

    async def delete_session(self, identity: IdentityRecord, session_id: str) -> None: ...

    async def list_messages(
        self, identity: IdentityRecord, session_id: str
    ) -> list[ChatMessage]: ...

    def stream_turn(
        self,
        identity: IdentityRecord,
        session_id: str,
        user_text: str,
        model: str | None = None,
        enable_thinking: bool | None = None,
    ) -> AsyncIterator[GenerationChunkRecord]:
        """한 턴 스트리밍: 유저 메시지 저장 → (RAG) → 추론 스트림 → 어시스턴트 메시지 저장."""
        ...
