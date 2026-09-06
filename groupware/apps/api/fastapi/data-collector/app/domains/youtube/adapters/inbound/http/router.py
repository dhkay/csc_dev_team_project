"""Inbound Adapter: APIRouter. 내부 전용(서비스토큰).

호출 주체는 늘 수 있으므로 여기 적지 않는다. 현재 토폴로지는
`.claude/rules/security-architecture.md` 의 호출자 표가 단일 출처다.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from .....collection.adapters.inbound.http.schemas import EnqueueResponse
from .....collection.core.application.ports.inbound import CollectionInboundPort
from ....core.domain.codec import decode_videos
from ....core.domain.target import make_target, normalize_keyword
from ....core.domain.types import KEEP_COUNT, KEYWORD_MAX_LENGTH
from .schemas import VideoStatResponse, VideoStatSchema

router = APIRouter(prefix="/youtube/videos", tags=["youtube"])

_KEYWORD_DESC = (
    "조회할 검색어. `GET /sources/YOUTUBE_VIDEO/options` 의 `inputs` 에 이 입력이 서술되어 있다."
)
_KEYWORD_400 = {400: {"description": "검색어가 비어 있다. 공백만 넣은 경우도 같다."}}


def get_collection_service() -> CollectionInboundPort:
    # 실제 provider 는 app/main.py 에서 오버라이드된다.
    raise NotImplementedError


def _validated_keyword(keyword: str) -> str:
    """검색어를 다듬고 빈 값을 막는다.

    빈 검색어를 통과시키면 벤더가 빈 응답을 주고, 그 결과가 "아직 수집 중"과 구분되지 않아
    화면이 영구 로딩으로 굳는다.
    """
    value = normalize_keyword(keyword)
    if not value:
        raise HTTPException(status_code=400, detail="검색어를 입력해 주세요.")
    return value


@router.get(
    "/latest",
    response_model=VideoStatResponse,
    summary="[YOUTUBE-001] 유튜브 상위 영상과 지표 최신 조회",
    responses=_KEYWORD_400,
    description=(
        "그 검색어로 유튜브에서 **가장 많이 본 영상 10건**을 조회수 순으로 조회한다. 제목, 채널,"
        " 업로드 시각, 재생 시간, 조회수와 반응 수가 함께 온다. 같은 주제를 다룬 영상이 어떤 길이와"
        " 어떤 제목으로 반응을 얻었는지 확인할 때 사용한다.\n\n"
        "국내 기준(한국 지역, 한국어)으로 검색한다.\n\n"
        "`duration` 은 `PT3M34S` 형식이라 초 단위 숫자가 아니다. `likeCount` 와 `commentCount` 는"
        " 채널이 숨긴 경우 null 로 오며, 이는 0 과 다르다.\n\n"
        "**이 소스는 주기적으로 다시 모으지 않는다.** 조회할 때 데이터가 오래됐으면 그때"
        " 수집을 예약하고, 아무도 조회하지 않는 검색어는 다시 모으지 않는다.\n\n"
        "**화면에서는 `status` 로 처리를 나눈다.**\n"
        "- `ok`: 데이터가 있다. `videos` 를 그대로 사용한다.\n"
        "- `collecting`: 아직 수집 중이다. 로딩 상태로 두고 잠시 뒤 다시 조회한다.\n"
        "- `failed`: 수집했으나 데이터를 얻지 못했다. 다시 조회해도 해결되지 않으므로 오류로"
        " 표시한다.\n\n"
        "`expectedItems` 는 수집이 완료됐을 때의 개수다. 진행률의 분모로 사용한다. 검색 결과가"
        " 그보다 적으면 그만큼만 온다."
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
) -> VideoStatResponse:
    value = _validated_keyword(keyword)
    snapshot = await service.get_latest(make_target(value))
    return VideoStatResponse(
        keyword=value,
        status=snapshot.status,
        collectedAt=snapshot.collected_at,
        expectedItems=KEEP_COUNT,
        videos=[
            VideoStatSchema(
                rank=v.rank,
                videoId=v.video_id,
                title=v.title,
                channelTitle=v.channel_title,
                publishedAt=v.published_at,
                duration=v.duration,
                viewCount=v.view_count,
                likeCount=v.like_count,
                commentCount=v.comment_count,
                thumbnailUrl=v.thumbnail_url,
            )
            for v in decode_videos(snapshot.items)
        ],
    )


@router.post(
    "/refresh",
    response_model=EnqueueResponse,
    summary="[YOUTUBE-002] 유튜브 상위 영상 다시 모으기 (운영용)",
    responses=_KEYWORD_400,
    description=(
        "지정한 검색어를 **다시 수집하도록 요청한다.** 최신 데이터가 있어도 다시 수집한다.\n\n"
        "일반 조회 경로에서는 필요하지 않다. 조회(`GET /youtube/videos/latest`)가 필요할 때 자동으로"
        " 갱신하기 때문이다.\n\n"
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
