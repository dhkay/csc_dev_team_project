"""도메인 엔티티 ↔ 저장 JSON 변환.

커널은 items 를 불투명한 JSON 으로 저장하므로 그 안의 형태는 이 소스가 소유한다.
형태를 바꾸면 이미 저장된 행이 전부 해석 불가가 되므로 왕복 테스트로 고정한다.
"""

from __future__ import annotations

from typing import Any

from .entities import TrendPoint


def encode_points(points: list[TrendPoint]) -> list[dict[str, Any]]:
    return [{"date": p.date, "ratio": p.ratio} for p in points]


def decode_points(items: list[dict[str, Any]]) -> list[TrendPoint]:
    return [
        TrendPoint(date=str(raw["date"]), ratio=float(raw.get("ratio") or 0.0))
        for raw in items
        if isinstance(raw, dict) and raw.get("date")
    ]
