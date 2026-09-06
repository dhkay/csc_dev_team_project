"""조회 도메인 엔티티: 읽기 모델.

수집 쪽 `LogEnvelope` 와 의도적으로 분리한다. 저장소가 채워 주는 값(ingested_at)과
kind 별 승격 컬럼(extra)이 있어 쓰기 모델과 형태가 다르고, 읽기 화면의 요구가
쓰기 계약을 오염시키면 안 되기 때문이다(CQRS).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any


@dataclass(frozen=True)
class LogRecord:
    """저장소에서 읽어온 로그 1건."""

    event_id: str
    occurred_at: datetime
    ingested_at: datetime
    environment: str
    service: str
    scope: str
    ai_tool: str | None
    organization_id: int | None
    kind: str
    level: str
    action: str
    message: str
    trace_id: str | None
    request_id: str | None
    job_id: str | None
    actor_type: str | None
    actor_id: int | None
    duration_ms: int | None
    token_input: int | None
    token_output: int | None
    payload: dict[str, Any] = field(default_factory=dict)
    #: kind 별 승격 컬럼(error_type/stack, before/after, method/path/status_code).
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class UsageBucket:
    """집계 1행: 조직×도구×액션의 하루치.

    버려지던 LLM 토큰 사용량이 여기로 모인다. 과금/쿼터의 근거가 되는 값.
    """

    day: date | None
    organization_id: int | None
    ai_tool: str | None
    action: str
    calls: int
    token_input: int
    token_output: int
    p95_duration_ms: float | None
