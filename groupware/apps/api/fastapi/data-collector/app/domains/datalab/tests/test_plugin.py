"""datalab 플러그인 단위 테스트: 타깃 유도, 보관 정책, 벤더 기벽 흡수."""

from __future__ import annotations

import pytest

from app.domains.datalab.core.domain.entities import KeywordBucket, KeywordRank
from app.domains.datalab.core.domain.types import Period
from app.domains.datalab.adapters.outbound.collection.plugin import (
    DatalabShoppingKeywordsSource,
)
from app.domains.datalab.core.domain.types import SOURCE_ID
from app.domains.datalab.core.domain.target import make_target


class FakeNavigation:
    def __init__(self, raw: str = "RAW") -> None:
        self.raw = raw
        self.seen: list[tuple[str, str]] = []

    def acquire_html(self, cid: str, time_unit: str) -> str:
        self.seen.append((cid, time_unit))
        return self.raw


class FakeParser:
    """오름차순(과거→최신) 3개 반환."""

    def parse(self, html: str, period: Period) -> list[KeywordBucket]:
        return [
            KeywordBucket(date=f"d{i:02d}", keywords=[KeywordRank(1, f"k{i}")])
            for i in range(3)
        ]


def _plugin(nav: FakeNavigation | None = None) -> DatalabShoppingKeywordsSource:
    return DatalabShoppingKeywordsSource(
        navigation=nav or FakeNavigation(), parser=FakeParser()
    )


def test_target_key_and_params_are_derived_once() -> None:
    target = make_target(" 50000002 ", Period.DAILY)
    assert target.source == SOURCE_ID
    assert target.target_key == "50000002:daily"  # cid 는 trim 된다
    # params 는 재수집에 필요한 전부이고 절대 날짜를 담지 않는다(크론이 언제 돌아도 같은 의미).
    assert target.params == {"cid": "50000002", "period": "daily"}


def test_same_target_compares_equal_regardless_of_params_object() -> None:
    """동일성은 (source, target_key) 뿐이라 한 행/한 잡으로 수렴한다."""
    assert make_target("50000002", Period.DAILY) == make_target(
        " 50000002 ", Period.DAILY
    )


@pytest.mark.parametrize(
    ("period", "expected_unit", "expected_keep"),
    [
        (Period.DAILY, "date", 12),
        (Period.WEEKLY, "week", 12),
        (Period.MONTHLY, "month", 3),
    ],
)
def test_retention_and_time_unit_per_period(
    period, expected_unit, expected_keep
) -> None:
    nav = FakeNavigation()
    plugin = _plugin(nav)
    target = make_target("50000002", period)
    assert plugin.retention(target) == expected_keep


@pytest.mark.asyncio
async def test_collect_reverses_to_newest_first_and_passes_time_unit() -> None:
    """벤더는 오름차순으로 준다. 안정형 정렬(최신순)은 플러그인이 만든다."""
    nav = FakeNavigation()
    items = await _plugin(nav).collect(make_target("50000002", Period.DAILY))

    assert nav.seen == [("50000002", "date")]  # 기간당 1회 호출
    assert [i["date"] for i in items] == ["d02", "d01", "d00"]


@pytest.mark.asyncio
async def test_collect_returns_encoded_json_not_domain_objects() -> None:
    """커널은 items 를 불투명 JSON 으로 저장하므로 플러그인이 인코딩까지 마쳐야 한다."""
    items = await _plugin().collect(make_target("50000002", Period.DAILY))
    assert items[0] == {"date": "d02", "keywords": [{"rank": 1, "keyword": "k2"}]}
