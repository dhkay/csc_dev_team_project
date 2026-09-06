"""도메인 조립: metrics.

리더(psutil/pynvml) 어댑터를 MetricsService 로 묶고 router 를 재노출한다.
"""

from __future__ import annotations

from .adapters.inbound.http.router import router
from .adapters.outbound.gpu.nvml_reader import NvmlGpuReader
from .adapters.outbound.system.psutil_reader import PsutilSystemReader
from .core.application.services import MetricsService
from .core.domain.entities import HostInfo

__all__ = ["router", "build_metrics_service"]


def build_metrics_service(
    host: HostInfo, proc_path: str, disk_path: str, sys_path: str
) -> MetricsService:
    return MetricsService(
        system_reader=PsutilSystemReader(
            proc_path=proc_path, disk_path=disk_path, sys_path=sys_path
        ),
        gpu_reader=NvmlGpuReader(),
        host=host,
    )
