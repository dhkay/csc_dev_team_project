"""Inbound Adapter: APIRouter. 내부 전용(서비스토큰).

호출 주체는 늘 수 있으므로 여기 적지 않는다. 현재 토폴로지는
`.claude/rules/security-architecture.md` 의 호출자 표가 단일 출처다.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from .....catalog.adapters.inbound.http.deps import get_source_catalog
from .....catalog.core.application.ports.inbound import SourceCatalogPort
from .....collection.adapters.inbound.http.schemas import EnqueueResponse
from .....collection.core.application.ports.inbound import CollectionInboundPort
from ....core.domain.codec import decode_keywords
from ....core.domain.target import make_target
from ....core.domain.types import GEOS, KEEP_COUNT, SOURCE_ID
from .schemas import TrendingKeywordResponse, TrendingKeywordSchema

router = APIRouter(prefix="/google/trends", tags=["google-trends"])

# 지역 목록을 파라미터 설명에 직접 싣는다. 값을 알려고 다른 엔드포인트를 먼저 호출하게 만들면
#   Try-it-out 하는 사람은 결국 아무 문자열이나 넣어 보게 된다.
#   손으로 적는 것이 아니라 GEOS 에서 생성한다. 그 상수는 카탈로그 응답의 출처이기도 하므로
#   복사본이 아니라 소유자가 자기 데이터를 공개하는 것이다.
_GEO_VALUES = [geo for geo, _ in GEOS]
_GEO_DESC = (
    "조회할 지역을 지정한다. 아래 값만 유효하며 그 외에는 400 을 반환한다."
    " `GET /sources/GOOGLE_TRENDS/options` 의 `categories[].value` 와 같은 목록이다.\n\n"
) + "\n".join(f"- `{geo}` {label}" for geo, label in GEOS)


def get_collection_service() -> CollectionInboundPort:
    # 실제 provider 는 app/main.py 에서 오버라이드된다.
    raise NotImplementedError


def _validated_geo(geo: str, catalog: SourceCatalogPort) -> str:
    """지역을 카탈로그로 검증한다.

    검증이 없으면 알 수 없는 값이 그대로 벤더에 전달되고, 빈 응답이 "아직 수집 중"과
    구분되지 않아 화면이 영구 로딩으로 굳는다. 즉시 400 을 주는 편이 모든 면에서 낫다.
    """
    value = geo.strip().upper()
    if not catalog.is_valid_category(SOURCE_ID, value):
        raise HTTPException(status_code=400, detail=f"지원하지 않는 지역입니다: {geo}")
    return value


_GEO_400 = {
    400: {
        "description": (
            "지원하지 않는 지역 코드(`geo`). 유효한 값은"
            " `GET /sources/GOOGLE_TRENDS/options` 의 `categories[].value` 다."
        )
    }
}


@router.get(
    "/latest",
    response_model=TrendingKeywordResponse,
    summary="[GTRENDS-001] 구글 트렌드 인기 검색어 최신 조회",
    responses=_GEO_400,
    description=(
        "구글에서 **지금 많이 검색되는 말**을 지역 단위로 조회한다. 대한민국으로 조회하면 그 시점의"
        " 인기 검색어 10건을 순위 순서로 받으며, 각 항목에는 대략적인 검색량과 관련 기사"
        " 하나가 함께 온다. 특정 분야가 아니라 그 지역 전체에서 무엇이 화제인지 파악할 때"
        " 사용한다.\n\n"
        "`approxTraffic` 은 `1000+` 처럼 구간으로 표기된다. 정확한 수치가 아니므로 그대로 표시하고"
        " 숫자 계산에는 사용하지 않는다.\n\n"
        "이 요청은 미리 수집해 둔 결과를 반환한다. 데이터가 없거나 오래된 경우 새로 수집하도록"
        " 예약한 뒤 곧바로 응답한다. 실제 수집은 별도 작업으로 처리되며 보통 몇 초 걸린다."
        " 조회할 때마다 자동으로 갱신되므로 별도의 갱신 요청은 필요하지 않다.\n\n"
        "**화면에서는 `status` 로 처리를 나눈다.**\n"
        "- `ok`: 데이터가 있다. `keywords` 를 그대로 사용한다.\n"
        "- `collecting`: 아직 수집 중이다. `keywords` 가 비어 있으므로 로딩 상태로 두고 잠시 뒤"
        " 다시 조회한다.\n"
        "- `failed`: 수집했으나 데이터를 얻지 못했다. 다시 조회해도 해결되지 않으므로 오류로"
        " 표시한다.\n\n"
        "`expectedItems` 는 수집이 완료됐을 때의 개수다. 진행률의 분모로 사용한다."
    ),
)
async def get_latest(
    geo: str = Query(
        ...,
        min_length=2,
        max_length=8,
        description=_GEO_DESC,
        # 문서에만 enum 을 싣는다(타입은 str 유지). 검증은 카탈로그가 하고 400 을 준다:
        #   그래야 "오타"와 "형식 오류"가 같은 422 로 뭉개지지 않는다.
        json_schema_extra={"enum": _GEO_VALUES, "example": _GEO_VALUES[0]},
    ),
    service: CollectionInboundPort = Depends(get_collection_service),
    catalog: SourceCatalogPort = Depends(get_source_catalog),
) -> TrendingKeywordResponse:
    value = _validated_geo(geo, catalog)
    snapshot = await service.get_latest(make_target(value))
    return TrendingKeywordResponse(
        geo=value,
        status=snapshot.status,
        collectedAt=snapshot.collected_at,
        expectedItems=KEEP_COUNT,
        keywords=[
            TrendingKeywordSchema(
                rank=k.rank,
                keyword=k.keyword,
                approxTraffic=k.approx_traffic,
                newsTitle=k.news_title,
                newsUrl=k.news_url,
            )
            for k in decode_keywords(snapshot.items)
        ],
    )


@router.post(
    "/refresh",
    response_model=EnqueueResponse,
    summary="[GTRENDS-002] 구글 트렌드 인기 검색어 다시 모으기 (운영용)",
    responses=_GEO_400,
    description=(
        "지정한 지역을 **다시 수집하도록 요청한다.** 최신 데이터가 있어도 다시 수집한다.\n\n"
        "일반 조회 경로에서는 필요하지 않다. 조회(`GET /google/trends/latest`)가 필요할 때 자동으로"
        " 갱신하기 때문이다. 자동 갱신을 기다리지 않고 즉시 다시 수집해야 하는 운영 상황에서"
        " 사용한다.\n\n"
        "요청을 접수한 뒤 곧바로 응답한다. 따라서 `enqueued: true` 는 **접수됐다**는 뜻이며 수집이"
        " 끝났다는 뜻이 아니다. 결과는 위 조회로 확인한다(보통 몇 초 뒤 반영된다)."
        " 같은 대상으로 여러 번 요청해도 수집은 한 번만 실행된다."
    ),
)
async def refresh(
    geo: str = Query(
        ...,
        min_length=2,
        max_length=8,
        description=_GEO_DESC,
        json_schema_extra={"enum": _GEO_VALUES, "example": _GEO_VALUES[0]},
    ),
    service: CollectionInboundPort = Depends(get_collection_service),
    catalog: SourceCatalogPort = Depends(get_source_catalog),
) -> EnqueueResponse:
    value = _validated_geo(geo, catalog)
    await service.enqueue_refresh(make_target(value))
    return EnqueueResponse(enqueued=True)
