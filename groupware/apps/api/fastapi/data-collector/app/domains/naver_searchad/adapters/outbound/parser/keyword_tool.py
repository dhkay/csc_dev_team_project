"""네이버 검색광고 키워드도구 응답 파서.

검색량이 항상 정수는 아니다. 검색량이 아주 적은 키워드에는 숫자 대신 `< 10` 같은 문자열이
온다. `int()` 를 그대로 걸면 그 한 건에서 터져 목록 전체가 사라지므로, 숫자로 못 읽는 값은
0 으로 좁힌다(정확한 값을 지어내지 않되 다른 키워드는 살린다).

정렬은 여기서 확정한다. 벤더 순서를 그대로 두면 재수집마다 순서가 흔들려 저장된 items 가
매번 달라진다. 총 검색량 내림차순으로 고정한다.
"""

from __future__ import annotations

from typing import Any

from ....core.domain.entities import RelatedKeyword


def _to_int(value: Any) -> int:
    """`6250`, `"6250"`, `"< 10"` 을 모두 받아 정수로 좁힌다."""
    if isinstance(value, bool):
        return 0
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        # `< 10` 처럼 구간으로 오는 값. 정확한 수를 모르므로 0 으로 둔다.
        return 0


def parse(payload: Any) -> list[RelatedKeyword]:
    """응답 → 연관 키워드 목록(총 검색량 내림차순)."""
    if not isinstance(payload, dict):
        return []
    rows = payload.get("keywordList")
    if not isinstance(rows, list):
        return []

    parsed: list[RelatedKeyword] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        keyword = str(row.get("relKeyword") or "").strip()
        if not keyword:
            continue
        pc = _to_int(row.get("monthlyPcQcCnt"))
        mobile = _to_int(row.get("monthlyMobileQcCnt"))
        parsed.append(
            RelatedKeyword(
                rank=0,  # 아래 정렬 후 매긴다.
                keyword=keyword,
                monthly_searches=pc + mobile,
                pc_searches=pc,
                mobile_searches=mobile,
                competition=str(row.get("compIdx") or ""),
            )
        )

    parsed.sort(key=lambda k: (-k.monthly_searches, k.keyword))
    for index, item in enumerate(parsed, start=1):
        item.rank = index
    return parsed
