"""Pydantic 요청/응답 DTO (conversation 도메인)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class CreateSessionRequest(BaseModel):
    model: str | None = None
    title: str | None = None
    enable_thinking: bool = False


class SetThinkingRequest(BaseModel):
    """대화창 사고형 추론(<think>) on/off 토글."""

    enable_thinking: bool


class StreamTurnRequest(BaseModel):
    text: str
    model: str | None = None
    # 이 턴에 적용할 사고형 추론 on/off(대화창 토글). None = 세션 저장값 유지.
    enable_thinking: bool | None = None


class SessionResponse(BaseModel):
    id: str
    title: str
    model: str
    enable_thinking: bool
    created_at: datetime | None
    updated_at: datetime | None


class MessageResponse(BaseModel):
    id: str
    role: str  # "user" | "assistant" | "system"
    content: str
    model: str | None = None
    created_at: datetime | None


class ModelResponse(BaseModel):
    """프론트 드롭다운 항목: 백엔드 카탈로그가 SSOT."""

    id: str  # 요청 model key
    label: str
    serving: str  # "self" | "api"
    vendor: str | None = None  # 제공 기업/브랜드(드롭다운 '기업' 그룹, 예: "Qwen", "Anthropic")
    available: bool
    supports_thinking: bool
    # 이 조직의 기본 모델(조직 설정 → 없으면 내장 Qwen)인지. 새 대화의 초기 선택이 된다.
    is_default: bool = False
    # 드롭다운 상세(선택: None 이면 프론트에서 미표시)
    params: str | None = None
    description: str | None = None
    context_length: int | None = None
