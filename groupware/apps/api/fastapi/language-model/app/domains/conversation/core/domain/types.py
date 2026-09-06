"""도메인 Enum/Type (conversation 도메인). FastAPI/SQLAlchemy import 금지."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class MessageRole(str, Enum):
    USER = "USER"
    ASSISTANT = "ASSISTANT"
    SYSTEM = "SYSTEM"

    def to_openai(self) -> str:
        return self.value.lower()


@dataclass(frozen=True)
class IdentityRecord:
    """멀티테넌트 신원: 조직 소속원 개인별 세션 격리 키. 모든 호출에 관통.

    BFF 가 세션(getUser)에서 도출해 헤더(X-Organization-Id/X-User-Id)로 주입한다.
    """

    organization_id: str
    user_id: str


@dataclass(frozen=True)
class EffectiveAssistantConfig:
    """채팅 시점에 적용할 병합 설정: csc-groupware resolve(플랫폼 전역 + 조직 오버라이드)의 결과.

    enabled: 전역 킬스위치. False 면 어시스턴트 사용 불가.
    default_model: 조직 기본 모델. None 이면 카탈로그 기본(내장 Qwen)을 쓴다.
    system_prompt: 합성 시스템 프롬프트(공통 + 조직 추가). None = 기본값(prompts/ 자산) 사용.

    플랫폼 모델 화이트리스트는 없다: 어떤 모델을 쓸지는 조직이 정한다(설계: multi-tenancy.md).
    외부 모델은 조직 API 키 등록 여부가 실질 게이트라, 별도 허용 목록이 필요 없다.
    """

    enabled: bool
    default_model: str | None
    system_prompt: str | None

