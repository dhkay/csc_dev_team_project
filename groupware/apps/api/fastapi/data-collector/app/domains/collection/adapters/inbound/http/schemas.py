"""소스 라우트가 공유하는 응답 봉투.

수집 결과의 겉면은 소스가 달라도 같다. 언제 모았는지, 지금 어떤 상태인지, 완료 시 몇 개인지는
커널이 정하는 사실이라 소스마다 다시 정의할 이유가 없다. 안쪽 items 의 형태만 소스가 소유한다.

소스마다 이 봉투를 복사해 두면 status 설명이 조금씩 갈리고, 결국 어떤 소스는 "비어 있으면 수집 중"
같은 잘못된 안내를 갖게 된다. 그 판단은 한 문장으로 고정한다.

datalab 은 이 봉투를 쓰지 않는다. 그 응답의 같은 자리 필드 이름이 `expectedBuckets` 인데,
이미 csc-marketing 이 그 이름으로 읽고 있어 바꾸면 소비자가 깨진다. 이름이 다른 것은 실수가
아니라 계약을 지킨 결과다.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from .....collection.core.domain.types import CollectionStatus


class EnqueueResponse(BaseModel):
    """재수집 작업 등록 결과.

    반환 타입을 dict 로 두면 문서에 `additionalProperties` 로만 노출되어 어떤 필드가 오는지
    알 수 없다. 그래서 스키마로 고정한다.
    """

    enqueued: bool = Field(
        description=(
            "다시 수집하라는 요청이 접수됐는지 여부. 수집이 완료됐다는 뜻은 아니다."
            " 결과는 같은 소스의 조회 엔드포인트로 확인한다."
        )
    )


class CollectionEnvelope(BaseModel):
    """수집 결과 응답의 공통 부분. 소스별 응답이 이것을 상속해 자기 items 를 더한다."""

    status: CollectionStatus = Field(
        description=(
            "현재 상태. `ok` 는 데이터가 있음, `collecting` 은 아직 수집 중,"
            " `failed` 는 수집했으나 데이터를 얻지 못함을 뜻한다."
            " 결과가 비어 있다는 이유로 수집 중이라고 판단하지 않고 이 값을 사용한다."
        )
    )
    collectedAt: datetime | None = Field(
        default=None,
        description="마지막으로 수집한 시각. 수집한 적이 없으면 null 이다.",
    )
    expectedItems: int = Field(
        description=(
            "수집이 완료됐을 때의 항목 수(상한). 진행률의 분모로 사용하며 수집 전에도 값이"
            " 채워진다. 원본이 더 적게 주는 경우 실제 개수는 이보다 적을 수 있다."
        )
    )
