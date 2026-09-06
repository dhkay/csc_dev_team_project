"""요청/응답 Pydantic 스키마."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from ....core.domain.types import Period
from .....collection.adapters.inbound.http.schemas import EnqueueResponse
from .....collection.core.domain.types import CollectionStatus

__all__ = [
    "EnqueueResponse",
    "KeywordBucketSchema",
    "KeywordRankResponse",
    "KeywordRankSchema",
]


class KeywordRankSchema(BaseModel):
    rank: int = Field(
        description="그 날짜 안에서의 순위. 1 이 가장 많이 검색된 키워드다."
    )
    keyword: str


class KeywordBucketSchema(BaseModel):
    """날짜 하나분의 인기 검색어 묶음."""

    date: str = Field(
        description="날짜 라벨. 일간은 `2026-08-10`, 주간은 그 주 시작일, 월간은 `2026-08` 형식이다."
    )
    keywords: list[KeywordRankSchema] = Field(
        default=[],
        description="그 날짜의 인기 검색어. `rank` 1 위부터 순서대로 들어 있다.",
    )


class KeywordRankResponse(BaseModel):
    cid: str = Field(description="조회한 분야 코드.")
    period: Period
    status: CollectionStatus = Field(
        description=(
            "현재 상태. `ok` 는 데이터가 있음, `collecting` 은 아직 수집 중, "
            "`failed` 는 수집했으나 데이터를 얻지 못함을 뜻한다. "
            "`buckets` 가 비어 있다는 이유로 수집 중이라고 판단하지 않고 이 값을 사용한다."
        )
    )
    collectedAt: datetime | None = Field(
        default=None,
        description="마지막으로 수집한 시각. 수집한 적이 없으면 null 이다.",
    )
    expectedBuckets: int = Field(
        description=(
            "수집이 완료됐을 때의 날짜 개수(일간 12, 주간 12, 월간 3). 진행률의 분모로 사용한다. "
            "수집 전에도 값이 채워진다."
        )
    )
    # 날짜별 버킷(최신순). 미수집이면 빈 배열.
    buckets: list[KeywordBucketSchema] = []

    # 스키마에서 자동 생성되는 예시(cid "string", expectedBuckets 1)는 실제와 동떨어져
    #   포털 독자에게 잘못된 그림을 준다. 실제 응답 모양을 그대로 박아 둔다.
    model_config = {
        "json_schema_extra": {
            "example": {
                "cid": "50000002",
                "period": "daily",
                "status": "ok",
                "collectedAt": "2026-08-11T02:57:42.438190Z",
                "expectedBuckets": 12,
                "buckets": [
                    {
                        "date": "2026-08-10",
                        "keywords": [
                            {"rank": 1, "keyword": "선크림"},
                            {"rank": 2, "keyword": "쿠션"},
                        ],
                    }
                ],
            }
        }
    }
