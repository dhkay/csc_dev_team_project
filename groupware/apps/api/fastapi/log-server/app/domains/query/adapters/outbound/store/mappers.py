"""ClickHouse 행 → 도메인 엔티티 변환. 이 방향 변환은 오직 여기서만 한다."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from csc_log_contracts import LogKind

from app.shared.adapters.outbound.clickhouse.tables import EXTRA_COLUMNS_BY_KIND

from ....core.domain.entities import LogRecord, UsageBucket


def _as_utc(value: datetime) -> datetime:
    """naive datetime 에 UTC 를 명시한다. 저장 컬럼이 `DateTime64(3, 'UTC')` 이므로 값은 UTC 다.

    이 변환이 없으면 드라이버가 준 naive 값이 그대로 JSON 으로 나가 offset 이 없는 문자열
    ('2026-07-30T23:14:26.956000')이 된다. 그러면 브라우저가 그걸 로컬 시간으로 해석해
    한국 사용자에게 9시간 이른 시각이 표시된다(실제로 그렇게 어긋나 있었다).
    tz 를 붙여 보내면 표시 변환은 각 클라이언트가 자기 지역으로 알아서 한다.
    """
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def to_log_record(row: dict[str, Any], kind: LogKind) -> LogRecord:
    """행(dict) → LogRecord.

    저장소는 non-nullable 컬럼에 센티넬(빈 문자열/0)을 쓴다. 도메인으로 올라올 때
    None 으로 되돌려 "값 없음"과 "값이 0"을 호출자가 구분할 수 있게 한다.
    """
    return LogRecord(
        event_id=str(row["event_id"]),
        occurred_at=_as_utc(row["occurred_at"]),
        ingested_at=_as_utc(row["ingested_at"]),
        environment=row["environment"],
        service=row["service"],
        scope=row["scope"],
        ai_tool=_none_if_blank(row.get("ai_tool")),
        organization_id=_none_if_zero(row.get("organization_id")),
        kind=kind.value,
        level=row["level"],
        action=row["action"],
        message=row["message"],
        trace_id=_none_if_blank(row.get("trace_id")),
        request_id=_none_if_blank(row.get("request_id")),
        job_id=_none_if_blank(row.get("job_id")),
        actor_type=_none_if_blank(row.get("actor_type")),
        actor_id=_none_if_zero(row.get("actor_id")),
        duration_ms=_none_if_zero(row.get("duration_ms")),
        token_input=_none_if_zero(row.get("token_input")),
        token_output=_none_if_zero(row.get("token_output")),
        payload=_parse_json(row.get("payload")),
        extra={
            column: row[column]
            for column in EXTRA_COLUMNS_BY_KIND[kind]
            if row.get(column) not in (None, "", 0)
        },
    )


def to_usage_bucket(row: dict[str, Any]) -> UsageBucket:
    return UsageBucket(
        day=row.get("day"),
        organization_id=_none_if_zero(row.get("organization_id")),
        ai_tool=_none_if_blank(row.get("ai_tool")),
        action=row.get("action", ""),
        calls=int(row.get("calls") or 0),
        token_input=int(row.get("token_input") or 0),
        token_output=int(row.get("token_output") or 0),
        p95_duration_ms=row.get("p95_duration_ms"),
    )


def _none_if_blank(value: Any) -> str | None:
    return value if value else None


def _none_if_zero(value: Any) -> int | None:
    return int(value) if value else None


def _parse_json(value: Any) -> dict[str, Any]:
    if not value:
        return {}
    if isinstance(value, dict):
        return value
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}
