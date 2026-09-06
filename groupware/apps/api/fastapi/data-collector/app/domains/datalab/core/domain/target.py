"""타깃 유도: (cid, period) → 커널 타깃.

라우터와 플러그인이 같은 함수를 쓴다. 두 곳이 각자 키를 만들면 API 가 조회하는 행과
워커가 쓰는 행이 갈려서, 수집은 되는데 화면은 영원히 비는 상태가 된다.

수집 커널의 `CollectionTarget` 은 모든 소스가 공유하는 어휘(shared kernel)라 여기서 import 한다.
프레임워크/ORM 이 아니라 순수 dataclass 이므로 core 순수성은 유지된다.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from ....collection.core.domain.entities import CollectionTarget
from .types import SOURCE_ID, Period


def make_target(cid: str, period: Period) -> CollectionTarget:
    value = cid.strip()
    return CollectionTarget(
        source=SOURCE_ID,
        target_key=f"{value}:{period.value}",
        # 재수집에 필요한 전부. 절대 날짜가 없어 크론이 언제 돌아도 같은 의미다.
        params={"cid": value, "period": period.value},
    )


def target_from_params(params: Mapping[str, Any]) -> CollectionTarget:
    return make_target(str(params["cid"]), Period(params["period"]))
