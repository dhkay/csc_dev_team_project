"""카탈로그 도메인 타입."""

from __future__ import annotations

from enum import Enum


class SourceStatus(str, Enum):
    """소비자가 알아야 하는 소스 상태.

    수집 방식(크롤/공식 API)은 여기 없다. 소비자가 그 차이로 할 수 있는 일이 없고,
    수집 구현은 수집기만 아는 정보다. 화면에 필요한 건 "지금 쓸 수 있나" 하나다.
    """

    AVAILABLE = "available"  # 수집 구현이 있고 지금 쓸 수 있다
    PLANNED = "planned"  # 서술자만 있고 아직 수집 구현이 없다
