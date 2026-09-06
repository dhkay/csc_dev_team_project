"""요청/응답 Pydantic 스키마."""

from __future__ import annotations

from pydantic import BaseModel, Field

from .....collection.adapters.inbound.http.schemas import CollectionEnvelope


class RelatedKeywordSchema(BaseModel):
    rank: int = Field(description="총 검색량 순위. 1 이 가장 많이 검색되는 말이다.")
    keyword: str = Field(description="연관 검색어.")
    monthlySearches: int = Field(
        description=(
            "월간 총 검색 수(PC + 모바일). 검색량이 아주 적어 벤더가 구간으로만 알려 주는 경우"
            " 0 으로 온다."
        )
    )
    pcSearches: int = Field(description="월간 PC 검색 수.")
    mobileSearches: int = Field(description="월간 모바일 검색 수.")
    competition: str = Field(
        description="광고 경쟁 정도(높음/중간/낮음). 등급 문자열이며 숫자가 아니다."
    )


class RelatedKeywordResponse(CollectionEnvelope):
    keyword: str = Field(description="조회한 씨앗 키워드(공백은 제거되어 정규화된다).")
    keywords: list[RelatedKeywordSchema] = Field(
        default=[], description="연관 검색어. 총 검색량이 많은 순서로 들어 있다."
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "keyword": "김치찌개",
                "status": "ok",
                "collectedAt": "2026-08-11T02:57:42.438190Z",
                "expectedItems": 100,
                "keywords": [
                    {
                        "rank": 1,
                        "keyword": "김치찌개",
                        "monthlySearches": 74950,
                        "pcSearches": 6250,
                        "mobileSearches": 68700,
                        "competition": "중간",
                    }
                ],
            }
        }
    }
