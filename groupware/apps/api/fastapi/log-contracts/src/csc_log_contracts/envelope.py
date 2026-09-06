"""로그 엔벨로프: 프로듀서/버퍼/컨슈머/저장소가 공유하는 단 하나의 계약.

3축(scope / kind / ai_tool+organization_id)이 한 엔벨로프의 차원으로 들어간다.
불변식 검증(`validate`)을 계약 안에 두어 프로듀서와 컨슈머가 같은 규칙을 쓴다
프로듀서가 놓쳐도 컨슈머가 잡아 DLQ 로 보낸다(이중 방어).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from typing import Any

from .errors import InvalidEnvelopeError
from .types import AiToolKey, LogKind, LogLevel, LogScope, PrincipalType, to_ai_tool_key


@dataclass(frozen=True)
class Actor:
    """행위 주체: 감사 로그의 '누가'."""

    principal_type: PrincipalType
    actor_id: int | None = None  # SERVICE 주체는 id 가 없다


@dataclass(frozen=True)
class LogEnvelope:
    """단일 로그 레코드. 모든 필드는 저장소 스키마 컬럼과 1:1 대응한다."""

    # ---- 분류 (필수) ----
    kind: LogKind
    level: LogLevel
    scope: LogScope
    service: str   # 프로듀서 신원: 서비스토큰 service 클레임과 같은 값
    action: str    # "video_job.status_changed": 점 표기 고정
    message: str

    # ---- 신원/시각 ----
    event_id: uuid.UUID = field(default_factory=uuid.uuid4)  # 중복제거 키
    occurred_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    # ---- 스코프 ----
    ai_tool: AiToolKey | None = None
    organization_id: int | None = None

    # ---- 상관관계 ----
    trace_id: str | None = None    # 요청 1건을 서비스 경계 너머로 꿰는 값
    request_id: str | None = None
    job_id: str | None = None
    actor: Actor | None = None

    # ---- 페이로드 + 승격 지표 ----
    payload: dict[str, Any] = field(default_factory=dict)
    duration_ms: int | None = None
    token_input: int | None = None   # LLM 사용량: 조직별 과금/쿼터의 근거
    token_output: int | None = None

    environment: str = "dev"

    def validate(self) -> None:
        """불변식 검증. 위반 시 InvalidEnvelopeError.

        수집 경로(서비스)와 적재 경로(워커) 양쪽에서 호출한다.
        """
        if not self.service:
            raise InvalidEnvelopeError("service 는 비어 있을 수 없습니다.")
        if not self.action:
            raise InvalidEnvelopeError("action 은 비어 있을 수 없습니다.")

        if self.scope is LogScope.ORGANIZATION and self.organization_id is None:
            raise InvalidEnvelopeError(
                "scope=ORGANIZATION 인 로그는 organization_id 가 필요합니다."
            )
        if self.scope is LogScope.AI_TOOL and self.ai_tool is None:
            raise InvalidEnvelopeError("scope=AI_TOOL 인 로그는 ai_tool 이 필요합니다.")
        if self.kind is LogKind.AUDIT and self.actor is None:
            raise InvalidEnvelopeError("kind=AUDIT 인 로그는 actor 가 필요합니다.")

        if self.organization_id is not None and self.organization_id <= 0:
            # 0 은 저장소에서 '플랫폼 전역' 센티넬이라 조직 id 로 쓸 수 없다.
            raise InvalidEnvelopeError("organization_id 는 양수여야 합니다.")
        if self.occurred_at.tzinfo is None:
            raise InvalidEnvelopeError("occurred_at 은 timezone-aware 여야 합니다(UTC).")

    def normalized(self) -> LogEnvelope:
        """저장 직전 정규화: 미지 도구 key 제거 + occurred_at UTC 통일.

        닫힌 집합 밖의 ai_tool 은 조용히 버린다(카탈로그에서 제거된 구 도구 key 방어).
        """
        return replace(
            self,
            ai_tool=to_ai_tool_key(self.ai_tool.value if self.ai_tool else None),
            occurred_at=self.occurred_at.astimezone(timezone.utc),
        )

    @property
    def partition_key(self) -> str:
        """Kafka 메시지 키: 조직 단위 순서 보장(조직 타임라인 조회의 전제).

        organization_id 가 없으면 0(플랫폼 전역), ai_tool 이 없으면 '-'.
        """
        org = self.organization_id if self.organization_id is not None else 0
        tool = self.ai_tool.value if self.ai_tool else "-"
        return f"{org}:{tool}"
