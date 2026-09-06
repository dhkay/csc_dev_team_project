"""SerpApi 검색 결과 파서.

응답 키가 검색어마다 다르다. 레시피성 검색어에서는 `organic_results` 가 아니라
`recipes_results` 가 오고, 그 밖에도 `knowledge_graph`, `short_videos` 같은 블록이 검색어에 따라
붙었다 빠진다(실측). 그래서 특정 키의 존재를 가정하지 않고, 있으면 읽고 없으면 빈 목록으로 둔다.

`search_metadata.raw_html_file` 은 읽지 않는다. 서명이 든 링크라 저장하거나 로그에 남기면
그 자체가 유출 경로가 된다.
"""

from __future__ import annotations

from typing import Any

from ....core.domain.entities import SearchResult


def parse(payload: Any) -> list[SearchResult]:
    """응답 → 검색 결과 목록(구글이 준 순서 그대로)."""
    if not isinstance(payload, dict):
        return []
    rows = payload.get("organic_results")
    if not isinstance(rows, list):
        return []

    results: list[SearchResult] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        title = str(row.get("title") or "").strip()
        if not title:
            continue
        results.append(
            SearchResult(
                # position 이 있으면 그것을 쓴다(구글 순위). 없으면 목록 순서로 대신한다.
                rank=int(row.get("position") or len(results) + 1),
                title=title,
                # redirect_link 가 아니라 목적지를 저장한다(추적 파라미터가 붙지 않은 쪽).
                link=str(row.get("link") or ""),
                snippet=str(row.get("snippet") or "").strip(),
                source=str(row.get("source") or row.get("displayed_link") or "").strip(),
            )
        )
    return results
