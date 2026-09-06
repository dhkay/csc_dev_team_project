"""요청/응답 Pydantic 스키마."""

from __future__ import annotations

from pydantic import BaseModel, Field

from .....collection.adapters.inbound.http.schemas import CollectionEnvelope


class RealtimeKeywordSchema(BaseModel):
    rank: int = Field(description="실시간 순위. 1 이 가장 많이 검색된 말이다.")
    keyword: str = Field(description="검색어.")


class RealtimeKeywordResponse(CollectionEnvelope):
    keywords: list[RealtimeKeywordSchema] = Field(
        default=[], description="실시간 검색어. 순위 순서로 들어 있다."
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "status": "ok",
                "collectedAt": "2026-08-11T02:57:42.438190Z",
                "expectedItems": 10,
                "keywords": [
                    {"rank": 1, "keyword": "메가프로젝트 점검회의"},
                    {"rank": 2, "keyword": "청년 AI 만남"},
                ],
            }
        }
    }
