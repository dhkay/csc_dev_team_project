"""WHERE 절 생성 잠금: 필터가 SQL 로 정확히 번역되는지.

이 파일이 지키는 것: (1) 값이 항상 바인딩 파라미터로 나가 SQL 주입이 불가능하다,
(2) 미지정 필터는 조건을 만들지 않는다(무심코 전체를 좁히거나 넓히지 않는다),
(3) actor_id 는 실제 컬럼이고 channel_id 는 payload 추출이라는 비대칭이 유지된다.
"""

from __future__ import annotations

from datetime import datetime, timezone

from csc_log_contracts import LogKind

from app.domains.query.adapters.outbound.store.clickhouse_repository import (
    _build_count_sql,
    _build_where,
)
from app.domains.query.core.domain.types import LogFilter, PageRequest
from app.shared.adapters.outbound.clickhouse.tables import table_for


def test_빈_필터는_조건을_만들지_않는다() -> None:
    where, params = _build_where(LogFilter())
    assert where == ""
    assert params == {}


def test_actor_id_는_실제_컬럼_등호_비교다() -> None:
    where, params = _build_where(LogFilter(actor_id=12))
    assert "actor_id = {actor_id:UInt32}" in where
    assert params["actor_id"] == 12


def test_channel_id_는_payload_에서_추출한다() -> None:
    """envelope 에 채널 개념이 없어 payload 에 실려 온다. 그래서 컬럼 비교가 아니다."""
    where, params = _build_where(LogFilter(channel_id=7))
    assert "JSONExtractUInt(payload, 'channel_id') = {channel_id:UInt32}" in where
    assert params["channel_id"] == 7


def test_billed_only_는_청구액이_있는_행만_남긴다() -> None:
    """cost 는 envelope 이 아니라 payload 에 실리므로 channel_id 와 같은 JSON 추출이다."""
    where, params = _build_where(LogFilter(billed_only=True))
    assert "JSONExtractUInt(payload, 'cost', 'micro_usd') > 0" in where
    # 조건이 상수라 바인딩할 값이 없다(사용자 입력이 들어갈 자리가 아예 없다).
    assert params == {}


def test_billed_only_가_거짓이면_조건을_만들지_않는다() -> None:
    """기본값이 조용히 목록을 좁히면, 필터를 켠 적 없는 사용자가 원장 일부를 못 본다."""
    where, params = _build_where(LogFilter(billed_only=False))
    assert where == ""
    assert params == {}


def test_actor_와_channel_은_함께_AND_로_붙는다() -> None:
    where, params = _build_where(LogFilter(organization_id=42, actor_id=12, channel_id=7))
    assert where.startswith("WHERE ")
    assert where.count(" AND ") == 2
    assert params == {"organization_id": 42, "actor_id": 12, "channel_id": 7}


def test_0_은_미지정과_구분된다() -> None:
    """`if filters.actor_id is not None` 이어야 한다. 진위 검사면 0 이 조용히 사라진다.

    0 은 저장소에서 '없음' 센티넬이라 실제 조회 대상이 아니지만, 필터 생성 로직이
    None 과 0 을 구분하지 못하면 나중에 센티넬 의미가 바뀔 때 조용히 틀린다.
    """
    where, params = _build_where(LogFilter(actor_id=0, channel_id=0))
    assert "actor_id" in params
    assert "channel_id" in params
    assert params["actor_id"] == 0


def test_값은_전부_바인딩되고_문자열_보간되지_않는다() -> None:
    """SQL 주입 잠금: 사용자 입력이 WHERE 문자열 본문에 나타나면 안 된다."""
    evil = "1; DROP TABLE audit_logs"
    where, params = _build_where(LogFilter(job_id=evil, search=evil, action_prefix=evil))
    assert "DROP TABLE" not in where
    assert params["job_id"] == evil
    assert params["search"] == evil


def test_커서는_튜플_비교로_나간다() -> None:
    at = datetime(2026, 7, 29, 12, 0, tzinfo=timezone.utc)
    where, params = _build_where(
        LogFilter(actor_id=12),
        PageRequest(limit=50, cursor=(at, "00000000-0000-0000-0000-000000000001")),
    )
    assert "(occurred_at, event_id) < ({cursor_at:DateTime64(3)}, {cursor_id:UUID})" in where
    assert params["cursor_at"] == at


def test_총계는_목록과_같은_WHERE_를_쓴다() -> None:
    """총계와 목록이 다른 조건을 보면 화면의 '몇 건 중 몇 건'이 서로 다른 집합을 센다."""
    filters = LogFilter(organization_id=42, actor_id=12, channel_id=7)
    where, where_params = _build_where(filters)
    sql, count_params = _build_count_sql(filters)

    assert where in sql
    assert count_params == where_params


def test_총계에는_커서가_붙지_않는다() -> None:
    """커서가 섞이면 '조건에 맞는 수'가 아니라 '남은 수'가 되어, 더 볼수록 총계가 줄어든다."""
    sql, params = _build_count_sql(LogFilter(actor_id=12))
    assert "occurred_at, event_id) <" not in sql
    assert "cursor_at" not in params
    assert "LIMIT" not in sql
    assert "ORDER BY" not in sql


def test_kind_를_지정하면_그_테이블만_센다() -> None:
    sql, _ = _build_count_sql(LogFilter(kind=LogKind.AUDIT))
    assert sql.count("count()") == 1
    assert "audit_logs" in sql
    assert "domain_events" not in sql


def test_kind_미지정이면_네_테이블_합계다() -> None:
    """목록이 UNION 으로 훑는 범위와 총계의 범위가 같아야 한다."""
    sql, _ = _build_count_sql(LogFilter())
    assert sql.count("count()") == len(LogKind)
    for kind in LogKind:
        assert table_for(kind) in sql
