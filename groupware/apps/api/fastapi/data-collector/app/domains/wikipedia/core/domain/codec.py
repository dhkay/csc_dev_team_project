"""도메인 엔티티 ↔ 저장 JSON 변환.

커널은 items 를 불투명한 JSON 으로 저장하므로 그 안의 형태는 이 소스가 소유한다.
형태를 바꾸면 이미 저장된 행이 전부 해석 불가가 되므로 왕복 테스트로 고정한다.
"""

from __future__ import annotations

from typing import Any

from .entities import ArticleSummary


def encode_summaries(summaries: list[ArticleSummary]) -> list[dict[str, Any]]:
    return [
        {
            "title": s.title,
            "extract": s.extract,
            "url": s.url,
            "thumbnailUrl": s.thumbnail_url,
        }
        for s in summaries
    ]


def decode_summaries(items: list[dict[str, Any]]) -> list[ArticleSummary]:
    return [
        ArticleSummary(
            title=str(raw.get("title") or ""),
            extract=str(raw.get("extract") or ""),
            url=str(raw.get("url") or ""),
            thumbnail_url=str(raw.get("thumbnailUrl") or ""),
        )
        for raw in items
        if isinstance(raw, dict) and raw.get("title")
    ]
