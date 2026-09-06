"""LogSinkPort 구현: ClickHouse 배치 insert. ClickHouse SDK 는 이 계층에서만 쓴다.

kind 하나당 insert 한 번. ClickHouse 는 작은 insert 를 파트 폭발로 갚게 하므로
행 단위 insert 를 절대 하지 않는다. 배치는 컨슈머가 모아서 넘겨준다.
"""

from __future__ import annotations

from clickhouse_connect.driver.asyncclient import AsyncClient
from csc_log_contracts import LogEnvelope, LogKind

from app.shared.adapters.outbound.clickhouse.tables import columns_for, table_for

from . import mappers


class ClickHouseLogSink:
    """LogSinkPort(Protocol) 의 구현."""

    def __init__(self, client: AsyncClient) -> None:
        self._client = client

    async def insert(self, kind: LogKind, envelopes: list[LogEnvelope]) -> None:
        if not envelopes:
            return
        rows = [mappers.to_row(envelope, kind) for envelope in envelopes]
        await self._client.insert(
            table_for(kind),
            rows,
            column_names=list(columns_for(kind)),
        )
