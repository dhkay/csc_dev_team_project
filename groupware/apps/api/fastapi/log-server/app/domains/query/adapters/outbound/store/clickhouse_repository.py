"""LogQueryPort 구현: ClickHouse 조회. SQL 은 이 계층 밖으로 새지 않는다.

두 가지를 지킨다:
1. 파라미터 바인딩만 쓴다. 사용자 입력(search, action_prefix 등)이 SQL 에 문자열로
   끼어들 자리를 만들지 않는다.
2. 인가는 여기서 하지 않는다. 넘겨받은 필터를 그대로 실행할 뿐이다. 조직 경계 판단은
   서비스가 이미 끝냈다. 저장소가 인가를 재해석하면 규칙이 두 곳에 복제된다.

kind 미지정 조회는 4개 테이블을 공통 컬럼으로 UNION ALL 한다(테이블마다 승격 컬럼이 달라
공통분모만 취한다). kind 를 지정하면 해당 테이블만 보고 승격 컬럼까지 함께 읽는다.
"""

from __future__ import annotations

from typing import Any

from clickhouse_connect.driver.asyncclient import AsyncClient
from csc_log_contracts import LogKind

from app.shared.adapters.outbound.clickhouse.tables import (
    columns_for,
    table_for,
    union_select_expressions,
)

from ....core.domain.entities import LogRecord, UsageBucket
from ....core.domain.types import LogFilter, PageRequest, UsageQuery
from . import mappers


class ClickHouseLogQueryRepository:
    """LogQueryPort(Protocol) 의 구현."""

    def __init__(self, client: AsyncClient) -> None:
        self._client = client

    async def find_many(
        self,
        filters: LogFilter,
        page: PageRequest,
    ) -> list[LogRecord]:
        where, params = _build_where(filters, page)
        params["limit"] = page.limit

        # kind 를 지정하면 그 테이블만, 아니면 4개 테이블을 UNION 한다.
        # 후자는 테이블마다 승격 컬럼이 달라 union_select_expressions 로 shape 을 맞춘다.
        kinds = [filters.kind] if filters.kind is not None else list(LogKind)
        single_kind = filters.kind is not None

        # kind 별 서브쿼리를 UNION ALL 한 뒤 전체를 다시 정렬한다. 각 브랜치에도 LIMIT 을
        # 걸어 두어 브랜치마다 필요한 만큼만 읽게 한다(전체 스캔 방지).
        #
        # 괄호와 바깥 SELECT 가 둘 다 필요하다. ClickHouse 는 UNION ALL 뒤에 붙인 ORDER BY 를
        # 구문 오류로 거부하고(마지막 브랜치에 속한 것으로 파싱), 브랜치별 ORDER BY/LIMIT 도
        # 괄호로 묶지 않으면 모호해진다.
        branches = [
            "(SELECT "
            + ", ".join(
                columns_for(kind) if single_kind else union_select_expressions(kind)
            )
            + f", '{kind.value}' AS __kind "
            + f"FROM {table_for(kind)} FINAL {where} "
            + "ORDER BY occurred_at DESC, event_id DESC LIMIT {limit:UInt32})"
            for kind in kinds
        ]
        sql = (
            "SELECT * FROM ("
            + " UNION ALL ".join(branches)
            + ") ORDER BY occurred_at DESC, event_id DESC LIMIT {limit:UInt32}"
        )

        result = await self._client.query(sql, parameters=params)
        rows = _to_dicts(result)
        return [mappers.to_log_record(row, LogKind(row["__kind"])) for row in rows]

    async def count_many(self, filters: LogFilter) -> int:
        sql, params = _build_count_sql(filters)
        result = await self._client.query(sql, parameters=params)
        rows = result.result_rows
        # 브랜치마다 정확히 한 행(count)이 나오므로 합계 행은 항상 존재한다. 그래도 빈 결과를
        # 0 으로 접어 두는 편이 낫다. 총계가 없다고 목록 화면이 깨질 이유는 없다.
        if not rows or rows[0][0] is None:
            return 0
        return int(rows[0][0])

    async def aggregate_usage(self, query: UsageQuery) -> list[UsageBucket]:
        params: dict[str, Any] = {"since": query.since, "until": query.until}
        conditions = ["day >= toDate({since:DateTime})", "day <= toDate({until:DateTime})"]

        if query.organization_id is not None:
            conditions.append("organization_id = {organization_id:UInt32}")
            params["organization_id"] = query.organization_id
        if query.ai_tool:
            conditions.append("ai_tool = {ai_tool:String}")
            params["ai_tool"] = query.ai_tool

        # 집계는 사전 계산된 MV(usage_daily)를 읽는다. 원본 스캔 없이 상수 시간에 가깝다.
        day_select = "day" if query.group_by_day else "NULL AS day"
        day_group = "day, " if query.group_by_day else ""
        sql = f"""
            SELECT {day_select}, organization_id, ai_tool, action,
                   sum(calls) AS calls,
                   sum(tok_in) AS token_input,
                   sum(tok_out) AS token_output,
                   quantileMerge(0.95)(p95_state) AS p95_duration_ms
            FROM usage_daily
            WHERE {" AND ".join(conditions)}
            GROUP BY {day_group}organization_id, ai_tool, action
            ORDER BY calls DESC
        """
        result = await self._client.query(sql, parameters=params)
        return [mappers.to_usage_bucket(row) for row in _to_dicts(result)]


def _build_count_sql(filters: LogFilter) -> tuple[str, dict[str, Any]]:
    """총계 SQL. 목록과 같은 WHERE 를 쓰되 커서와 정렬, limit 은 붙이지 않는다.

    커서를 빼는 것이 핵심이다. 커서가 들어가면 '남은 행 수'가 되어, 더 보기를 누를수록
    총계가 줄어드는 값을 화면에 보여주게 된다.

    kind 미지정이면 목록과 마찬가지로 네 테이블을 훑어야 하므로 브랜치별 count 를 합산한다
    (행을 UNION 한 뒤 세면 컬럼 shape 을 맞추는 비용을 총계에까지 물게 된다).
    """
    where, params = _build_where(filters)
    kinds = [filters.kind] if filters.kind is not None else list(LogKind)
    branches = [f"(SELECT count() AS c FROM {table_for(kind)} FINAL {where})" for kind in kinds]
    return "SELECT sum(c) FROM (" + " UNION ALL ".join(branches) + ")", params


def _build_where(filters: LogFilter, page: PageRequest | None = None) -> tuple[str, dict[str, Any]]:
    """필터(+커서) → WHERE 절 + 바인딩 파라미터. 문자열 보간은 컬럼명에만 쓴다."""
    conditions: list[str] = []
    params: dict[str, Any] = {}

    if filters.scope is not None:
        conditions.append("scope = {scope:String}")
        params["scope"] = filters.scope.value
    if filters.organization_id is not None:
        conditions.append("organization_id = {organization_id:UInt32}")
        params["organization_id"] = filters.organization_id
    if filters.ai_tool:
        conditions.append("ai_tool = {ai_tool:String}")
        params["ai_tool"] = filters.ai_tool
    if filters.levels:
        conditions.append("level IN {levels:Array(String)}")
        params["levels"] = [level.value for level in filters.levels]
    if filters.services:
        conditions.append("service IN {services:Array(String)}")
        params["services"] = list(filters.services)
    if filters.action_prefix:
        conditions.append("startsWith(action, {action_prefix:String})")
        params["action_prefix"] = filters.action_prefix
    if filters.trace_id:
        conditions.append("trace_id = {trace_id:String}")
        params["trace_id"] = filters.trace_id
    if filters.request_id:
        conditions.append("request_id = {request_id:String}")
        params["request_id"] = filters.request_id
    if filters.job_id:
        conditions.append("job_id = {job_id:String}")
        params["job_id"] = filters.job_id
    if filters.actor_id is not None:
        conditions.append("actor_id = {actor_id:UInt32}")
        params["actor_id"] = filters.actor_id
    if filters.channel_id is not None:
        # payload 는 String(ZSTD) 이라 JSON 추출로 판정한다. 이미 organization_id(선두 정렬키)와
        # occurred_at 범위로 좁혀진 뒤라 스캔 대상이 작다. 볼륨이 커지면 payload 에서 실제 컬럼으로
        # 승격하고 이 조건만 등호 비교로 바꾸면 된다(프로듀서/계약 변경 없음).
        conditions.append("JSONExtractUInt(payload, 'channel_id') = {channel_id:UInt32}")
        params["channel_id"] = filters.channel_id
    if filters.billed_only:
        # channel_id 와 같은 이유로 payload 추출이다(cost 는 envelope 이 아니라 payload 에 실린다).
        # 0 과 '없음'을 굳이 나누지 않는다: JSONExtract 는 키가 없으면 0 을 돌려주고,
        # 무료(0)와 미측정은 둘 다 '돈이 안 나갔다'라서 이 필터에서는 같은 쪽에 선다.
        # 값이 아니라 조건이 상수라 바인딩할 파라미터가 없다.
        conditions.append("JSONExtractUInt(payload, 'cost', 'micro_usd') > 0")
    if filters.search:
        conditions.append("positionCaseInsensitive(message, {search:String}) > 0")
        params["search"] = filters.search
    if filters.since:
        conditions.append("occurred_at >= {since:DateTime64(3)}")
        params["since"] = filters.since
    if filters.until:
        conditions.append("occurred_at <= {until:DateTime64(3)}")
        params["until"] = filters.until

    if page is not None and page.cursor is not None:
        # 튜플 비교로 (시각, id) 복합 커서를 한 번에 판정한다. 같은 밀리초에 여러 건이 쌓여도
        # event_id 가 tie-breaker 라 페이지 경계에서 행이 빠지거나 중복되지 않는다.
        cursor_at, cursor_id = page.cursor
        conditions.append(
            "(occurred_at, event_id) < ({cursor_at:DateTime64(3)}, {cursor_id:UUID})"
        )
        params["cursor_at"] = cursor_at
        params["cursor_id"] = cursor_id

    if not conditions:
        return "", params
    return "WHERE " + " AND ".join(conditions), params


def _to_dicts(result: Any) -> list[dict[str, Any]]:
    """clickhouse-connect QueryResult → dict 목록."""
    names = result.column_names
    return [dict(zip(names, row, strict=True)) for row in result.result_rows]
