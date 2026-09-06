"""네이트 실시간 검색어 파서.

원문은 확장자가 `.js` 지만 내용은 순수 JSON 배열이다. 다만 객체가 아니라 배열의 배열이라
각 칸의 의미가 이름으로 남지 않는다. 실측 기준으로 아래 순서다.

    [순위, 검색어, 유형, 순위변동, 연관검색어]

그래서 인덱스 의미를 여기 상수로 고정한다. 여러 곳에서 `row[1]` 로 읽으면 벤더가 칸 하나를
끼워 넣는 순간 아무도 알아채지 못한 채 엉뚱한 값이 저장된다.

파싱 실패는 예외가 아니라 빈 목록이다. 커널이 빈 결과를 덮어쓰지 않으므로 이전 데이터가
살아남고, 다음 조회가 재수집을 유도한다.
"""

from __future__ import annotations

import json
import logging

from ....core.domain.entities import RealtimeKeyword

logger = logging.getLogger(__name__)

_RANK = 0
_KEYWORD = 1


def parse(text: str) -> list[RealtimeKeyword]:
    """원문 → 실시간 검색어 목록."""
    if not text.strip():
        return []
    try:
        rows = json.loads(text)
    except ValueError as exc:
        # 차단 페이지나 점검 안내는 JSON 이 아니다. 여기서 흡수한다.
        logger.warning("네이트 실시간 검색어 파싱 실패: %s", exc)
        return []
    if not isinstance(rows, list):
        return []

    keywords: list[RealtimeKeyword] = []
    for row in rows:
        if not isinstance(row, list) or len(row) <= _KEYWORD:
            continue
        keyword = str(row[_KEYWORD]).strip()
        if not keyword:
            continue
        # 순위는 벤더가 주는 값을 쓰되, 숫자가 아니면 목록 순서로 대신한다.
        try:
            rank = int(str(row[_RANK]).strip())
        except ValueError:
            rank = len(keywords) + 1
        keywords.append(RealtimeKeyword(rank=rank, keyword=keyword))
    return keywords
