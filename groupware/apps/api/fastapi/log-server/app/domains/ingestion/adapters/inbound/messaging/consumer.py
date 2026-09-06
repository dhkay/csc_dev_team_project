"""Inbound(구동) Adapter: Kafka 메시지가 코어를 구동한다.

HTTP 라우터와 동급의 driving adapter 다. 방향이 헷갈리기 쉬운데, 이 어댑터는 외부
의존성을 호출하는 게 아니라 외부 이벤트를 받아 코어를 부른다. 그래서 inbound 다.

오프셋 커밋 규칙: `persist()` 가 정상 반환한 뒤에만 커밋한다. 예외가 올라오면 커밋하지
않아 같은 배치를 재처리한다(at-least-once). 중복은 저장소가 event_id 로 흡수한다.
"""

from __future__ import annotations

import asyncio
import logging

from aiokafka import AIOKafkaConsumer

from ....core.application.ports.inbound import LogSinkInboundPort

_logger = logging.getLogger(__name__)


class KafkaLogConsumer:
    """토픽을 구독해 배치로 모아 sink 서비스에 넘긴다."""

    def __init__(
        self,
        consumer: AIOKafkaConsumer,
        service: LogSinkInboundPort,
        *,
        batch_max_records: int,
        batch_max_wait_ms: int,
    ) -> None:
        self._consumer = consumer
        self._service = service
        self._batch_max_records = batch_max_records
        self._batch_max_wait_ms = batch_max_wait_ms

    async def run(self, stop: asyncio.Event) -> None:
        """중단 신호가 올 때까지 소비 루프를 돈다."""
        while not stop.is_set():
            # 토픽/파티션별로 묶여서 온다. 최대 대기(batch_max_wait_ms)를 두어
            # 트래픽이 적을 때도 로그가 버퍼에 오래 머무르지 않게 한다.
            batches = await self._consumer.getmany(
                timeout_ms=self._batch_max_wait_ms,
                max_records=self._batch_max_records,
            )
            if not batches:
                continue

            try:
                for topic_partition, messages in batches.items():
                    if not messages:
                        continue
                    receipt = await self._service.persist(
                        [m.value for m in messages],
                        topic_partition.topic,
                    )
                    if receipt.rejected_count:
                        _logger.warning(
                            "로그 적재 부분 실패 (topic=%s, 성공=%d, 거부=%d)",
                            topic_partition.topic,
                            receipt.accepted,
                            receipt.rejected_count,
                        )
            except Exception:  # noqa: BLE001 - 커밋을 막는 게 목적. 다음 폴에서 재처리된다.
                _logger.exception("로그 적재 실패: 오프셋 미커밋(재처리 예정)")
                continue

            # 여기까지 왔으면 배치 전량이 저장소 또는 DLQ 에 안착했다.
            await self._consumer.commit()


async def create_consumer(
    bootstrap_servers: str,
    group_id: str,
    topics: list[str],
) -> AIOKafkaConsumer:
    """구독용 컨슈머 생성 + 시작. 호출자(worker)가 수명을 관리한다."""
    consumer = AIOKafkaConsumer(
        *topics,
        bootstrap_servers=bootstrap_servers,
        group_id=group_id,
        # 커밋 시점을 코드가 통제한다. 적재 성공 후에만 커밋해야 유실이 없다.
        enable_auto_commit=False,
        # 새 컨슈머그룹은 가장 오래된 것부터: 승격 인스턴스를 붙였을 때 기존 로그를 흘리지 않는다.
        auto_offset_reset="earliest",
    )
    await consumer.start()
    return consumer
