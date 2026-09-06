"""수집 커널 타입."""

from __future__ import annotations

from enum import Enum


class CollectionStatus(str, Enum):
    """한 타깃의 수집 상태.

    빈 배열만 돌려주면 소비자가 아직 수집 전인지 수집이 실패했는지 구분할 수 없다. 그러면 UI 가
    빈 배열을 전부 수집 중으로 해석해, 영영 성공하지 못하는 타깃이 영구 로딩으로 굳는다.
    상태는 추측이 아니라 응답에 실린다.
    """

    OK = "ok"  # 수집된 데이터가 있다
    COLLECTING = "collecting"  # 아직 한 번도 수집을 시도하지 않았다(잡은 등록됨)
    FAILED = "failed"  # 시도했으나 쓸 데이터를 얻지 못했다
