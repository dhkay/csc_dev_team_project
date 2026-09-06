"""DI 조립: metrics-agent.

DB 없음. MetricsService 는 psutil/pynvml 리더(장치 핸들 재사용)를 보유하므로 프로세스 수명 싱글톤.
"""

from __future__ import annotations

from .config import get_settings
from .domains.metrics.core.application.ports.inbound import MetricsInboundPort
from .domains.metrics.core.domain.entities import HostInfo
from .domains.metrics.module import build_metrics_service

_service: MetricsInboundPort | None = None


def get_metrics_service_singleton() -> MetricsInboundPort:
    global _service
    if _service is None:
        s = get_settings()
        host = HostInfo(id=s.host_id, label=s.host_label, role=s.host_role)
        _service = build_metrics_service(host, s.host_proc, s.disk_path, s.host_sys)
    return _service


def provide_metrics_service() -> MetricsInboundPort:
    return get_metrics_service_singleton()
