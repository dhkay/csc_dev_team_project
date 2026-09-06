"""Service: MetricsInboundPort 구현. 리더들을 조립해 한 시점의 스냅샷을 만든다.

GPU 리더가 실패해도 gpus=[] 로 성공 응답한다(에이전트는 절대 크래시 금지: 대시보드가 죽음).
프레임워크/psutil 을 직접 import 하지 않는다.
"""

from __future__ import annotations

from datetime import datetime, timezone

from ..domain.entities import HardwareInfo, HostInfo, MetricsSnapshot, ProcessUsage
from .ports.outbound import GpuMetricsReaderPort, SystemMetricsReaderPort


class MetricsService:
    def __init__(
        self,
        system_reader: SystemMetricsReaderPort,
        gpu_reader: GpuMetricsReaderPort,
        host: HostInfo,
    ) -> None:
        self._system = system_reader
        self._gpu = gpu_reader
        self._host = host

    def prime(self) -> None:
        self._system.prime()

    def snapshot(self) -> MetricsSnapshot:
        cpu = self._system.read_cpu()
        memory = self._system.read_memory()
        try:
            disk = self._system.read_disk()
        except Exception:
            disk = None
        try:
            gpus = self._gpu.read_gpus()
        except Exception:
            # GPU 읽기 실패는 치명적이지 않다. 빈 목록으로 degrade.
            gpus = []
        return MetricsSnapshot(
            host=self._host,
            timestamp=datetime.now(timezone.utc),
            cpu=cpu,
            memory=memory,
            disk=disk,
            gpus=gpus,
        )

    def top(self, resource: str, limit: int) -> list[ProcessUsage]:
        # 리소스별 점유 상위 프로세스. 실패는 빈 목록으로 degrade(대시보드 크래시 금지).
        try:
            if resource == "cpu":
                return self._system.read_top_cpu(limit)
            if resource == "ram":
                return self._system.read_top_memory(limit)
            if resource in ("gpu", "vram"):
                return self._gpu.read_top_gpu(limit)
        except Exception:
            return []
        return []

    def hardware(self) -> HardwareInfo:
        # 정적 하드웨어 상세: snapshot() 처럼 리더들을 조합. GPU 는 실패해도 [] 로 degrade.
        try:
            gpus = self._gpu.read_gpu_hardware()
        except Exception:
            gpus = []
        return HardwareInfo(
            cpu=self._system.read_cpu_hardware(),
            memory=self._system.read_memory_hardware(),
            gpus=gpus,
            physical_disks=self._system.read_physical_disks(),
            disks=self._system.read_disk_hardware(),
        )
