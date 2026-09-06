"""도메인 엔티티 ↔ 저장 JSON 변환.

커널은 items 를 불투명한 JSON 으로 저장하므로 그 안의 형태는 이 소스가 소유한다.
형태를 바꾸면 이미 저장된 행이 전부 해석 불가가 되므로 왕복 테스트로 고정한다.
"""

from __future__ import annotations

from typing import Any

from .entities import SearchResult


def encode_results(results: list[SearchResult]) -> list[dict[str, Any]]:
    return [
        {
            "rank": r.rank,
            "title": r.title,
            "link": r.link,
            "snippet": r.snippet,
            "source": r.source,
        }
        for r in results
    ]


def decode_results(items: list[dict[str, Any]]) -> list[SearchResult]:
    return [
        SearchResult(
            rank=int(raw.get("rank") or 0),
            title=str(raw["title"]),
            link=str(raw.get("link") or ""),
            snippet=str(raw.get("snippet") or ""),
            source=str(raw.get("source") or ""),
        )
        for raw in items
        if isinstance(raw, dict) and raw.get("title")
    ]
