"""도메인 버킷 ↔ 저장 JSON 변환.

커널은 items 를 불투명한 JSON 으로 저장하므로, 그 안의 형태는 이 소스가 소유한다.
여기 형태를 바꾸면 이미 저장된 행이 전부 해석 불가가 되므로 왕복 테스트로 고정한다.

core 에 두는 이유: 이건 이 소스의 데이터 계약이라 인바운드(라우터가 decode)와
아웃바운드(플러그인이 encode) 양쪽이 의존한다. 한쪽 어댑터에 두면 반대쪽이 어댑터를 넘어
참조하게 된다.
"""

from __future__ import annotations

from typing import Any

from .entities import KeywordBucket, KeywordRank


def encode_buckets(buckets: list[KeywordBucket]) -> list[dict[str, Any]]:
    return [
        {
            "date": b.date,
            "keywords": [{"rank": k.rank, "keyword": k.keyword} for k in b.keywords],
        }
        for b in buckets
    ]


def decode_buckets(items: list[dict[str, Any]]) -> list[KeywordBucket]:
    return [_to_bucket(raw) for raw in items if isinstance(raw, dict)]


def _to_bucket(raw: dict[str, Any]) -> KeywordBucket:
    keywords = [
        KeywordRank(rank=int(k["rank"]), keyword=str(k["keyword"]))
        for k in (raw.get("keywords") or [])
        if isinstance(k, dict) and k.get("keyword")
    ]
    return KeywordBucket(date=str(raw.get("date") or ""), keywords=keywords)
