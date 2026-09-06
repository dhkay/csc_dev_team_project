"""도메인 엔티티 ↔ 저장 JSON 변환.

커널은 items 를 불투명한 JSON 으로 저장하므로 그 안의 형태는 이 소스가 소유한다.
형태를 바꾸면 이미 저장된 행이 전부 해석 불가가 되므로 왕복 테스트로 고정한다.
"""

from __future__ import annotations

from typing import Any

from .entities import TrendingKeyword


def encode_keywords(keywords: list[TrendingKeyword]) -> list[dict[str, Any]]:
    return [
        {
            "rank": k.rank,
            "keyword": k.keyword,
            "approxTraffic": k.approx_traffic,
            "newsTitle": k.news_title,
            "newsUrl": k.news_url,
        }
        for k in keywords
    ]


def decode_keywords(items: list[dict[str, Any]]) -> list[TrendingKeyword]:
    return [
        TrendingKeyword(
            rank=int(raw.get("rank") or 0),
            keyword=str(raw.get("keyword") or ""),
            approx_traffic=str(raw.get("approxTraffic") or ""),
            news_title=str(raw.get("newsTitle") or ""),
            news_url=str(raw.get("newsUrl") or ""),
        )
        for raw in items
        if isinstance(raw, dict) and raw.get("keyword")
    ]
