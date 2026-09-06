"""저장소 컬럼 매핑 잠금.

kind 를 가리지 않는 조회는 4개 테이블을 UNION 한다. 테이블마다 승격 컬럼이 달라 브랜치별
SELECT shape 이 어긋나면 ClickHouse 가 거부한다. 더 나쁜 경우는 공통 컬럼만 뽑아서 에러의
stack 과 감사의 before/after 를 조용히 잃는 것이다.
"""

from __future__ import annotations

from csc_log_contracts import LogKind

from app.shared.adapters.outbound.clickhouse.tables import (
    ALL_EXTRA_COLUMNS,
    COMMON_COLUMNS,
    EXTRA_COLUMNS_BY_KIND,
    columns_for,
    table_for,
    union_select_expressions,
)


def test_kind_마다_테이블이_다르다() -> None:
    tables = {table_for(k) for k in LogKind}

    assert tables == {"domain_events", "error_logs", "audit_logs", "access_logs"}


def test_union_식은_전_kind_에서_컬럼_수가_같다() -> None:
    """UNION ALL 은 브랜치 컬럼 수가 다르면 실패한다."""
    widths = {len(union_select_expressions(k)) for k in LogKind}

    assert len(widths) == 1
    assert widths.pop() == len(COMMON_COLUMNS) + len(ALL_EXTRA_COLUMNS)


def test_union_식은_전_kind_에서_컬럼_이름_순서가_같다() -> None:
    """이름/순서가 어긋나면 UNION 결과의 컬럼이 뒤섞여 매퍼가 엉뚱한 값을 읽는다."""

    def names(kind: LogKind) -> list[str]:
        # "'' AS before" 같은 패딩 식에서 별칭만 뽑는다.
        return [e.split(" AS ")[-1].strip() for e in union_select_expressions(kind)]

    reference = names(LogKind.EVENT)
    for kind in LogKind:
        assert names(kind) == reference, f"{kind.value} 의 컬럼 shape 이 다르다"


def test_union_식은_자기_승격컬럼을_원본으로_고른다() -> None:
    """패딩으로 덮어써 버리면 값이 있는데도 빈 값이 나간다."""
    for kind in LogKind:
        expressions = set(union_select_expressions(kind))
        for column in EXTRA_COLUMNS_BY_KIND[kind]:
            assert column in expressions, f"{kind.value}.{column} 이 원본이 아니라 패딩으로 나갔다"


def test_union_식은_남의_승격컬럼을_빈값으로_채운다() -> None:
    own = set(EXTRA_COLUMNS_BY_KIND[LogKind.ERROR])
    expressions = union_select_expressions(LogKind.ERROR)

    for column in ALL_EXTRA_COLUMNS:
        if column in own:
            continue
        assert any(e.endswith(f" AS {column}") for e in expressions)


def test_단일_kind_컬럼은_공통_더하기_자기_승격컬럼이다() -> None:
    """kind 를 지정한 조회는 패딩 없이 자기 컬럼만 읽는다(불필요한 컬럼 미조회)."""
    assert columns_for(LogKind.ACCESS) == COMMON_COLUMNS + ("method", "path", "status_code")
    assert columns_for(LogKind.EVENT) == COMMON_COLUMNS


def test_모든_승격컬럼이_ALL_EXTRA_COLUMNS_에_등록되어_있다() -> None:
    """kind 에 컬럼을 추가하고 타입 표 등록을 빠뜨리면 UNION 패딩이 그 컬럼을 모른다."""
    declared = {c for k in LogKind for c in EXTRA_COLUMNS_BY_KIND[k]}

    assert declared == set(ALL_EXTRA_COLUMNS)
