"""도메인 DI wiring: Port -> 구현 바인딩 (query)."""

from __future__ import annotations

from clickhouse_connect.driver.asyncclient import AsyncClient

from .adapters.inbound.http.router import router
from .adapters.outbound.store.clickhouse_repository import ClickHouseLogQueryRepository
from .core.application.ports.inbound import LogQueryInboundPort
from .core.application.services import LogQueryService

__all__ = ["router", "build_log_query_service"]


def build_log_query_service(client: AsyncClient) -> LogQueryInboundPort:
    """Outbound(ClickHouse Repository) -> Service 조립."""
    return LogQueryService(ClickHouseLogQueryRepository(client))
