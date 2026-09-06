"""도메인 엔티티 → ClickHouse 행 변환. 이 방향 변환은 오직 여기서만 한다.

`payload` 안의 일부 필드는 전용 컬럼으로 승격된다(kind 별). JSON 안에 묻어두면
인덱싱도 집계도 안 되기 때문이다. 예: 에러의 error_type, 접근 로그의 status_code.
승격된 필드도 payload 원본에 그대로 남겨 재처리 시 정보 손실이 없게 한다.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from csc_log_contracts import LogEnvelope, LogKind


def to_row(envelope: LogEnvelope, kind: LogKind) -> list[Any]:
    """엔벨로프 → 행. 순서는 `tables.columns_for(kind)` 와 정확히 일치해야 한다."""
    payload = envelope.payload or {}
    row: list[Any] = [
        envelope.event_id,
        envelope.occurred_at,
        datetime.now(timezone.utc),  # ingested_at: ReplacingMergeTree 의 버전 컬럼
        envelope.environment,
        envelope.service,
        envelope.scope.value,
        # LowCardinality(String) 컬럼은 NULL 을 받지 않는다. 빈 문자열이 '없음' 센티넬.
        envelope.ai_tool.value if envelope.ai_tool else "",
        # 0 = 플랫폼 전역. 계약이 organization_id > 0 을 보장하므로 충돌하지 않는다.
        envelope.organization_id or 0,
        envelope.level.value,
        envelope.action,
        envelope.message,
        envelope.trace_id or "",
        envelope.request_id or "",
        envelope.job_id or "",
        envelope.actor.principal_type.value if envelope.actor else "",
        (envelope.actor.actor_id or 0) if envelope.actor else 0,
        envelope.duration_ms or 0,
        envelope.token_input or 0,
        envelope.token_output or 0,
        json.dumps(payload, ensure_ascii=False),
    ]
    row.extend(_extra_values(kind, payload))
    return row


def _extra_values(kind: LogKind, payload: dict[str, Any]) -> list[Any]:
    """kind 별 승격 컬럼 값. 누락 시 타입별 빈 값(NULL 미사용: 컬럼이 non-nullable)."""
    if kind is LogKind.ERROR:
        return [_text(payload.get("error_type")), _text(payload.get("stack"))]
    if kind is LogKind.AUDIT:
        return [_json_text(payload.get("before")), _json_text(payload.get("after"))]
    if kind is LogKind.ACCESS:
        return [
            _text(payload.get("method")),
            _text(payload.get("path")),
            _int(payload.get("status_code")),
        ]
    return []


def _text(value: Any) -> str:
    return "" if value is None else str(value)


def _json_text(value: Any) -> str:
    """감사 스냅샷: dict/list 는 JSON 문자열로, 없으면 빈 문자열."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False)


def _int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0
