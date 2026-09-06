"""요청/응답 Pydantic 스키마."""

from __future__ import annotations

from pydantic import BaseModel, Field

from .....collection.adapters.inbound.http.schemas import CollectionEnvelope


class TrendingKeywordSchema(BaseModel):
    rank: int = Field(description="인기 순위. 1 이 가장 많이 검색된 키워드다.")
    keyword: str = Field(description="검색어.")
    approxTraffic: str = Field(
        description=(
            "대략적인 검색량. `1000+` 처럼 구간으로 표기된다. 정확한 수치가 아니므로 그대로"
            " 표시하고 숫자 계산에 쓰지 않는다. 값이 없으면 빈 문자열이다."
        )
    )
    newsTitle: str = Field(
        description="그 검색어와 함께 제공되는 관련 기사 제목. 없으면 빈 문자열이다."
    )
    newsUrl: str = Field(description="관련 기사 주소. 없으면 빈 문자열이다.")


class TrendingKeywordResponse(CollectionEnvelope):
    geo: str = Field(description="조회한 지역 코드.")
    keywords: list[TrendingKeywordSchema] = Field(
        default=[], description="인기 검색어. 순위 순서로 들어 있다."
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "geo": "KR",
                "status": "ok",
                "collectedAt": "2026-08-11T02:57:42.438190Z",
                "expectedItems": 20,
                "keywords": [
                    {
                        "rank": 1,
                        "keyword": "우트로",
                        "approxTraffic": "2000+",
                        "newsTitle": "K-푸드, 우트로 박람회에서 3538만 달러 수출",
                        "newsUrl": "https://example.com/article/1",
                    }
                ],
            }
        }
    }
