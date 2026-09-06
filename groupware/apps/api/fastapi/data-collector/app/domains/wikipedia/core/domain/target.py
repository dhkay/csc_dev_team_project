"""타깃 유도: (언어, 문서 제목) → 커널 타깃.

라우터와 플러그인이 같은 함수를 쓴다. 두 곳이 각자 키를 만들면 API 가 조회하는 행과 워커가
쓰는 행이 갈려서, 수집은 되는데 화면은 영원히 비는 상태가 된다.

제목은 공백을 언더스코어로 바꿔 정규화한 뒤 키에 넣는다. 위키백과가 둘을 같은 문서로 보므로,
정규화하지 않으면 `김치 찌개` 와 `김치_찌개` 가 같은 문서를 두 행으로 저장한다.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from ....collection.core.domain.entities import CollectionTarget
from .types import SOURCE_ID, Language


def normalize_title(title: str) -> str:
    return title.strip().replace(" ", "_")


def make_target(lang: Language, title: str) -> CollectionTarget:
    value = normalize_title(title)
    return CollectionTarget(
        source=SOURCE_ID,
        target_key=f"{lang.value}:{value}",
        # 재수집에 필요한 전부. 절대 시각이 없어 크론이 언제 돌아도 같은 의미다.
        params={"lang": lang.value, "title": value},
    )


def target_from_params(params: Mapping[str, Any]) -> CollectionTarget:
    return make_target(Language(params["lang"]), str(params["title"]))
