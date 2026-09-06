"""도메인 엔티티 ↔ 저장 JSON 변환.

커널은 items 를 불투명한 JSON 으로 저장하므로 그 안의 형태는 이 소스가 소유한다.
형태를 바꾸면 이미 저장된 행이 전부 해석 불가가 되므로 왕복 테스트로 고정한다.
"""

from __future__ import annotations

from typing import Any

from .entities import RealtimeKeyword


def encode_keywords(keywords: list[RealtimeKeyword]) -> list[dict[str, Any]]:
    return [{"rank": k.rank, "keyword": k.keyword} for k in keywords]


def decode_keywords(items: list[dict[str, Any]]) -> list[RealtimeKeyword]:
    return [
        RealtimeKeyword(rank=int(raw.get("rank") or 0), keyword=str(raw["keyword"]))
        for raw in items
        if isinstance(raw, dict) and raw.get("keyword")
    ]
