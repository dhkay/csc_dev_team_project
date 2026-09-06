"""타깃 유도: 씨앗 키워드 → 커널 타깃.

라우터와 플러그인이 같은 함수를 쓴다. 두 곳이 각자 키를 만들면 API 가 조회하는 행과 워커가
쓰는 행이 갈려서, 수집은 되는데 화면은 영원히 비는 상태가 된다.

키워드는 공백을 지우고 소문자로 맞춰 정규화한다. 검색광고 API 자체가 공백을 무시하므로,
정규화하지 않으면 `수분 크림` 과 `수분크림` 이 같은 결과를 두 행으로 저장한다.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from ....collection.core.domain.entities import CollectionTarget
from .types import SOURCE_ID


def normalize_keyword(keyword: str) -> str:
    return keyword.replace(" ", "").strip().lower()


def make_target(keyword: str) -> CollectionTarget:
    value = normalize_keyword(keyword)
    return CollectionTarget(
        source=SOURCE_ID,
        target_key=f"keyword:{value}",
        # 재수집에 필요한 전부. 절대 시각이 없어 크론이 언제 돌아도 같은 의미다.
        params={"keyword": value},
    )


def target_from_params(params: Mapping[str, Any]) -> CollectionTarget:
    return make_target(str(params["keyword"]))
