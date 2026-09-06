"""도메인 엔티티 (순수: SQLAlchemy/FastAPI import 없음).

타깃과 스냅샷은 수집 커널(domains/collection)이 소유한다. 여기 남는 건 이 소스가 만드는
데이터의 형태뿐이다.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class KeywordRank:
    """인기 검색어 한 건: 순위 + 키워드."""

    rank: int
    keyword: str


@dataclass
class KeywordBucket:
    """날짜(포인트)별 인기 검색어 묶음. 라벨(일/주/월) + 그 시점의 랭킹 상위 N."""

    date: str
    keywords: list[KeywordRank]
