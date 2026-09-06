"""DatalabShoppingKeywordParser 파싱 테스트(getKeywordRank 배열 픽스처)."""

from __future__ import annotations

from app.domains.datalab.adapters.outbound.parser.datalab_shopping_keywords import (
    DatalabShoppingKeywordParser,
)
from app.domains.datalab.core.domain.types import Period

DAILY = Period.DAILY
MONTHLY = Period.MONTHLY

# getKeywordRank 응답 형태(날짜별 객체 배열, 오름차순).
SAMPLE = (
    '[{"date":"2026/07/11","ranks":[{"rank":1,"keyword":"헤라블랙쿠션"},{"rank":2,"keyword":"ahc아이크림"}]},'
    '{"date":"2026/07/12","ranks":[{"rank":1,"keyword":"샴푸"}]}]'
)


def test_parse_array_into_buckets_ascending() -> None:
    parser = DatalabShoppingKeywordParser()
    buckets = parser.parse(SAMPLE, DAILY)
    assert [b.date for b in buckets] == [
        "2026-07-11",
        "2026-07-12",
    ]  # 라벨은 YYYY-MM-DD
    assert [k.keyword for k in buckets[0].keywords] == ["헤라블랙쿠션", "ahc아이크림"]
    assert [k.rank for k in buckets[0].keywords] == [1, 2]


def test_monthly_label_is_year_month() -> None:
    parser = DatalabShoppingKeywordParser()
    html = '[{"date":"2026/07/01","ranks":[{"rank":1,"keyword":"샴푸"}]}]'
    buckets = parser.parse(html, MONTHLY)
    assert buckets[0].date == "2026-07"  # 월간은 YYYY-MM


def test_top_n_cap() -> None:
    parser = DatalabShoppingKeywordParser()
    ranks = ",".join(f'{{"rank":{i},"keyword":"k{i}"}}' for i in range(1, 21))
    html = f'[{{"date":"2026/07/12","ranks":[{ranks}]}}]'
    buckets = parser.parse(html, DAILY)
    assert len(buckets[0].keywords) == 10  # 상위 10 컷


def test_empty_or_error_or_nonlist_returns_empty() -> None:
    parser = DatalabShoppingKeywordParser()
    assert parser.parse("ERROR: boom", DAILY) == []
    assert parser.parse("", DAILY) == []
    assert parser.parse("not json", DAILY) == []
    assert parser.parse('{"ranks":[]}', DAILY) == []  # 배열 아님(구 형태) → 빈 목록
