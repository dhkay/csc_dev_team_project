"""Inbound Adapter: 호스트 지표 스냅샷.

GET /metrics/snapshot: 애그리게이터(csc-control-tower)만 호출 허용(require_services).
서비스 provider(get_metrics_service)는 app/main.py 에서 싱글톤으로 오버라이드된다.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query

from csc_net_utils import require_services

from ....core.application.ports.inbound import MetricsInboundPort
from .mappers import to_hardware, to_process, to_response
from .schemas import HardwareResponse, ProcessUsageSchema, SnapshotResponse

_CALLERS = require_services("csc-control-tower")


def get_metrics_service() -> MetricsInboundPort:
    raise NotImplementedError


router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get(
    "/snapshot",
    response_model=SnapshotResponse,
    dependencies=[Depends(_CALLERS)],
)
async def snapshot(
    service: MetricsInboundPort = Depends(get_metrics_service),
) -> SnapshotResponse:
    return to_response(service.snapshot())


@router.get(
    "/top",
    response_model=list[ProcessUsageSchema],
    dependencies=[Depends(_CALLERS)],
)
async def top(
    resource: Literal["cpu", "ram", "gpu", "vram"] = Query(...),
    limit: int = Query(5, ge=1, le=20),
    service: MetricsInboundPort = Depends(get_metrics_service),
) -> list[ProcessUsageSchema]:
    return [to_process(u) for u in service.top(resource, limit)]


@router.get(
    "/hardware",
    response_model=HardwareResponse,
    dependencies=[Depends(_CALLERS)],
)
async def hardware(
    service: MetricsInboundPort = Depends(get_metrics_service),
) -> HardwareResponse:
    return to_hardware(service.hardware())
