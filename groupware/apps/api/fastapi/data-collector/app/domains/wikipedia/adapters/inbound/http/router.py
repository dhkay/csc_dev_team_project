"""Inbound Adapter: APIRouter. 내부 전용(서비스토큰).

호출 주체는 늘 수 있으므로 여기 적지 않는다. 현재 토폴로지는
`.claude/rules/security-architecture.md` 의 호출자 표가 단일 출처다.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from .....collection.adapters.inbound.http.schemas import EnqueueResponse
from .....collection.core.application.ports.inbound import CollectionInboundPort
from ....core.domain.codec import decode_summaries
from ....core.domain.target import make_target, normalize_title
from ....core.domain.types import KEEP_COUNT, TITLE_MAX_LENGTH, Language
from .schemas import ArticleSummaryResponse, ArticleSummarySchema

router = APIRouter(prefix="/wikipedia/summary", tags=["wikipedia"])

_TITLE_DESC = (
    "조회할 문서 제목. 공백은 언더스코어로 정규화되므로 `김치 찌개` 와 `김치_찌개` 는 같은"
    " 문서로 다뤄진다. `GET /sources/WIKIPEDIA_SUMMARY/options` 의 `inputs` 에 이 입력이"
    " 서술되어 있다."
)
_TITLE_400 = {
    400: {"description": "문서 제목이 비어 있다. 공백만 넣은 경우도 같다."}
}


def get_collection_service() -> CollectionInboundPort:
    # 실제 provider 는 app/main.py 에서 오버라이드된다.
    raise NotImplementedError


def _validated_title(title: str) -> str:
    """제목을 정규화하고 빈 값을 막는다.

    빈 제목을 그대로 통과시키면 벤더가 빈 응답을 주고, 그 결과가 "아직 수집 중"과 구분되지 않아
    화면이 영구 로딩으로 굳는다. 즉시 400 을 주는 편이 모든 면에서 낫다.
    """
    value = normalize_title(title)
    if not value:
        raise HTTPException(status_code=400, detail="문서 제목을 입력해 주세요.")
    return value


@router.get(
    "/latest",
    response_model=ArticleSummaryResponse,
    summary="[WIKI-001] 위키백과 문서 요약 최신 조회",
    responses=_TITLE_400,
    description=(
        "위키백과에서 **문서 하나의 서두 요약**을 조회한다. 한국어판에서 `김치찌개` 를 조회하면"
        " 그 문서의 첫 문단을 평문으로 받는다. 어떤 대상이 무엇인지 사실 관계를 확인할 때"
        " 사용한다.\n\n"
        "리다이렉트는 자동으로 따라간다. 그래서 응답의 `articles[].title` 이 요청한 제목과 다를 수"
        " 있으며, 화면에는 응답의 제목을 표시한다.\n\n"
        "그런 문서가 없으면 `articles` 가 빈 배열로 온다. 오류가 아니다.\n\n"
        "이 요청은 미리 수집해 둔 결과를 반환한다. 데이터가 없거나 오래된 경우 새로 수집하도록"
        " 예약한 뒤 곧바로 응답한다. 실제 수집은 별도 작업으로 처리되며 보통 몇 초 걸린다.\n\n"
        "**화면에서는 `status` 로 처리를 나눈다.**\n"
        "- `ok`: 데이터가 있다. `articles` 를 그대로 사용한다.\n"
        "- `collecting`: 아직 수집 중이다. 로딩 상태로 두고 잠시 뒤 다시 조회한다.\n"
        "- `failed`: 수집했으나 데이터를 얻지 못했다(없는 문서인 경우가 대부분이다). 다시 조회해도"
        " 해결되지 않으므로 오류로 표시한다."
    ),
)
async def get_latest(
    title: str = Query(
        ...,
        min_length=1,
        max_length=TITLE_MAX_LENGTH,
        description=_TITLE_DESC,
        json_schema_extra={"example": "김치찌개"},
    ),
    lang: Language = Query(
        default=Language.KO,
        description=(
            "조회할 언어판. `GET /sources/WIKIPEDIA_SUMMARY/options` 의 `categories[].value` 와"
            " 같은 목록이다."
        ),
    ),
    service: CollectionInboundPort = Depends(get_collection_service),
) -> ArticleSummaryResponse:
    value = _validated_title(title)
    snapshot = await service.get_latest(make_target(lang, value))
    return ArticleSummaryResponse(
        lang=lang,
        title=value,
        status=snapshot.status,
        collectedAt=snapshot.collected_at,
        expectedItems=KEEP_COUNT,
        articles=[
            ArticleSummarySchema(
                title=a.title,
                extract=a.extract,
                url=a.url,
                thumbnailUrl=a.thumbnail_url,
            )
            for a in decode_summaries(snapshot.items)
        ],
    )


@router.post(
    "/refresh",
    response_model=EnqueueResponse,
    summary="[WIKI-002] 위키백과 문서 요약 다시 모으기 (운영용)",
    responses=_TITLE_400,
    description=(
        "지정한 문서를 **다시 수집하도록 요청한다.** 최신 데이터가 있어도 다시 수집한다.\n\n"
        "일반 조회 경로에서는 필요하지 않다. 조회(`GET /wikipedia/summary/latest`)가 필요할 때"
        " 자동으로 갱신하기 때문이다. 문서가 방금 수정되어 즉시 반영해야 하는 상황에서 사용한다.\n\n"
        "요청을 접수한 뒤 곧바로 응답한다. 따라서 `enqueued: true` 는 **접수됐다**는 뜻이며 수집이"
        " 끝났다는 뜻이 아니다. 결과는 위 조회로 확인한다."
        " 같은 대상으로 여러 번 요청해도 수집은 한 번만 실행된다."
    ),
)
async def refresh(
    title: str = Query(..., min_length=1, max_length=TITLE_MAX_LENGTH, description=_TITLE_DESC),
    lang: Language = Query(default=Language.KO, description="조회할 언어판."),
    service: CollectionInboundPort = Depends(get_collection_service),
) -> EnqueueResponse:
    value = _validated_title(title)
    await service.enqueue_refresh(make_target(lang, value))
    return EnqueueResponse(enqueued=True)
