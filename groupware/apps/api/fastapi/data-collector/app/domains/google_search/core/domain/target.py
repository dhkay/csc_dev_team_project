"""타깃 유도: 검색어 → 커널 타깃.

라우터와 플러그인이 같은 함수를 쓴다. 두 곳이 각자 키를 만들면 API 가 조회하는 행과 워커가
쓰는 행이 갈려서, 수집은 되는데 화면은 영원히 비는 상태가 된다. 쿼터가 좁은 소스라 이 어긋남은
곧바로 낭비이기도 하다(수집한 것을 아무도 읽지 못한다).
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from ....collection.core.domain.entities import CollectionTarget
from .types import SOURCE_ID


def normalize_keyword(keyword: str) -> str:
    # 검색어라 공백이 의미를 가진다. 다듬기만 한다.
    return " ".join(keyword.split()).lower()


def make_target(keyword: str) -> CollectionTarget:
    value = normalize_keyword(keyword)
    return CollectionTarget(
        source=SOURCE_ID,
        target_key=f"q:{value}",
        params={"keyword": value},
    )


def target_from_params(params: Mapping[str, Any]) -> CollectionTarget:
    return make_target(str(params["keyword"]))
