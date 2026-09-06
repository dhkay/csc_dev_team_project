"""도메인 엔티티 (순수: httpx/FastAPI/SQLAlchemy import 없음)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class RealtimeKeyword:
    """실시간 검색어 한 건: 순위 + 검색어."""

    rank: int
    keyword: str
