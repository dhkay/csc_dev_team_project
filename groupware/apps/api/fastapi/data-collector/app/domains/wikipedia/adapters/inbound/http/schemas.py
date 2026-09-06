"""요청/응답 Pydantic 스키마."""

from __future__ import annotations

from pydantic import BaseModel, Field

from .....collection.adapters.inbound.http.schemas import CollectionEnvelope
from ....core.domain.types import Language


class ArticleSummarySchema(BaseModel):
    title: str = Field(
        description=(
            "위키백과가 확정한 문서 제목. 리다이렉트가 따라가므로 요청한 제목과 다를 수 있으며,"
            " 화면에는 이 값을 표시한다."
        )
    )
    extract: str = Field(description="문서 서두 요약(평문).")
    url: str = Field(description="문서 주소.")
    thumbnailUrl: str = Field(
        description="대표 이미지 주소. 이미지가 없거나 한국어판이면 빈 문자열이다."
    )


class ArticleSummaryResponse(CollectionEnvelope):
    lang: Language = Field(description="조회한 언어판.")
    title: str = Field(description="조회한 문서 제목(공백은 언더스코어로 정규화된다).")
    articles: list[ArticleSummarySchema] = Field(
        default=[],
        description=(
            "문서 요약. 문서 하나를 조회하므로 최대 1건이다. 그런 문서가 없으면 빈 배열이다."
        ),
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "lang": "ko",
                "title": "김치찌개",
                "status": "ok",
                "collectedAt": "2026-08-11T02:57:42.438190Z",
                "expectedItems": 1,
                "articles": [
                    {
                        "title": "김치찌개",
                        "extract": "김치찌개는 대표적인 한국 요리 가운데 하나로, 김치를 넣고 얼큰하게 끓인 찌개이다.",
                        "url": "https://ko.wikipedia.org/wiki/김치찌개",
                        "thumbnailUrl": "",
                    }
                ],
            }
        }
    }
