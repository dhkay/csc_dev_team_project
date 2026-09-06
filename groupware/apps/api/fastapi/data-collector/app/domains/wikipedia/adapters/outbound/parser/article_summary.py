"""위키백과 응답 파서. 언어판마다 응답 구조가 달라 함수를 갈라 둔다.

action API(ko)의 함정: `query.pages` 는 배열이 아니라 pageid 를 키로 하는 객체다. 첫 항목을
인덱스 0 으로 꺼낼 수 없다. `formatversion=2` 를 주면 배열이 되므로 요청 쪽에서 그렇게 부르고,
여기서는 두 형태를 모두 받아 준다(옛 응답이 캐시나 프록시에서 올 수 있다).

없는 문서: action API 는 pageid 대신 `missing` 플래그를 주고, REST 는 404 를 준다. 둘 다
"수집 실패"가 아니라 "그런 문서가 없다"이며, 여기서는 빈 목록으로 좁힌다. 커널이 빈 결과를
덮어쓰지 않으므로 이전 데이터도 지워지지 않는다.
"""

from __future__ import annotations

from typing import Any

from ....core.domain.entities import ArticleSummary


def _pages(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """`query.pages` 를 형태와 무관하게 목록으로 만든다."""
    pages = (payload.get("query") or {}).get("pages")
    if isinstance(pages, list):
        return [p for p in pages if isinstance(p, dict)]
    if isinstance(pages, dict):
        return [p for p in pages.values() if isinstance(p, dict)]
    return []


def parse_action_api(payload: Any, page_base_url: str) -> list[ArticleSummary]:
    """action API(`api.php`) 응답 → 요약.

    이 응답에는 문서 주소가 없어 제목으로 만든다. 그래서 언어판 주소(page_base_url)를 받는다.
    """
    if not isinstance(payload, dict):
        return []
    for page in _pages(payload):
        if page.get("missing") is not None:
            continue
        title = str(page.get("title") or "").strip()
        extract = str(page.get("extract") or "").strip()
        if not title:
            continue
        return [
            ArticleSummary(
                title=title,
                extract=extract,
                url=f"{page_base_url}{title.replace(' ', '_')}",
                # action API 는 대표 이미지를 주지 않는다(요청 prop 을 늘리면 응답이 커진다).
                thumbnail_url="",
            )
        ]
    return []


def parse_rest_summary(payload: Any) -> list[ArticleSummary]:
    """REST(`page/summary`) 응답 → 요약."""
    if not isinstance(payload, dict):
        return []
    title = str(payload.get("title") or "").strip()
    if not title:
        return []
    urls = (payload.get("content_urls") or {}).get("desktop") or {}
    thumbnail = payload.get("thumbnail") or {}
    return [
        ArticleSummary(
            title=title,
            extract=str(payload.get("extract") or "").strip(),
            url=str(urls.get("page") or ""),
            thumbnail_url=str(thumbnail.get("source") or ""),
        )
    ]
