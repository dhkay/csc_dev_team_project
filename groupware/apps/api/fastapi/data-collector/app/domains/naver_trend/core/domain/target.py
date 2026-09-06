"""타깃 유도: (키워드, 기간) → 커널 타깃.

라우터와 플러그인이 같은 함수를 쓴다. 두 곳이 각자 키를 만들면 API 가 조회하는 행과 워커가
쓰는 행이 갈려서, 수집은 되는데 화면은 영원히 비는 상태가 된다.

params 에 날짜가 없다는 점이 중요하다(types.py 참고). 크론이 언제 돌아도 "지금 기준 최근 30일"
을 다시 모은다.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from ....collection.core.domain.entities import CollectionTarget
from .types import SOURCE_ID, Period


def normalize_keyword(keyword: str) -> str:
    # 검색어라 공백이 의미를 가진다(`제주 여행` 과 `제주여행`은 다른 검색어다). 다듬기만 한다.
    return " ".join(keyword.split()).lower()


def make_target(keyword: str, period: Period) -> CollectionTarget:
    value = normalize_keyword(keyword)
    return CollectionTarget(
        source=SOURCE_ID,
        target_key=f"{period.value}:{value}",
        params={"keyword": value, "period": period.value},
    )


def target_from_params(params: Mapping[str, Any]) -> CollectionTarget:
    return make_target(str(params["keyword"]), Period(params["period"]))
