"""Inbound Port(Protocol): 라우터가 호출하는 서비스 계약."""

from __future__ import annotations

from typing import Protocol

from ...domain.entities import HardwareInfo, MetricsSnapshot, ProcessUsage


class MetricsInboundPort(Protocol):
    def prime(self) -> None: ...

    def snapshot(self) -> MetricsSnapshot: ...

    def top(self, resource: str, limit: int) -> list[ProcessUsage]:
        """리소스(cpu|ram|gpu|vram)별 점유 상위 프로세스. 알 수 없는 리소스/실패 시 빈 목록."""
        ...

    def hardware(self) -> HardwareInfo:
        """정적 하드웨어 상세(CPU/메모리 모듈/GPU/디스크). on-demand."""
        ...
