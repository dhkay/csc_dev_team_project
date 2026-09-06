"""요청/응답 Pydantic 스키마."""

from __future__ import annotations

from pydantic import BaseModel, Field

from .....collection.adapters.inbound.http.schemas import CollectionEnvelope
from ....core.domain.types import Period


class TrendPointSchema(BaseModel):
    date: str = Field(
        description=(
            "그 점의 날짜. 일간은 `2026-08-10`, 주간은 그 주 시작일, 월간은 그 달 1일로 온다."
        )
    )
    ratio: float = Field(
        description=(
            "그 시점의 상대적 검색 정도. 조회 구간에서 가장 많이 검색된 시점이 100 이고 나머지는"
            " 그에 대한 비율이다. **검색 횟수가 아니다.** 서로 다른 키워드의 값을 비교하거나"
            " 구간이 다른 결과를 이어 붙이면 안 된다."
        )
    )


class SearchTrendResponse(CollectionEnvelope):
    keyword: str = Field(description="조회한 검색어.")
    period: Period = Field(description="조회한 기간 단위.")
    points: list[TrendPointSchema] = Field(
        default=[], description="검색 추이. 최신 시점이 맨 앞에 온다."
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "keyword": "김치찌개",
                "period": "monthly",
                "status": "ok",
                "collectedAt": "2026-08-11T02:57:42.438190Z",
                "expectedItems": 12,
                "points": [
                    {"date": "2026-08-01", "ratio": 30.28},
                    {"date": "2026-07-01", "ratio": 96.35},
                    {"date": "2026-06-01", "ratio": 100.0},
                ],
            }
        }
    }
