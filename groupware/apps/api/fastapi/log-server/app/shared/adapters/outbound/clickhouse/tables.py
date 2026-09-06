"""ClickHouse 테이블 매핑: kind ↔ 테이블 ↔ 컬럼.

수집(sink)과 조회(query) 두 도메인이 같은 테이블을 반대 방향으로 쓴다. 컬럼 목록이 갈라지면
insert 와 select 가 조용히 어긋나므로 매핑을 여기 한곳에 둔다.
DDL 의 진실원은 `clickhouse/migrations/*.sql` 이며, 이 모듈은 그 스키마의 코드 측 미러다.
"""

from __future__ import annotations

from csc_log_contracts import LogKind

#: kind → 테이블. 종류마다 보존기간과 부가 컬럼이 달라 테이블을 나눈다.
TABLE_BY_KIND: dict[LogKind, str] = {
    LogKind.EVENT: "domain_events",
    LogKind.ERROR: "error_logs",
    LogKind.AUDIT: "audit_logs",
    LogKind.ACCESS: "access_logs",
}

#: 전 테이블 공통 컬럼(순서 = insert 컬럼 순서).
COMMON_COLUMNS: tuple[str, ...] = (
    "event_id",
    "occurred_at",
    "ingested_at",
    "environment",
    "service",
    "scope",
    "ai_tool",
    "organization_id",
    "level",
    "action",
    "message",
    "trace_id",
    "request_id",
    "job_id",
    "actor_type",
    "actor_id",
    "duration_ms",
    "token_input",
    "token_output",
    "payload",
)

#: kind 별 추가 컬럼: payload 에서 승격되어 인덱싱/집계 가능해진 필드.
EXTRA_COLUMNS_BY_KIND: dict[LogKind, tuple[str, ...]] = {
    LogKind.EVENT: (),
    LogKind.ERROR: ("error_type", "stack"),
    LogKind.AUDIT: ("before", "after"),
    LogKind.ACCESS: ("method", "path", "status_code"),
}


#: 승격 컬럼의 ClickHouse 타입: kind 를 가리지 않는 UNION 조회에서 없는 컬럼을 채울 때 쓴다.
#: dict 순서가 곧 SELECT 순서라 안정적이어야 한다(브랜치마다 같은 순서로 나와야 UNION 이 성립).
EXTRA_COLUMN_TYPES: dict[str, str] = {
    "error_type": "String",
    "stack": "String",
    "before": "String",
    "after": "String",
    "method": "String",
    "path": "String",
    "status_code": "UInt16",
}

ALL_EXTRA_COLUMNS: tuple[str, ...] = tuple(EXTRA_COLUMN_TYPES)

#: 타입별 '값 없음' 리터럴. non-nullable 컬럼이라 NULL 대신 빈 값을 쓴다(적재 쪽과 동일 규약).
_EMPTY_LITERAL: dict[str, str] = {"String": "''", "UInt16": "toUInt16(0)"}


def table_for(kind: LogKind) -> str:
    return TABLE_BY_KIND[kind]


def columns_for(kind: LogKind) -> tuple[str, ...]:
    return COMMON_COLUMNS + EXTRA_COLUMNS_BY_KIND[kind]


def union_select_expressions(kind: LogKind) -> list[str]:
    """kind 를 가리지 않는 UNION 조회용 SELECT 식.

    테이블마다 승격 컬럼이 달라 그대로는 UNION 이 안 된다. 자기 컬럼은 그대로 두고 남의 컬럼은
    빈 리터럴로 채워 모든 브랜치의 컬럼 수/이름/순서를 일치시킨다.
    이렇게 해야 혼합 조회에서도 에러의 stack, 감사의 before/after 가 살아 돌아온다
    (공통 컬럼만 뽑으면 조용히 사라진다).
    """
    own = set(EXTRA_COLUMNS_BY_KIND[kind])
    expressions = list(COMMON_COLUMNS)
    for column in ALL_EXTRA_COLUMNS:
        if column in own:
            expressions.append(column)
        else:
            empty = _EMPTY_LITERAL[EXTRA_COLUMN_TYPES[column]]
            expressions.append(f"{empty} AS {column}")
    return expressions
