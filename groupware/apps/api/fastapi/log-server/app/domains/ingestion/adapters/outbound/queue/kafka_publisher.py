"""LogPublisherPort 구현: aiokafka 발행. Kafka SDK 는 이 계층에서만 import 한다.

발행은 `send()` 까지만 하고 브로커 ack 를 기다리지 않는다(await 는 큐 적재까지).
수집 API 응답이 브로커 왕복에 묶이면 프로듀서의 비즈니스 경로가 느려지기 때문이다.
내구성은 `acks=1` + Kafka 자체 복제/보존이 담당한다.
"""

from __future__ import annotations

import json
import logging

from aiokafka import AIOKafkaProducer

from ....core.domain.entities import DeadLetter

_logger = logging.getLogger(__name__)


class KafkaLogPublisher:
    """LogPublisherPort(Protocol) 의 구현. 프로듀서는 프로세스 수명 동안 재사용한다."""

    def __init__(self, producer: AIOKafkaProducer) -> None:
        self._producer = producer

    async def publish(self, topic: str, key: str, payload: bytes) -> None:
        # 키가 파티션을 정한다. 같은 조직의 로그는 같은 파티션 = 시간 순서 보장.
        await self._producer.send(topic, value=payload, key=key.encode())

    async def publish_dead_letter(self, topic: str, dead_letter: DeadLetter) -> None:
        body = json.dumps(
            {
                "reason": dead_letter.record.reason.value,
                "detail": dead_letter.record.detail,
                "raw": dead_letter.record.raw,
                "source_topic": dead_letter.source_topic,
                "failed_at": dead_letter.failed_at.isoformat(),
            },
            ensure_ascii=False,
        ).encode()
        # DLQ 는 순서가 무의미하고 특정 파티션에 쏠리면 안 되므로 키를 주지 않는다.
        await self._producer.send(topic, value=body)
        _logger.warning(
            "로그 레코드 DLQ 이동 (reason=%s, source=%s): %s",
            dead_letter.record.reason.value,
            dead_letter.source_topic,
            dead_letter.record.detail,
        )


async def create_producer(bootstrap_servers: str) -> AIOKafkaProducer:
    """발행용 프로듀서 생성 + 시작. 호출자(container/worker)가 수명을 관리한다."""
    producer = AIOKafkaProducer(
        bootstrap_servers=bootstrap_servers,
        # acks=1: 리더 기록까지만 확인. 로그 파이프라인은 처리량이 내구성보다 중요하고,
        # 원본은 프로듀서 쪽에 잠깐 남아 있으며 완전 유실은 리더 장애 순간에만 가능하다.
        acks=1,
        # 작은 로그 레코드를 모아 보내 브로커 왕복을 줄인다.
        linger_ms=50,
        compression_type="gzip",
    )
    await producer.start()
    return producer
