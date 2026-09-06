"""lab Inbound Adapter: 아직 실사용하지 않는 외부 API 검증 라우트.

경로는 업스트림 경로를 그대로 흉내낸다(`/naver/datalab/search` ↔ `openapi.naver.com/v1/datalab/search`).
Scalar 에서 본 것과 sandbox/api-test 의 실측 항목을 눈으로 대조할 수 있어야 하기 때문이다.

호출자를 scalar-gateway 로 좁힌다. "실사용 아님" 을 주석이 아니라 403 으로 보장한다. 실제 소비자가
생기면 그때 이 목록을 넓힌다(그 시점이 곧 실사용 승격 시점이다).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from csc_net_utils import require_services

from ....core.application.ports.inbound import LabProbePort
from . import mappers
from .schemas import (
    KeywordToolProbeResponse,
    ProbeResponse,
    SearchTrendRequest,
    ShoppingCategoriesRequest,
    ShoppingKeywordAgeRequest,
)

router = APIRouter(
    prefix="/naver",
    tags=["lab"],
    dependencies=[Depends(require_services("scalar-gateway"))],
)


def get_lab_probe_service() -> LabProbePort:
    # 실제 provider 는 app/main.py 에서 오버라이드된다.
    raise NotImplementedError


@router.post(
    "/datalab/search",
    response_model=ProbeResponse,
    summary="[LAB-001] 데이터랩 검색어 트렌드 프로브",
)
async def datalab_search(
    body: SearchTrendRequest,
    service: LabProbePort = Depends(get_lab_probe_service),
) -> ProbeResponse:
    result = await service.datalab_search(mappers.to_search_trend_query(body))
    return mappers.to_probe_response(result)


@router.post(
    "/datalab/shopping/categories",
    response_model=ProbeResponse,
    summary="[LAB-002] 쇼핑인사이트 분야별 프로브",
)
async def shopping_categories(
    body: ShoppingCategoriesRequest,
    service: LabProbePort = Depends(get_lab_probe_service),
) -> ProbeResponse:
    result = await service.shopping_categories(
        mappers.to_shopping_categories_query(body)
    )
    return mappers.to_probe_response(result)


@router.post(
    "/datalab/shopping/keyword-age",
    response_model=ProbeResponse,
    summary="[LAB-003] 쇼핑인사이트 키워드 연령별 프로브",
)
async def shopping_keyword_age(
    body: ShoppingKeywordAgeRequest,
    service: LabProbePort = Depends(get_lab_probe_service),
) -> ProbeResponse:
    result = await service.shopping_keyword_age(
        mappers.to_shopping_keyword_age_query(body)
    )
    return mappers.to_probe_response(result)


@router.get(
    "/searchad/keywordstool",
    response_model=KeywordToolProbeResponse,
    summary="[LAB-004] 검색광고 키워드도구 프로브",
)
async def searchad_keywordstool(
    hintKeywords: list[str] = Query(
        ..., min_length=1, max_length=5, description="씨앗 키워드(최대 5개)"
    ),
    showDetail: bool = Query(default=True),
    month: str | None = Query(default=None, description="예: 202608"),
    limit: int = Query(default=20, ge=1, le=200, description="normalized 절단 개수"),
    service: LabProbePort = Depends(get_lab_probe_service),
) -> KeywordToolProbeResponse:
    query = mappers.to_keyword_tool_query(hintKeywords, showDetail, month, limit)
    result, normalized = await service.searchad_keywords(query)
    return mappers.to_keyword_tool_response(result, normalized)
