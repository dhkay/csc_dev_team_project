"""Inbound Adapter: APIRouter. 내부 전용(서비스토큰).

호출 주체는 늘 수 있으므로 여기 적지 않는다. 현재 토폴로지는
`.claude/rules/security-architecture.md` 의 호출자 표가 단일 출처다.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from .....collection.adapters.inbound.http.schemas import EnqueueResponse
from .....collection.core.application.ports.inbound import CollectionInboundPort
from ....core.domain.codec import decode_keywords
from ....core.domain.target import make_target, normalize_keyword
from ....core.domain.types import KEEP_COUNT, KEYWORD_MAX_LENGTH
from .schemas import RelatedKeywordResponse, RelatedKeywordSchema

router = APIRouter(prefix="/searchad/keywords", tags=["naver-ad-keyword"])

_KEYWORD_DESC = (
    "연관 검색어를 찾을 씨앗 키워드. 공백은 제거되어 정규화되므로 `수분 크림` 과 `수분크림` 은"
    " 같은 요청으로 다뤄진다. `GET /sources/NAVER_AD_KEYWORD/options` 의 `inputs` 에 이 입력이"
    " 서술되어 있다."
)
_KEYWORD_400 = {400: {"description": "키워드가 비어 있다. 공백만 넣은 경우도 같다."}}


def get_collection_service() -> CollectionInboundPort:
    # 실제 provider 는 app/main.py 에서 오버라이드된다.
    raise NotImplementedError


def _validated_keyword(keyword: str) -> str:
    """키워드를 정규화하고 빈 값을 막는다.

    빈 키워드를 통과시키면 벤더가 빈 응답을 주고, 그 결과가 "아직 수집 중"과 구분되지 않아
    화면이 영구 로딩으로 굳는다. 즉시 400 을 주는 편이 모든 면에서 낫다.
    """
    value = normalize_keyword(keyword)
    if not value:
        raise HTTPException(status_code=400, detail="키워드를 입력해 주세요.")
    return value


@router.get(
    "/latest",
    response_model=RelatedKeywordResponse,
    summary="[ADKEYWORD-001] 네이버 연관 키워드와 검색량 최신 조회",
    responses=_KEYWORD_400,
    description=(
        "키워드 하나를 넣으면 **함께 검색되는 말과 그 월간 검색 수**를 검색량이 많은 순으로"
        " 조회한다. `김치찌개` 로 조회하면 `김치찌개 황금레시피`, `돼지고기 김치찌개` 처럼 실제로"
        " 검색되는 표현과 각각의 검색 수를 받는다. 사람들이 그 주제를 실제로 어떤 말로 찾는지"
        " 확인할 때 사용한다.\n\n"
        "검색 수는 PC 와 모바일이 나뉘어 온다. 같은 총량이라도 모바일에 쏠린 키워드와 고르게"
        " 나뉜 키워드는 성격이 다르므로 둘을 함께 본다.\n\n"
        "검색량이 아주 적은 키워드는 벤더가 정확한 수를 알려 주지 않는다. 그런 항목은 `0` 으로"
        " 온다.\n\n"
        "이 요청은 미리 수집해 둔 결과를 반환한다. 데이터가 없거나 오래된 경우 새로 수집하도록"
        " 예약한 뒤 곧바로 응답한다. 실제 수집은 별도 작업으로 처리되며 보통 몇 초 걸린다.\n\n"
        "**화면에서는 `status` 로 처리를 나눈다.**\n"
        "- `ok`: 데이터가 있다. `keywords` 를 그대로 사용한다.\n"
        "- `collecting`: 아직 수집 중이다. 로딩 상태로 두고 잠시 뒤 다시 조회한다.\n"
        "- `failed`: 수집했으나 데이터를 얻지 못했다. 다시 조회해도 해결되지 않으므로 오류로"
        " 표시한다.\n\n"
        "`expectedItems` 는 수집이 완료됐을 때의 개수다. 진행률의 분모로 사용한다. 연관 검색어가"
        " 적은 키워드는 그보다 적게 온다."
    ),
)
async def get_latest(
    keyword: str = Query(
        ...,
        min_length=1,
        max_length=KEYWORD_MAX_LENGTH,
        description=_KEYWORD_DESC,
        json_schema_extra={"example": "김치찌개"},
    ),
    service: CollectionInboundPort = Depends(get_collection_service),
) -> RelatedKeywordResponse:
    value = _validated_keyword(keyword)
    snapshot = await service.get_latest(make_target(value))
    return RelatedKeywordResponse(
        keyword=value,
        status=snapshot.status,
        collectedAt=snapshot.collected_at,
        expectedItems=KEEP_COUNT,
        keywords=[
            RelatedKeywordSchema(
                rank=k.rank,
                keyword=k.keyword,
                monthlySearches=k.monthly_searches,
                pcSearches=k.pc_searches,
                mobileSearches=k.mobile_searches,
                competition=k.competition,
            )
            for k in decode_keywords(snapshot.items)
        ],
    )


@router.post(
    "/refresh",
    response_model=EnqueueResponse,
    summary="[ADKEYWORD-002] 네이버 연관 키워드 다시 모으기 (운영용)",
    responses=_KEYWORD_400,
    description=(
        "지정한 키워드를 **다시 수집하도록 요청한다.** 최신 데이터가 있어도 다시 수집한다.\n\n"
        "일반 조회 경로에서는 필요하지 않다. 조회(`GET /searchad/keywords/latest`)가 필요할 때"
        " 자동으로 갱신하기 때문이다. 자동 갱신을 기다리지 않고 즉시 다시 수집해야 하는 운영"
        " 상황에서 사용한다.\n\n"
        "요청을 접수한 뒤 곧바로 응답한다. 따라서 `enqueued: true` 는 **접수됐다**는 뜻이며 수집이"
        " 끝났다는 뜻이 아니다. 결과는 위 조회로 확인한다."
        " 같은 대상으로 여러 번 요청해도 수집은 한 번만 실행된다."
    ),
)
async def refresh(
    keyword: str = Query(
        ..., min_length=1, max_length=KEYWORD_MAX_LENGTH, description=_KEYWORD_DESC
    ),
    service: CollectionInboundPort = Depends(get_collection_service),
) -> EnqueueResponse:
    value = _validated_keyword(keyword)
    await service.enqueue_refresh(make_target(value))
    return EnqueueResponse(enqueued=True)
