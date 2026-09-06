"""카탈로그 Inbound Adapter: 소스 목록과 소스별 수집 선택지.

AI 도구는 이 두 엔드포인트로 "무엇을 수집할 수 있는지"를 물어본다. 그 목록을 자기가 들고 있으면
검증되지 않은 벤더 값이 화면에서 수집 요청까지 그대로 흘러가고, 수집기의 보관 정책을 손으로
베끼게 된다.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Path

from ....core.application.ports.inbound import SourceCatalogPort
from ....core.domain.errors import SourceOptionsUnavailableError, UnknownSourceError
from .deps import get_source_catalog
from .schemas import (
    CategoryOptionSchema,
    InputOptionSchema,
    PeriodOptionSchema,
    SourceOptionsSchema,
    SourceSchema,
)

router = APIRouter(prefix="/sources", tags=["catalog"])


@router.get(
    "",
    response_model=list[SourceSchema],
    summary="[CATALOG-001] 수집 소스 목록",
    description=(
        "**어디에서 데이터를 수집할 수 있는지** 반환한다. 화면의 데이터 소스 목록이 이 응답으로"
        " 그려진다.\n\n"
        "- `available`: 현재 사용할 수 있는 소스다.\n"
        "- `planned`: 아직 연동하지 않은 소스다. 수집 항목을 조회하면 409 를 반환한다.\n\n"
        "`id` 는 소스를 가리키는 고정 값이다. 조직마다 소스를 켜고 끄는 설정에서도 같은 값을"
        " 사용한다.\n\n"
        "이 목록을 화면 코드에 복제하지 않는다. 소스가 추가되거나 사용 가능해지면 이 응답만"
        " 바뀌고 화면은 그대로 반영한다."
    ),
)
async def list_sources(
    catalog: SourceCatalogPort = Depends(get_source_catalog),
) -> list[SourceSchema]:
    return [
        SourceSchema(id=s.id, label=s.label, description=s.description, status=s.status)
        for s in catalog.list_sources()
    ]


@router.get(
    "/{source_id}/options",
    response_model=SourceOptionsSchema,
    summary="[CATALOG-002] 소스별 수집 선택지",
    responses={
        404: {
            "description": "그런 소스 id 가 없다. 목록은 `GET /sources` 로 확인한다."
        },
        409: {"description": "소스는 있지만 아직 연동 전이다(`status=planned`)."},
    },
    description=(
        "그 소스에서 **무엇을 선택하고 무엇을 입력해야 하는지** 반환한다. 화면의 선택 목록이 이"
        " 응답으로 그려지고, 수집을 요청할 때 넣는 값도 여기서 가져온다.\n\n"
        "- `categories`: 선택 가능한 분야. `value` 가 수집 요청의 `cid` 로 들어가고, `label` 은"
        " 화면에 그대로 표시한다(예: `50000002` 화장품/미용).\n"
        "- `periods`: 선택 가능한 기간(일간/주간/월간). `expected` 는 그 기간의 수집이 완료됐을"
        " 때의 개수다(예: 일간이면 12일치). 진행률의 분모로 사용한다.\n"
        "- `inputs`: 목록에서 고르는 것이 아니라 직접 써 넣는 값(예: 키워드, 문서 제목). `name`"
        " 이 수집 요청의 쿼리 파라미터 이름이고, `maxLength` 를 넘기거나 필수 값을 비우면 400"
        " 이 된다.\n\n"
        "소스마다 해당 없는 축은 빈 배열로 온다. 예를 들어 키워드로 모으는 소스는 `categories`"
        " 와 `periods` 가 비고 `inputs` 만 채워진다.\n\n"
        "이 목록을 화면 코드에 복제하지 않는다. 분야가 추가되거나 수집 개수가 바뀌면 이 응답만"
        " 바뀌고 화면은 그대로 반영한다."
    ),
)
async def get_source_options(
    source_id: str = Path(
        ...,
        description="소스 id. `GET /sources` 응답의 `id` 값을 사용한다.",
        examples=["NAVER_SHOPPING_INSIGHT"],
    ),
    catalog: SourceCatalogPort = Depends(get_source_catalog),
) -> SourceOptionsSchema:
    try:
        options = catalog.get_options(source_id)
    except UnknownSourceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except SourceOptionsUnavailableError as exc:
        # 서술자는 있으나 구현 전이다. 404(없음)와 구분해 409 로 답한다: 호출부가
        #   "오타"와 "아직 준비 안 됨"을 다르게 다룰 수 있어야 한다.
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return SourceOptionsSchema(
        sourceId=options.source_id,
        categories=[
            CategoryOptionSchema(value=c.value, label=c.label)
            for c in options.categories
        ],
        periods=[
            PeriodOptionSchema(value=p.value, label=p.label, expected=p.expected)
            for p in options.periods
        ],
        inputs=[
            InputOptionSchema(
                name=i.name,
                label=i.label,
                required=i.required,
                maxLength=i.max_length,
                example=i.example,
            )
            for i in options.inputs
        ],
    )
