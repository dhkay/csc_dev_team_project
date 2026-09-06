"""Inbound Adapter: APIRouter -> Inbound Port 호출. SQL/ClickHouse SDK 를 모른다.

조회는 BFF 만 호출한다. 브라우저가 log-server 를 직접 부르는 경로는 없고, 조직 스코프는
BFF 가 세션에서 도출해 본문에 실어 준다(신뢰 경계 = 서비스토큰 계층).

POST 를 쓰는 이유: 필터가 중첩 배열(levels, services)을 포함해 쿼리스트링으로 표현하면
인코딩이 지저분해지고, 검색어가 URL/액세스로그에 남는 것도 피하고 싶다.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from csc_net_utils import require_services

from app.shared.domain.errors import InvalidQueryError, ScopeDeniedError

from ....core.application.ports.inbound import LogQueryInboundPort
from . import mappers
from .schemas import LogSearchRequest, LogSearchResponse, UsageRequest, UsageResponse

#: 조회는 web BFF 만. 백엔드끼리 남의 조직 로그를 읽을 이유가 없다.
_BFF_CALLERS = ("web-groupware", "web-control-tower")


def get_log_query_service() -> LogQueryInboundPort:
    # 실제 provider 는 app/container.py 에서 오버라이드된다.
    raise NotImplementedError


router = APIRouter(prefix="/logs", tags=["query"])


@router.post(
    "/search",
    response_model=LogSearchResponse,
    summary="[LOG-002] 로그 조회",
    dependencies=[Depends(require_services(*_BFF_CALLERS))],
)
async def search_logs(
    body: LogSearchRequest,
    service: LogQueryInboundPort = Depends(get_log_query_service),
) -> LogSearchResponse:
    try:
        page = await service.search(
            mappers.to_scope(body),
            mappers.to_filter(body),
            mappers.to_page(body),
        )
    except ScopeDeniedError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except InvalidQueryError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return mappers.to_search_response(page)


@router.post(
    "/usage",
    response_model=UsageResponse,
    summary="[LOG-003] 사용량 집계 조회",
    dependencies=[Depends(require_services(*_BFF_CALLERS))],
)
async def usage(
    body: UsageRequest,
    service: LogQueryInboundPort = Depends(get_log_query_service),
) -> UsageResponse:
    try:
        buckets = await service.usage(mappers.to_scope(body), mappers.to_usage_query(body))
    except ScopeDeniedError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except InvalidQueryError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return mappers.to_usage_response(buckets)
