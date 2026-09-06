"""엔벨로프 ↔ JSON 직렬화: HTTP 본문과 Kafka 페이로드가 같은 표현을 쓰게 한다.

프로듀서(HTTP 송신)와 컨슈머(Kafka 수신)가 서로 다른 코드로 dict 를 만들면 필드 하나가
조용히 어긋난다. 변환을 여기 한곳에 두어 그 표류를 원천 차단한다.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from .envelope import Actor, LogEnvelope
from .errors import InvalidEnvelopeError
from .types import AiToolKey, LogKind, LogLevel, LogScope, PrincipalType


def to_dict(envelope: LogEnvelope) -> dict[str, Any]:
    """엔벨로프 → JSON 직렬화 가능한 dict (None 필드도 명시적으로 남긴다)."""
    return {
        "event_id": str(envelope.event_id),
        "occurred_at": envelope.occurred_at.astimezone(timezone.utc).isoformat(),
        "kind": envelope.kind.value,
        "level": envelope.level.value,
        "scope": envelope.scope.value,
        "service": envelope.service,
        "ai_tool": envelope.ai_tool.value if envelope.ai_tool else None,
        "organization_id": envelope.organization_id,
        "action": envelope.action,
        "message": envelope.message,
        "trace_id": envelope.trace_id,
        "request_id": envelope.request_id,
        "job_id": envelope.job_id,
        "actor": (
            {
                "principal_type": envelope.actor.principal_type.value,
                "actor_id": envelope.actor.actor_id,
            }
            if envelope.actor
            else None
        ),
        "payload": envelope.payload,
        "duration_ms": envelope.duration_ms,
        "token_input": envelope.token_input,
        "token_output": envelope.token_output,
        "environment": envelope.environment,
    }


def from_dict(raw: dict[str, Any]) -> LogEnvelope:
    """dict → 엔벨로프. 형식 오류는 InvalidEnvelopeError 로 통일한다(DLQ 판정 단순화)."""
    try:
        actor_raw = raw.get("actor")
        actor = (
            Actor(
                principal_type=PrincipalType(actor_raw["principal_type"]),
                actor_id=actor_raw.get("actor_id"),
            )
            if actor_raw
            else None
        )
        ai_tool_raw = raw.get("ai_tool")
        return LogEnvelope(
            event_id=uuid.UUID(str(raw["event_id"])),
            occurred_at=_parse_datetime(raw["occurred_at"]),
            kind=LogKind(raw["kind"]),
            level=LogLevel(raw["level"]),
            scope=LogScope(raw["scope"]),
            service=raw["service"],
            ai_tool=AiToolKey(ai_tool_raw) if ai_tool_raw else None,
            organization_id=raw.get("organization_id"),
            action=raw["action"],
            message=raw.get("message", ""),
            trace_id=raw.get("trace_id"),
            request_id=raw.get("request_id"),
            job_id=raw.get("job_id"),
            actor=actor,
            payload=raw.get("payload") or {},
            duration_ms=raw.get("duration_ms"),
            token_input=raw.get("token_input"),
            token_output=raw.get("token_output"),
            environment=raw.get("environment", "dev"),
        )
    except InvalidEnvelopeError:
        raise
    except (KeyError, TypeError, ValueError) as exc:
        raise InvalidEnvelopeError(f"엔벨로프 역직렬화 실패: {exc}") from exc


def encode(envelope: LogEnvelope) -> bytes:
    """Kafka 값 인코딩 (UTF-8 JSON)."""
    return json.dumps(to_dict(envelope), ensure_ascii=False, separators=(",", ":")).encode()


def decode(payload: bytes) -> LogEnvelope:
    """Kafka 값 디코딩."""
    try:
        raw = json.loads(payload.decode())
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise InvalidEnvelopeError(f"엔벨로프 JSON 파싱 실패: {exc}") from exc
    if not isinstance(raw, dict):
        raise InvalidEnvelopeError("엔벨로프는 JSON 객체여야 합니다.")
    return from_dict(raw)


def _parse_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    # naive 로 들어오면 UTC 로 간주한다. 프로듀서 구현 편차 흡수.
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
