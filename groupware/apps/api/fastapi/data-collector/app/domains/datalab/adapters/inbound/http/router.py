"""Inbound Adapter: APIRouter. 내부 전용(서비스토큰).

호출 주체는 늘 수 있으므로 여기 적지 않는다. 현재 토폴로지는
`.claude/rules/security-architecture.md` 의 호출자 표가 단일 출처다.

경로의 `datalab` 과 소스 이름 `NAVER_SHOPPING_INSIGHT` 는 같은 것을 가리킨다.
데이터랩(datalab.naver.com)은 네이버가 인사이트를 모아 서비스하는 사이트이고, 쇼핑인사이트는
그 안의 섹션이다(실제 주소 `datalab.naver.com/shoppingInsight/sCategory.naver`). 경로는 벤더
엔드포인트를 따르고, 카탈로그, AI 도구, 조직 설정은 제품 이름 하나(NAVER_SHOPPING_INSIGHT)만 쓴다.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from .....catalog.adapters.inbound.http.deps import get_source_catalog
from .....catalog.core.application.ports.inbound import SourceCatalogPort
from .....collection.core.application.ports.inbound import CollectionInboundPort
from ....core.domain.categories import DATALAB_CATEGORIES
from ....core.domain.codec import decode_buckets
from ....core.domain.target import make_target
from ....core.domain.types import KEEP_COUNT, SOURCE_ID, Period
from .schemas import (
    EnqueueResponse,
    KeywordBucketSchema,
    KeywordRankResponse,
    KeywordRankSchema,
)

router = APIRouter(prefix="/datalab/shopping-keywords", tags=["shopping-insight"])

# 분야 목록을 파라미터 설명에 직접 싣는다. 값을 알려고 다른 엔드포인트를 먼저 호출하게 만들면
#   Try-it-out 하는 사람은 결국 아무 숫자나 넣어 보게 된다.
#
# 이건 "소비자가 수집 선택지를 상수로 갖지 않는다"는 규칙을 어기는 게 아니다. 이 목록은
#   DATALAB_CATEGORIES 에서 생성되고, 그 상수는 카탈로그 응답(GET /sources/{id}/options)의
#   출처이기도 하다. 즉 소유자가 자기 데이터를 공개하는 것이지 어딘가에 복사본을 만드는 게 아니다.
#   손으로 12개를 적어 넣는 순간부터가 복제다.
_CID_VALUES = [cid for cid, _ in DATALAB_CATEGORIES]
_CID_DESC = (
    "조회할 분야를 지정한다. 아래 값만 유효하며 그 외에는 400 을 반환한다."
    " `GET /sources/NAVER_SHOPPING_INSIGHT/options` 의 `categories[].value` 와 같은 목록이다.\n\n"
) + "\n".join(f"- `{cid}` {label}" for cid, label in DATALAB_CATEGORIES)


def get_collection_service() -> CollectionInboundPort:
    # 실제 provider 는 app/main.py 에서 오버라이드된다.
    raise NotImplementedError


def _validated_cid(cid: str, catalog: SourceCatalogPort) -> str:
    """분야를 카탈로그로 검증한다.

    검증이 없으면 알 수 없는 cid 가 그대로 벤더에 전달되고, 빈 응답이 "아직 수집 중"과
    구분되지 않아 화면이 영구 로딩으로 굳는다(그리고 5초 폴링이 멈추지 않는다).
    즉시 400 을 주는 편이 모든 면에서 낫다.
    """
    value = cid.strip()
    if not catalog.is_valid_category(SOURCE_ID, value):
        raise HTTPException(status_code=400, detail=f"지원하지 않는 분야입니다: {cid}")
    return value


@router.get(
    "/latest",
    response_model=KeywordRankResponse,
    summary="[DATALAB-001] 네이버 쇼핑인사이트 인기 검색어 최신 조회",
    responses={
        400: {
            "description": (
                "지원하지 않는 분야 코드(`cid`). 유효한 값은"
                " `GET /sources/NAVER_SHOPPING_INSIGHT/options` 의 `categories[].value` 다."
            )
        },
    },
    description=(
        "네이버 데이터랩 쇼핑인사이트에서 **분야별 인기 검색어**를 조회한다. 예를 들어"
        " 화장품/미용 분야를 일간으로 조회하면 최근 12일치를 날짜마다 상위 10개 키워드로 받는다."
        " 특정 분야에서 최근 무엇이 많이 검색됐는지 파악할 때 사용한다.\n\n"
        "응답의 `buckets` 는 **날짜 하나분의 묶음**이다. 각 묶음에 그날의 키워드가 순위(`rank`)와"
        " 함께 들어 있으며, 최신 날짜가 맨 앞에 온다.\n\n"
        "이 요청은 미리 수집해 둔 결과를 반환한다. 데이터가 없거나 오래된 경우 새로 수집하도록"
        " 예약한 뒤 곧바로 응답한다. 실제 수집은 별도 작업으로 처리되며 보통 몇 초 걸린다."
        " 조회할 때마다 자동으로 갱신되므로 별도의 갱신 요청은 필요하지 않다.\n\n"
        "**화면에서는 `status` 로 처리를 나눈다.**\n"
        "- `ok`: 데이터가 있다. `buckets` 를 그대로 사용한다.\n"
        "- `collecting`: 아직 수집 중이다. `buckets` 가 비어 있으므로 로딩 상태로 두고 잠시 뒤"
        " 다시 조회한다.\n"
        "- `failed`: 수집했으나 데이터를 얻지 못했다. 다시 조회해도 해결되지 않으므로 오류로"
        " 표시한다.\n\n"
        "`expectedBuckets` 는 수집이 완료됐을 때의 개수다(일간 12, 주간 12, 월간 3). 진행률의"
        " 분모로 사용한다. 수집 전에도 값이 채워진다."
    ),
)
async def get_latest(
    cid: str = Query(
        ...,
        min_length=1,
        max_length=32,
        description=_CID_DESC,
        # 문서에만 enum 을 싣는다(타입은 str 유지). 검증은 카탈로그가 하고 400 을 준다:
        #   그래야 "오타"와 "형식 오류"가 같은 422 로 뭉개지지 않는다.
        json_schema_extra={"enum": _CID_VALUES, "example": _CID_VALUES[2]},
    ),
    period: Period = Query(...),
    service: CollectionInboundPort = Depends(get_collection_service),
    catalog: SourceCatalogPort = Depends(get_source_catalog),
) -> KeywordRankResponse:
    value = _validated_cid(cid, catalog)
    snapshot = await service.get_latest(make_target(value, period))
    buckets = decode_buckets(snapshot.items)
    return KeywordRankResponse(
        cid=value,
        period=period,
        status=snapshot.status,
        collectedAt=snapshot.collected_at,
        expectedBuckets=KEEP_COUNT[period],
        buckets=[
            KeywordBucketSchema(
                date=b.date,
                keywords=[
                    KeywordRankSchema(rank=k.rank, keyword=k.keyword)
                    for k in b.keywords
                ],
            )
            for b in buckets
        ],
    )


@router.post(
    "/refresh",
    summary="[DATALAB-002] 네이버 쇼핑인사이트 인기 검색어 다시 모으기 (운영용)",
    response_model=EnqueueResponse,
    responses={
        400: {
            "description": (
                "지원하지 않는 분야 코드(`cid`). 유효한 값은"
                " `GET /sources/NAVER_SHOPPING_INSIGHT/options` 의 `categories[].value` 다."
            )
        },
    },
    description=(
        "지정한 분야와 기간을 **다시 수집하도록 요청한다.** 최신 데이터가 있어도 다시 수집한다.\n\n"
        "일반 조회 경로에서는 필요하지 않다."
        " 조회(`GET /datalab/shopping-keywords/latest`)가 필요할 때 자동으로 갱신하기 때문이다."
        " 자동 갱신을 기다리지 않고 즉시 다시 수집해야 하는 운영 상황에서 사용한다.\n\n"
        "요청을 접수한 뒤 곧바로 응답한다. 따라서 `enqueued: true` 는 **접수됐다**는 뜻이며"
        " 수집이 끝났다는 뜻이 아니다. 결과는 위 조회로 확인한다(보통 몇 초 뒤 반영된다)."
        " 같은 대상으로 여러 번 요청해도 수집은 한 번만 실행된다."
    ),
)
async def refresh(
    cid: str = Query(
        ...,
        min_length=1,
        max_length=32,
        description=_CID_DESC,
        # 문서에만 enum 을 싣는다(타입은 str 유지). 검증은 카탈로그가 하고 400 을 준다:
        #   그래야 "오타"와 "형식 오류"가 같은 422 로 뭉개지지 않는다.
        json_schema_extra={"enum": _CID_VALUES, "example": _CID_VALUES[2]},
    ),
    period: Period = Query(...),
    service: CollectionInboundPort = Depends(get_collection_service),
    catalog: SourceCatalogPort = Depends(get_source_catalog),
) -> EnqueueResponse:
    value = _validated_cid(cid, catalog)
    await service.enqueue_refresh(make_target(value, period))
    return EnqueueResponse(enqueued=True)
