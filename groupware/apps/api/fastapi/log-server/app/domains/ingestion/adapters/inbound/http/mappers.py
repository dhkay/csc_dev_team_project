"""DTO ↔ 도메인 엔티티 변환."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from csc_log_contracts import Actor, LogEnvelope, to_ai_tool_key

from ....core.domain.types import IngestReceipt
from .schemas import IngestResponse, LogRecordRequest, RejectedItem


def to_envelope(record: LogRecordRequest, default_environment: str) -> LogEnvelope:
    """요청 DTO → 엔벨로프.

    `ai_tool` 은 닫힌 집합 가드를 통과시킨다. 카탈로그에서 사라진 구 도구 key 가
    오래된 프로듀서에서 흘러들어와도 여기서 제거된다.
    """
    return LogEnvelope(
        kind=record.kind,
        level=record.level,
        scope=record.scope,
        service=record.service,
        action=record.action,
        message=record.message,
        event_id=record.event_id or uuid.uuid4(),
        occurred_at=_aware(record.occurred_at),
        ai_tool=to_ai_tool_key(record.ai_tool),
        organization_id=record.organization_id,
        trace_id=record.trace_id,
        request_id=record.request_id,
        job_id=record.job_id,
        actor=(
            Actor(
                principal_type=record.actor.principal_type,
                actor_id=record.actor.actor_id,
            )
            if record.actor
            else None
        ),
        payload=record.payload,
        duration_ms=record.duration_ms,
        token_input=record.token_input,
        token_output=record.token_output,
        environment=record.environment or default_environment,
    )


def to_ingest_response(receipt: IngestReceipt) -> IngestResponse:
    return IngestResponse(
        accepted=receipt.accepted,
        rejected=receipt.rejected_count,
        errors=[
            RejectedItem(reason=r.reason.value, detail=r.detail) for r in receipt.rejected
        ],
    )


def _aware(value: datetime | None) -> datetime:
    """naive 로 들어오면 UTC 로 간주: 프로듀서 구현 편차 흡수."""
    if value is None:
        return datetime.now(timezone.utc)
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
