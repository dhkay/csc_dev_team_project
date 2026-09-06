"""codec 왕복 테스트.

이 형태를 바꾸면 이미 저장된 행이 전부 해석 불가가 된다. 그래서 왕복과 실제 저장 형태를
둘 다 고정한다.
"""

from __future__ import annotations

from app.domains.datalab.core.domain.codec import decode_buckets, encode_buckets
from app.domains.datalab.core.domain.entities import KeywordBucket, KeywordRank


def test_round_trip_preserves_buckets() -> None:
    buckets = [
        KeywordBucket(
            date="2026-08-10",
            keywords=[KeywordRank(1, "김치찌개"), KeywordRank(2, "된장")],
        ),
        KeywordBucket(date="2026-08-09", keywords=[]),
    ]
    assert decode_buckets(encode_buckets(buckets)) == buckets


def test_decodes_the_shape_actually_stored_in_production() -> None:
    stored = [{"date": "2026-08-10", "keywords": [{"rank": 1, "keyword": "김치찌개"}]}]
    assert decode_buckets(stored) == [
        KeywordBucket(date="2026-08-10", keywords=[KeywordRank(1, "김치찌개")])
    ]


def test_decode_drops_malformed_entries_without_raising() -> None:
    stored = [
        "not-a-dict",
        {
            "date": "2026-08-10",
            "keywords": [{"rank": 1}, {"keyword": ""}, {"rank": 2, "keyword": "ok"}],
        },
    ]
    assert decode_buckets(stored) == [
        KeywordBucket(date="2026-08-10", keywords=[KeywordRank(2, "ok")])
    ]
