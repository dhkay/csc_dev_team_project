"""Inbound Adapter: APIRouter. 내부 전용(서비스토큰).

호출 주체는 늘 수 있으므로 여기 적지 않는다. 현재 토폴로지는
`.claude/rules/security-architecture.md` 의 호출자 표가 단일 출처다.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from .....collection.adapters.inbound.http.schemas import EnqueueResponse
from .....collection.core.application.ports.inbound import CollectionInboundPort
from ....core.domain.codec import decode_keywords
from ....core.domain.target import make_target
from ....core.domain.types import KEEP_COUNT
from .schemas import RealtimeKeywordResponse, RealtimeKeywordSchema

router = APIRouter(prefix="/nate/realtime-keywords", tags=["nate-realtime"])


def get_collection_service() -> CollectionInboundPort:
    # 실제 provider 는 app/main.py 에서 오버라이드된다.
    raise NotImplementedError


@router.get(
    "/latest",
    response_model=RealtimeKeywordResponse,
    summary="[NATE-001] 네이트 실시간 검색어 최신 조회",
    description=(
        "지금 이 시각 **국내에서 실시간으로 많이 검색되는 말** 10건을 순위 순서로 조회한다."
        " 분야를 나누지 않은 전체 목록이라, 특정 주제가 아니라 지금 무엇이 화제인지 볼 때"
        " 사용한다.\n\n"
        "고를 항목이 없다. 이 소스는 목록 하나만 제공하므로 파라미터도 없다.\n\n"
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
    service: CollectionInboundPort = Depends(get_collection_service),
) -> RealtimeKeywordResponse:
    snapshot = await service.get_latest(make_target())
    return RealtimeKeywordResponse(
        status=snapshot.status,
        collectedAt=snapshot.collected_at,
        expectedItems=KEEP_COUNT,
        keywords=[
            RealtimeKeywordSchema(rank=k.rank, keyword=k.keyword)
            for k in decode_keywords(snapshot.items)
        ],
    )


@router.post(
    "/refresh",
    response_model=EnqueueResponse,
    summary="[NATE-002] 네이트 실시간 검색어 다시 모으기 (운영용)",
    description=(
        "실시간 검색어를 **다시 수집하도록 요청한다.** 최신 데이터가 있어도 다시 수집한다.\n\n"
        "일반 조회 경로에서는 필요하지 않다. 조회(`GET /nate/realtime-keywords/latest`)가 필요할"
        " 때 자동으로 갱신하기 때문이다. 자동 갱신을 기다리지 않고 즉시 다시 수집해야 하는 운영"
        " 상황에서 사용한다.\n\n"
        "요청을 접수한 뒤 곧바로 응답한다. 따라서 `enqueued: true` 는 **접수됐다**는 뜻이며 수집이"
        " 끝났다는 뜻이 아니다. 결과는 위 조회로 확인한다(보통 몇 초 뒤 반영된다)."
        " 여러 번 요청해도 수집은 한 번만 실행된다."
    ),
)
async def refresh(
    service: CollectionInboundPort = Depends(get_collection_service),
) -> EnqueueResponse:
    await service.enqueue_refresh(make_target())
    return EnqueueResponse(enqueued=True)
