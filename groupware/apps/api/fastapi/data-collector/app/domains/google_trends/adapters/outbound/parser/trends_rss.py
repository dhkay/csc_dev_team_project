"""구글 트렌드 일별 인기 검색어 RSS 파서.

원문은 RSS 2.0 이고 인기 검색어 고유 필드는 `ht:` 네임스페이스에 있다
(`ht:approx_traffic`, `ht:news_item`). 네임스페이스 URI 를 고정해 두지 않고 태그 이름의
지역부(local name)로 찾는다. 구글이 네임스페이스 URI 를 바꿔도 조용히 빈 결과가 되지 않게
하려는 것이다(실제로 이 피드는 경로가 한 번 바뀐 전력이 있다).

파싱 실패는 예외가 아니라 빈 목록이다. 커널이 빈 결과를 덮어쓰지 않으므로 이전 데이터가
살아남고, 다음 조회가 재수집을 유도한다.
"""

from __future__ import annotations

import logging
from xml.etree import ElementTree

from ....core.domain.entities import TrendingKeyword

logger = logging.getLogger(__name__)


def _local(tag: str) -> str:
    """`{네임스페이스}이름` → `이름`."""
    return tag.rsplit("}", 1)[-1]


def _first_child_text(element: ElementTree.Element, name: str) -> str:
    for child in element:
        if _local(child.tag) == name:
            return (child.text or "").strip()
    return ""


def _first_news(item: ElementTree.Element) -> tuple[str, str]:
    """첫 관련 기사(제목, 링크). 기사가 없는 항목도 정상이다."""
    for child in item:
        if _local(child.tag) != "news_item":
            continue
        return (
            _first_child_text(child, "news_item_title"),
            _first_child_text(child, "news_item_url"),
        )
    return "", ""


def parse(xml_text: str) -> list[TrendingKeyword]:
    """RSS 원문 → 인기 검색어 목록(순위는 피드 순서다)."""
    if not xml_text.strip():
        return []
    try:
        root = ElementTree.fromstring(xml_text)
    except ElementTree.ParseError as exc:
        # 차단 페이지나 폐기된 경로는 XML 이 아니라 HTML 을 준다. 그것을 여기서 흡수한다.
        logger.warning("구글 트렌드 RSS 파싱 실패: %s", exc)
        return []

    keywords: list[TrendingKeyword] = []
    for item in root.iter():
        if _local(item.tag) != "item":
            continue
        keyword = _first_child_text(item, "title")
        if not keyword:
            continue
        news_title, news_url = _first_news(item)
        keywords.append(
            TrendingKeyword(
                rank=len(keywords) + 1,
                keyword=keyword,
                approx_traffic=_first_child_text(item, "approx_traffic"),
                news_title=news_title,
                news_url=news_url,
            )
        )
    return keywords
