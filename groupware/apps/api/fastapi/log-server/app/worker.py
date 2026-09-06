"""컨슈머 프로세스 엔트리포인트: Kafka → ClickHouse 적재.

`python -m app.worker` 로 실행한다. arq 가 아니다: arq 는 태스크 큐고 이건 스트림
소비라, 잡 단위 재시도/결과 보관 모델이 맞지 않는다. 그래서 redis 논리 DB 도 쓰지 않는다.

이 모듈이 worker 측 composition root 다(API 측은 app/container.py). 같은 이미지를
`LOG_SCOPE=<tool>` 로 띄우면 승격된 AI 도구 전용 컨슈머가 된다. 코드는 그대로다.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import signal

from .config import get_settings
from .domains.ingestion.adapters.inbound.messaging.consumer import (
    KafkaLogConsumer,
    create_consumer,
)
from .domains.ingestion.adapters.outbound.queue.kafka_publisher import (
    KafkaLogPublisher,
    create_producer,
)
from .domains.ingestion.adapters.outbound.queue.topic_resolver import ScopedTopicResolver
from .domains.ingestion.adapters.outbound.store.clickhouse_sink import ClickHouseLogSink
from .domains.ingestion.module import build_log_sink_service
from .shared.adapters.outbound.clickhouse.client import create_client
from csc_log_contracts import consumer_group

logging.basicConfig(level=logging.INFO, format="%(levelname)s [%(name)s] %(message)s")
_logger = logging.getLogger(__name__)


async def run() -> None:
    settings = get_settings()
    topics = ScopedTopicResolver(
        promoted_tools=settings.promoted_ai_tools_set,
        scope_name=settings.log_scope,
    )

    clickhouse = await create_client(
        host=settings.clickhouse_host,
        port=settings.clickhouse_port,
        database=settings.clickhouse_database,
        user=settings.clickhouse_user,
        password=settings.clickhouse_password,
    )
    # DLQ 발행에도 프로듀서가 필요하다. 컨슈머 프로세스가 곧 프로듀서이기도 하다.
    producer = await create_producer(settings.kafka_bootstrap_servers)

    subscriptions = topics.subscriptions()
    kafka_consumer = await create_consumer(
        settings.kafka_bootstrap_servers,
        consumer_group(settings.log_scope),
        subscriptions,
    )

    service = build_log_sink_service(
        ClickHouseLogSink(clickhouse),
        KafkaLogPublisher(producer),
        topics,
    )
    consumer = KafkaLogConsumer(
        kafka_consumer,
        service,
        batch_max_records=settings.consumer_batch_max_records,
        batch_max_wait_ms=settings.consumer_batch_max_wait_ms,
    )

    stop = asyncio.Event()
    _install_signal_handlers(stop)

    _logger.info(
        "로그 컨슈머 시작 (scope=%s, group=%s, topics=%s)",
        settings.log_scope,
        consumer_group(settings.log_scope),
        ", ".join(subscriptions),
    )
    try:
        await consumer.run(stop)
    finally:
        # 순서 중요. 컨슈머부터 멈춰 새 메시지 유입을 끊고, 그 다음 DLQ 버퍼를 flush 한다.
        with contextlib.suppress(Exception):
            await kafka_consumer.stop()
        with contextlib.suppress(Exception):
            await producer.stop()
        with contextlib.suppress(Exception):
            clickhouse.close()
        _logger.info("로그 컨슈머 종료")


def _install_signal_handlers(stop: asyncio.Event) -> None:
    """SIGTERM/SIGINT 에 graceful 종료: 컨테이너 재시작 시 배치 중간에 끊기지 않게."""
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        with contextlib.suppress(NotImplementedError):  # Windows 는 미지원
            loop.add_signal_handler(sig, stop.set)


if __name__ == "__main__":
    asyncio.run(run())
