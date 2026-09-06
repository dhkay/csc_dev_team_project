"""도메인 엔티티 (순수: httpx/FastAPI/SQLAlchemy import 없음)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ArticleSummary:
    """문서 요약 한 건.

    title 은 요청한 제목이 아니라 위키백과가 확정한 제목이다. 리다이렉트가 자동으로 따라가므로
    둘이 다를 수 있고(예: `Kimchi_jjigae` 요청에 `Kimchi-jjigae` 응답), 화면에 보여야 하는 것은
    확정된 쪽이다.
    """

    title: str
    extract: str
    url: str
    thumbnail_url: str
