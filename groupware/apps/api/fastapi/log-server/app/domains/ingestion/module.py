"""도메인 DI wiring: Port -> 구현 바인딩 (ingestion).

API 측: Kafka 발행기 + 토픽 리졸버 -> LogIngestionService.
worker 측: ClickHouse sink + 발행기(DLQ) + 리졸버 -> LogSinkWorkerService.

구체 어댑터 생성(커넥션 수명)은 composition root(app/container.py, app/worker.py)가 맡고
여기서는 조립만 한다.
"""

from __future__ import annotations

from .adapters.inbound.http.router import router
from .core.application.ports.inbound import (
    LogIngestionInboundPort,
    LogSinkInboundPort,
)
from .core.application.ports.outbound import (
    LogPublisherPort,
    LogSinkPort,
    TopicResolverPort,
)
from .core.application.services import LogIngestionService, LogSinkWorkerService

__all__ = ["router", "build_log_ingestion_service", "build_log_sink_service"]


def build_log_ingestion_service(
    publisher: LogPublisherPort,
    topics: TopicResolverPort,
) -> LogIngestionInboundPort:
    """수집(HTTP → Kafka) 서비스 조립."""
    return LogIngestionService(publisher, topics)


def build_log_sink_service(
    sink: LogSinkPort,
    publisher: LogPublisherPort,
    topics: TopicResolverPort,
) -> LogSinkInboundPort:
    """적재(Kafka → ClickHouse) 서비스 조립. DLQ 발행을 위해 publisher 도 받는다."""
    return LogSinkWorkerService(sink, publisher, topics)
