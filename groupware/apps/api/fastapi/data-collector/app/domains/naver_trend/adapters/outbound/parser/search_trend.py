"""네이버 데이터랩 검색어 트렌드 응답 파서.

응답의 `results` 는 키워드 그룹 배열이다. 우리는 항상 그룹 하나로 요청하므로 첫 그룹만 읽는다.
그룹이 비어 있는 응답(검색량이 너무 적어 데이터가 없는 키워드)도 정상이며 빈 목록이 된다.

날짜 필드 이름이 `period` 다. 우리 도메인의 `period`(일간/주간/월간)와 뜻이 완전히 다르므로
여기서 `date` 로 바꿔 넘긴다. 이름이 겹친 채로 흘러가면 읽는 사람이 반드시 헷갈린다.
"""

from __future__ import annotations

from typing import Any

from ....core.domain.entities import TrendPoint


def parse(payload: Any) -> list[TrendPoint]:
    """응답 → 추이 점 목록(과거에서 최신 순, 벤더 순서 그대로)."""
    if not isinstance(payload, dict):
        return []
    results = payload.get("results")
    if not isinstance(results, list) or not results:
        return []
    first = results[0]
    if not isinstance(first, dict):
        return []

    points: list[TrendPoint] = []
    for row in first.get("data") or []:
        if not isinstance(row, dict):
            continue
        date_label = str(row.get("period") or "").strip()
        if not date_label:
            continue
        try:
            ratio = float(row.get("ratio") or 0)
        except (TypeError, ValueError):
            continue
        points.append(TrendPoint(date=date_label, ratio=ratio))
    return points
