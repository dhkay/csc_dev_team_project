"""도메인 엔티티 (순수: httpx/FastAPI/SQLAlchemy import 없음)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class TrendingKeyword:
    """일별 인기 검색어 한 건.

    approx_traffic 은 구글이 주는 대략 검색량 문자열이다(예: `1000+`). 정확한 수치가 아니라
    구간 표기라 숫자로 바꾸지 않고 원문 그대로 나른다. 숫자로 바꾸면 없는 정밀도를 만든다.
    """

    rank: int
    keyword: str
    approx_traffic: str
    news_title: str
    news_url: str
