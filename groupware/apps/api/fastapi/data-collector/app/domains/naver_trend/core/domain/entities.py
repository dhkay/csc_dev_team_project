"""도메인 엔티티 (순수: httpx/FastAPI/SQLAlchemy import 없음)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class TrendPoint:
    """검색 추이 한 점.

    ratio 는 검색 수가 아니라 그 창 안에서의 상대값이다. 가장 많이 검색된 시점이 100 이고
    나머지는 그에 대한 비율이다. 그래서 서로 다른 키워드의 ratio 를 비교하거나, 창이 다른 두
    조회 결과를 이어 붙이면 안 된다.
    """

    date: str
    ratio: float
