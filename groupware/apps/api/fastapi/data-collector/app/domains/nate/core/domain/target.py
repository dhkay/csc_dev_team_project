"""타깃 유도: 고를 것이 없는 소스라 타깃도 하나다.

그래도 함수를 두는 이유는 라우터와 플러그인이 같은 키를 써야 하기 때문이다. 두 곳이 각자
키를 만들면 API 가 조회하는 행과 워커가 쓰는 행이 갈려서, 수집은 되는데 화면은 영원히 빈다.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from ....collection.core.domain.entities import CollectionTarget
from .types import SOURCE_ID, TARGET_KEY


def make_target() -> CollectionTarget:
    return CollectionTarget(source=SOURCE_ID, target_key=TARGET_KEY, params={})


def target_from_params(params: Mapping[str, Any]) -> CollectionTarget:
    # 받을 파라미터가 없다. 시그니처는 SourcePlugin 계약을 맞추기 위한 것이다.
    del params
    return make_target()
