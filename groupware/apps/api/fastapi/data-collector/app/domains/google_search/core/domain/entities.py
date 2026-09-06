"""도메인 엔티티 (순수: httpx/FastAPI/SQLAlchemy import 없음)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class SearchResult:
    """검색 결과 한 건.

    link 는 광고 추적 파라미터가 붙은 리다이렉트 주소가 아니라 실제 목적지다. 벤더가 둘 다
    주는데(`link` 와 `redirect_link`), 저장해서 나중에 여는 쪽은 목적지여야 한다.
    """

    rank: int
    title: str
    link: str
    snippet: str
    source: str
