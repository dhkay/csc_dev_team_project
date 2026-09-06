"""Inbound Adapter: APIRouter -> Inbound Port 호출. Kafka/ClickHouse SDK 를 직접 import 하지 않는다.

수집 경로는 프로듀서의 비즈니스 경로를 절대 막지 않아야 한다. 그래서
- 202 Accepted 로 즉시 응답한다(버퍼 적재까지만 보장, 적재 완료는 워커가 비동기로).
- 배치 안의 잘못된 레코드는 나머지를 죽이지 않고 영수증에 사유만 담아 돌려준다.

호출자 제한을 두지 않는 이유: 전 백엔드가 로그를 생산하므로 라우트별 화이트리스트가
서비스 목록의 사본이 되어 곧 어긋난다. 게이트는 미들웨어의 ALLOWED_SERVICES 하나로 충분하다.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status

from app.config import get_settings

from ....core.application.ports.inbound import LogIngestionInboundPort
from . import mappers
from .schemas import IngestRequest, IngestResponse


def get_log_ingestion_service() -> LogIngestionInboundPort:
    # 실제 provider 는 app/container.py 에서 오버라이드된다.
    raise NotImplementedError


router = APIRouter(prefix="/logs", tags=["ingestion"])


@router.post(
    "",
    response_model=IngestResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="[LOG-001] 로그 배치 수집",
)
async def ingest_logs(
    body: IngestRequest,
    request: Request,
    service: LogIngestionInboundPort = Depends(get_log_ingestion_service),
) -> IngestResponse:
    settings = get_settings()
    # 프로듀서 신원은 본문이 아니라 검증된 서비스토큰에서 가져온다.
    # 본문 service 를 믿으면 아무 서비스나 남의 이름으로 로그를 남길 수 있다.
    caller = getattr(request.state, "service", None)

    # 주의: trace_id 를 이 요청의 상관관계 컨텍스트로 채우지 않는다.
    # 프로듀서 클라이언트는 로그를 모아 배치로 보내므로(fire-and-forget), 이 POST 의 trace 는
    # 마침 flush 를 트리거한 요청의 것일 뿐 배치 안 레코드들의 trace 와 무관하다. 폴백을 넣으면
    # 서로 다른 행위의 로그가 한 trace 로 뭉쳐 오히려 추적이 망가진다.
    # trace 는 레코드를 만든 시점에 프로듀서가 자기 컨텍스트에서 찍어 보내야 한다.

    envelopes = []
    for record in body.records:
        if caller:
            record = record.model_copy(update={"service": caller})
        envelopes.append(mappers.to_envelope(record, settings.app_env))

    receipt = await service.accept(envelopes)
    return mappers.to_ingest_response(receipt)
