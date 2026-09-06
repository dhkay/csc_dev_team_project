"""수집 커널 엔티티 (순수: SQLAlchemy/FastAPI/httpx import 없음).

커널은 items 의 내용을 해석하지 않는다. 내용의 의미는 소스가 소유하고, 커널은
"언제 모았고, 몇 개 남기고, 비면 덮어쓰지 않는다"만 안다.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from .types import CollectionStatus


@dataclass(frozen=True)
class CollectionTarget:
    """수집 대상 1개.

    동일성은 (source, target_key) 뿐이다. params 는 compare=False 라 eq/hash 에 들어가지
    않는다: 같은 대상을 다른 표기의 params 로 요청해도 한 행, 한 잡으로 수렴한다.

    params 는 그 타깃을 다시 수집하는 데 필요한 전부다. 크론이 target_key 를 역파싱하지 않고
    그대로 재요청할 수 있어야 하기 때문이다(역파싱하면 크론이 소스별 지식을 갖게 된다).

    params 는 상대 표현이어야 한다. 절대 날짜 같은 걸 넣으면 크론이 굳은 창을 영원히 재수집한다.
    """

    source: str
    target_key: str
    params: Mapping[str, Any] = field(default_factory=dict, compare=False)


@dataclass(frozen=True)
class StoredSnapshot:
    """저장소가 돌려주는 원시 행. 상태 판정 전 단계다.

    세 필드가 함께 있어야 상태를 정할 수 있다: items 가 있으면 ok, 없는데 시도 기록도 없으면
    아직 수집 전, 없는데 시도 기록이 있으면 실패.
    """

    items: list[dict[str, Any]] | None
    collected_at: datetime | None
    last_attempted_at: datetime | None


@dataclass
class CollectionSnapshot:
    """한 타깃의 현재 상태 + 최신 결과.

    items 는 소스 codec 이 만든 안정형 JSON 이고 커널에게는 불투명하다.
    미수집이면 items 는 비고 collected_at 은 None 이며, status 가 그 이유를 말한다.
    """

    target: CollectionTarget
    status: CollectionStatus
    items: list[dict[str, Any]]
    collected_at: datetime | None
