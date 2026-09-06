"""lab 요청/응답 스키마 (Pydantic).

예시 값(json_schema_extra)은 sandbox/api-test 의 실측 요청에서 그대로 가져왔다. Scalar Try-it-out 은
본문이 미리 채워져 있어야 쓸모가 있고, 그 값이 실측과 같아야 응답을 대조할 수 있다.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from ....core.domain.types import LabSource, ProbeOutcome

TimeUnit = Literal["date", "week", "month"]


# ---- 응답 ----


class UpstreamSchema(BaseModel):
    """업스트림 왕복 기록. body 는 가공하지 않은 원본이다."""

    method: str
    url: str
    status: int
    elapsedMs: int
    sentHeaders: list[str] = Field(
        description="보낸 헤더 **이름만**. 네 API 모두 헤더로 인증하므로 값은 싣지 않는다."
    )
    requestBody: Any | None = None
    body: Any | None = None


class ProbeResponse(BaseModel):
    """프로브 응답.

    업스트림에 닿았다면 이 응답의 HTTP 상태는 항상 200 이다. 업스트림의 4xx/5xx 는
    `upstream.status` 로 드러난다. 우리 401(서비스토큰 거부)과 업스트림 401(네이버 스코프)은
    고치는 방법이 전혀 다르므로, 화면에 보이는 401 이 하나뿐이어야 진단이 된다.
    """

    source: LabSource
    outcome: ProbeOutcome
    upstream: UpstreamSchema | None = None
    hint: str | None = Field(default=None, description="알려진 실패 패턴의 조치 안내")
    missingEnv: list[str] = Field(
        default_factory=list, description="미설정 자격증명 변수명"
    )
    error: str | None = Field(
        default=None, description="우리 쪽 실패 사유(업스트림 본문이 아니다)"
    )


class KeywordVolumeSchema(BaseModel):
    keyword: str
    monthlySearches: int


class NormalizedKeywordsSchema(BaseModel):
    """LAB-004 정규화 결과. 절단 여부를 반드시 함께 싣는다(말 없는 절단은 거짓말이 된다)."""

    keywords: list[KeywordVolumeSchema]
    returned: int
    total: int
    truncated: bool


class KeywordToolProbeResponse(ProbeResponse):
    normalized: NormalizedKeywordsSchema | None = None


# ---- 요청 ----


class KeywordGroupSchema(BaseModel):
    groupName: str
    keywords: list[str] = Field(min_length=1, max_length=20)


class SearchTrendRequest(BaseModel):
    startDate: str
    endDate: str
    timeUnit: TimeUnit
    keywordGroups: list[KeywordGroupSchema] = Field(min_length=1, max_length=5)
    device: str | None = None
    gender: str | None = None
    ages: list[str] = Field(default_factory=list)

    model_config = {
        "json_schema_extra": {
            "example": {
                "startDate": "2026-05-01",
                "endDate": "2026-08-01",
                "timeUnit": "month",
                "keywordGroups": [
                    {"groupName": "kimchi-jjigae", "keywords": ["김치찌개"]}
                ],
            }
        }
    }


class CategorySpecSchema(BaseModel):
    name: str
    param: list[str] = Field(min_length=1)


class ShoppingCategoriesRequest(BaseModel):
    startDate: str
    endDate: str
    timeUnit: TimeUnit
    category: list[CategorySpecSchema] = Field(min_length=1, max_length=3)
    device: str | None = None
    gender: str | None = None
    ages: list[str] = Field(default_factory=list)

    model_config = {
        "json_schema_extra": {
            "example": {
                "startDate": "2026-05-01",
                "endDate": "2026-08-01",
                "timeUnit": "month",
                "category": [{"name": "패션의류", "param": ["50000000"]}],
            }
        }
    }


class ShoppingKeywordAgeRequest(BaseModel):
    startDate: str
    endDate: str
    timeUnit: TimeUnit
    category: str = Field(
        description="분야 cid **단수 문자열**(분야별 API 와 달리 배열이 아니다)"
    )
    keyword: str

    model_config = {
        "json_schema_extra": {
            "example": {
                "startDate": "2026-05-01",
                "endDate": "2026-08-01",
                "timeUnit": "month",
                "category": "50000000",
                "keyword": "원피스",
            }
        }
    }
