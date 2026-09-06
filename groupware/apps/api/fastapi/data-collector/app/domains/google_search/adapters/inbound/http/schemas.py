"""요청/응답 Pydantic 스키마."""

from __future__ import annotations

from pydantic import BaseModel, Field

from .....collection.adapters.inbound.http.schemas import CollectionEnvelope


class SearchResultSchema(BaseModel):
    rank: int = Field(description="검색 결과 순위. 1 이 첫 번째 결과다.")
    title: str = Field(description="결과 제목.")
    link: str = Field(description="결과 주소. 추적 파라미터가 붙지 않은 목적지다.")
    snippet: str = Field(description="검색 화면에 함께 나오는 발췌문. 없으면 빈 문자열이다.")
    source: str = Field(description="출처 표기(사이트 이름 또는 표시 주소).")


class SearchResultResponse(CollectionEnvelope):
    keyword: str = Field(description="조회한 검색어.")
    results: list[SearchResultSchema] = Field(
        default=[], description="검색 결과 첫 페이지. 순위 순서로 들어 있다."
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "keyword": "김치찌개",
                "status": "ok",
                "collectedAt": "2026-08-11T02:57:42.438190Z",
                "expectedItems": 10,
                "results": [
                    {
                        "rank": 1,
                        "title": "돼지고기 김치찌개 맛내는 비법",
                        "link": "https://www.10000recipe.com/recipe/1785098",
                        "snippet": "돼지고기와 신김치로 끓이는 기본 레시피.",
                        "source": "만개의레시피",
                    }
                ],
            }
        }
    }
