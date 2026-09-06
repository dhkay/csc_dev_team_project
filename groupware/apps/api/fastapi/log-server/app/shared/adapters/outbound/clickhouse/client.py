"""ClickHouse 비동기 클라이언트 팩토리: clickhouse-connect 는 여기서만 import 한다.

클라이언트는 프로세스 수명 동안 재사용한다(내부 커넥션 풀 보유). 요청마다 만들면
핸드셰이크 비용이 로그 한 건 값을 넘는다.
"""

from __future__ import annotations

import clickhouse_connect
from clickhouse_connect.driver.asyncclient import AsyncClient


async def create_client(
    *,
    host: str,
    port: int,
    database: str,
    user: str,
    password: str,
) -> AsyncClient:
    """비동기 클라이언트 생성. 대상 DB 는 승격 시 인스턴스마다 달라진다."""
    return await clickhouse_connect.get_async_client(
        host=host,
        port=port,
        database=database,
        username=user,
        password=password,
        # 로그 적재는 배치 insert 라 압축이 확실히 이득이다.
        compress=True,
    )
