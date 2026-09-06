"""도메인 엔티티 ↔ 저장 JSON 변환.

커널은 items 를 불투명한 JSON 으로 저장하므로 그 안의 형태는 이 소스가 소유한다.
형태를 바꾸면 이미 저장된 행이 전부 해석 불가가 되므로 왕복 테스트로 고정한다.
"""

from __future__ import annotations

from typing import Any

from .entities import RelatedKeyword


def encode_keywords(keywords: list[RelatedKeyword]) -> list[dict[str, Any]]:
    return [
        {
            "rank": k.rank,
            "keyword": k.keyword,
            "monthlySearches": k.monthly_searches,
            "pcSearches": k.pc_searches,
            "mobileSearches": k.mobile_searches,
            "competition": k.competition,
        }
        for k in keywords
    ]


def decode_keywords(items: list[dict[str, Any]]) -> list[RelatedKeyword]:
    return [
        RelatedKeyword(
            rank=int(raw.get("rank") or 0),
            keyword=str(raw["keyword"]),
            monthly_searches=int(raw.get("monthlySearches") or 0),
            pc_searches=int(raw.get("pcSearches") or 0),
            mobile_searches=int(raw.get("mobileSearches") or 0),
            competition=str(raw.get("competition") or ""),
        )
        for raw in items
        if isinstance(raw, dict) and raw.get("keyword")
    ]
