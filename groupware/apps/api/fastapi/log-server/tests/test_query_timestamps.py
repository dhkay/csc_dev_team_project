"""조회 응답의 시각이 UTC 임을 명시하는지 잠금.

이 파일이 지키는 것 하나: 저장 컬럼은 `DateTime64(3, 'UTC')` 인데 드라이버는 naive datetime 을
돌려주므로, 그대로 응답에 실으면 offset 없는 문자열이 나가고 브라우저가 그것을 로컬 시간으로
해석해 한국 사용자에게 9시간 이른 시각이 보인다. 실제로 그렇게 어긋나 있었고, 눈으로만 확인하면
다음에 또 새기 때문에 여기서 못박는다.

같은 이유로 커서(next_cursor_at)도 검사한다. 커서는 응답으로 나갔다가 다음 요청에 되돌아오므로
tz 가 빠지면 페이지 경계가 지역마다 달라진다.
"""

from __future__ import annotations

from datetime import datetime, timezone

from csc_log_contracts import LogKind

from app.domains.query.adapters.inbound.http import mappers as http_mappers
from app.domains.query.adapters.outbound.store import mappers as store_mappers
from app.domains.query.core.domain.types import LogPage

# 드라이버가 주는 모습 그대로: tzinfo 가 없는 UTC 값.
_NAIVE_UTC = datetime(2026, 7, 30, 23, 14, 26, 956000)


def _row() -> dict[str, object]:
    return {
        "event_id": "0f9d4e1a-2b3c-4d5e-8f70-112233445566",
        "occurred_at": _NAIVE_UTC,
        "ingested_at": _NAIVE_UTC,
        "environment": "dev",
        "service": "csc-marketing",
        "scope": "AI_TOOL",
        "ai_tool": "marketing-video",
        "organization_id": 12,
        "level": "INFO",
        "action": "marketing.plan.generated",
        "message": "기획서 생성",
        "trace_id": "",
        "request_id": "",
        "job_id": "",
        "actor_type": "ORGANIZATION_USER",
        "actor_id": 12,
        "duration_ms": 0,
        "token_input": 2940,
        "token_output": 985,
        "payload": "{}",
    }


def test_레코드_시각에_UTC_가_명시된다() -> None:
    record = store_mappers.to_log_record(_row(), LogKind.AUDIT)

    assert record.occurred_at.tzinfo is not None, "tz 가 없으면 클라이언트가 로컬 시간으로 오해한다"
    assert record.occurred_at.utcoffset().total_seconds() == 0
    assert record.ingested_at.tzinfo is not None
    # 같은 순간을 가리켜야 한다(시각을 옮기는 게 아니라 tz 를 명시하는 것).
    assert record.occurred_at.replace(tzinfo=None) == _NAIVE_UTC


def test_이미_aware_인_값은_그대로_둔다() -> None:
    row = _row()
    aware = _NAIVE_UTC.replace(tzinfo=timezone.utc)
    row["occurred_at"] = aware
    row["ingested_at"] = aware

    record = store_mappers.to_log_record(row, LogKind.AUDIT)

    assert record.occurred_at == aware


def test_직렬화된_문자열이_offset_을_포함한다() -> None:
    """응답 스키마까지 통과한 문자열에 offset 이 살아 있어야 한다.

    브라우저의 `new Date(...)` 는 offset 이 없으면 로컬 시간으로 읽는다. 이 단언이 그 경계다.
    """
    record = store_mappers.to_log_record(_row(), LogKind.AUDIT)
    response = http_mappers.to_search_response(LogPage(records=[record]))

    serialized = response.model_dump(mode="json")
    occurred = serialized["records"][0]["occurred_at"]
    assert occurred.endswith("+00:00") or occurred.endswith("Z"), occurred


def test_커서도_offset_을_포함한다() -> None:
    record = store_mappers.to_log_record(_row(), LogKind.AUDIT)
    page = LogPage(records=[record], next_cursor=(record.occurred_at, record.event_id))

    serialized = http_mappers.to_search_response(page).model_dump(mode="json")

    cursor = serialized["next_cursor_at"]
    assert cursor.endswith("+00:00") or cursor.endswith("Z"), cursor
