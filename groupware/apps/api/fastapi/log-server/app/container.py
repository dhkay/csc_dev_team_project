"""DI 조립: Depends provider 정의 (API 프로세스).

Kafka 프로듀서와 ClickHouse 클라이언트는 프로세스 수명 싱글톤이다. 요청마다 만들면
핸드셰이크 비용이 로그 한 건 값을 넘는다. 수명 관리(start/stop)는 main.py 의 lifespan 이 맡는다.

worker 프로세스의 조립은 app/worker.py 가 따로 한다(구독/적재는 API 와 다른 어댑터 조합).
"""

from __future__ import annotations

from aiokafka import AIOKafkaProducer
from clickhouse_connect.driver.asyncclient import AsyncClient

from .config import get_settings
from .domains.ingestion.adapters.outbound.queue.kafka_publisher import (
    KafkaLogPublisher,
    create_producer,
)
from .domains.ingestion.adapters.outbound.queue.topic_resolver import ScopedTopicResolver
from .domains.ingestion.core.application.ports.inbound import LogIngestionInboundPort
from .domains.ingestion.module import build_log_ingestion_service
from .domains.query.core.application.ports.inbound import LogQueryInboundPort
from .domains.query.module import build_log_query_service
from .shared.adapters.outbound.clickhouse.client import create_client

_producer: AIOKafkaProducer | None = None
_clickhouse: AsyncClient | None = None


async def start_resources() -> None:
    """lifespan 진입: 브로커/저장소 커넥션을 연다."""
    global _producer, _clickhouse
    settings = get_settings()
    if _producer is None:
        _producer = await create_producer(settings.kafka_bootstrap_servers)
    if _clickhouse is None:
        _clickhouse = await create_client(
            host=settings.clickhouse_host,
            port=settings.clickhouse_port,
            database=settings.clickhouse_database,
            user=settings.clickhouse_user,
            password=settings.clickhouse_password,
        )


async def stop_resources() -> None:
    """lifespan 종료: 버퍼에 남은 로그를 flush 하고 닫는다."""
    global _producer, _clickhouse
    if _producer is not None:
        # stop() 이 내부적으로 남은 배치를 flush 한다. 종료 시 로그 유실 방지.
        await _producer.stop()
        _producer = None
    if _clickhouse is not None:
        _clickhouse.close()
        _clickhouse = None


def get_topic_resolver() -> ScopedTopicResolver:
    settings = get_settings()
    return ScopedTopicResolver(
        promoted_tools=settings.promoted_ai_tools_set,
        scope_name=settings.log_scope,
    )


async def provide_log_ingestion_service() -> LogIngestionInboundPort:
    if _producer is None:
        raise RuntimeError("Kafka 프로듀서가 시작되지 않았습니다(lifespan 미진입).")
    return build_log_ingestion_service(KafkaLogPublisher(_producer), get_topic_resolver())


async def provide_log_query_service() -> LogQueryInboundPort:
    if _clickhouse is None:
        raise RuntimeError("ClickHouse 클라이언트가 시작되지 않았습니다(lifespan 미진입).")
    return build_log_query_service(_clickhouse)
