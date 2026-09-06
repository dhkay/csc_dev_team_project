"""Inbound Port 구현 = 수집 비즈니스 로직.

FastAPI/aiokafka/clickhouse 를 모른다. Outbound Port(Protocol)만 생성자로 주입받는다.

설계 원칙 하나: 로그 파이프라인은 조용히 버리지 않는다. 거부는 반드시 사유와 함께
영수증에 남고, 적재 실패는 DLQ 로 간다. 그래서 부분 성공을 허용한다. 배치 안의 잘못된
레코드 하나 때문에 나머지 정상 로그를 버리면 장애 때 정작 필요한 로그가 사라진다.
"""

from __future__ import annotations

from collections import defaultdict

from csc_log_contracts import (
    InvalidEnvelopeError,
    LogEnvelope,
    LogKind,
    decode,
    encode,
)

from ..domain.entities import DeadLetter
from ..domain.types import IngestReceipt, RejectedRecord, RejectReason
from .ports.outbound import LogPublisherPort, LogSinkPort, TopicResolverPort


class LogIngestionService:
    """LogIngestionInboundPort 구현: 검증 후 버퍼(Kafka)에 발행."""

    def __init__(
        self,
        publisher: LogPublisherPort,
        topics: TopicResolverPort,
    ) -> None:
        self._publisher = publisher
        self._topics = topics

    async def accept(self, envelopes: list[LogEnvelope]) -> IngestReceipt:
        accepted = 0
        rejected: list[RejectedRecord] = []

        for envelope in envelopes:
            try:
                normalized = envelope.normalized()
                normalized.validate()
            except InvalidEnvelopeError as exc:
                # 발행 전에 걸러 잘못된 레코드가 버퍼를 오염시키지 않게 한다.
                rejected.append(
                    RejectedRecord(
                        reason=RejectReason.INVALID_ENVELOPE,
                        detail=str(exc),
                        raw=_safe_raw(envelope),
                    )
                )
                continue

            await self._publisher.publish(
                self._topics.resolve(normalized),
                normalized.partition_key,
                encode(normalized),
            )
            accepted += 1

        return IngestReceipt(accepted=accepted, rejected=rejected)


class LogSinkWorkerService:
    """LogSinkInboundPort 구현: 버퍼에서 꺼낸 원본을 저장소에 적재.

    kind 별로 묶어 테이블당 한 번씩 insert 한다(ClickHouse 는 작은 insert 를 싫어한다).
    """

    def __init__(
        self,
        sink: LogSinkPort,
        publisher: LogPublisherPort,
        topics: TopicResolverPort,
    ) -> None:
        self._sink = sink
        self._publisher = publisher
        self._topics = topics

    async def persist(self, payloads: list[bytes], source_topic: str) -> IngestReceipt:
        by_kind: dict[LogKind, list[LogEnvelope]] = defaultdict(list)
        rejected: list[RejectedRecord] = []

        # 1) 디코드 + 검증: 깨진 레코드는 여기서 DLQ 로 빠진다.
        for payload in payloads:
            try:
                envelope = decode(payload).normalized()
                envelope.validate()
            except InvalidEnvelopeError as exc:
                rejected.append(
                    RejectedRecord(
                        reason=RejectReason.MALFORMED,
                        detail=str(exc),
                        raw=_decode_raw(payload),
                    )
                )
                continue
            by_kind[envelope.kind].append(envelope)

        # 2) kind 별 배치 적재. 한 kind 가 실패해도 나머지 kind 는 살린다.
        accepted = 0
        for kind, batch in by_kind.items():
            try:
                await self._sink.insert(kind, batch)
            except Exception as exc:  # noqa: BLE001 - 저장소 예외는 종류를 가리지 않고 DLQ 로
                rejected.extend(
                    RejectedRecord(
                        reason=RejectReason.SINK_FAILED,
                        detail=f"{kind.value} 적재 실패: {exc}",
                        raw=_safe_raw(envelope),
                    )
                    for envelope in batch
                )
                continue
            accepted += len(batch)

        # 3) DLQ 발행. 여기서 실패하면 예외가 올라가 오프셋이 커밋되지 않는다(재처리).
        for record in rejected:
            await self._publisher.publish_dead_letter(
                self._topics.resolve_dlq(),
                DeadLetter.now(record, source_topic),
            )

        return IngestReceipt(accepted=accepted, rejected=rejected)


def _safe_raw(envelope: LogEnvelope) -> str:
    """엔벨로프를 DLQ 보존용 문자열로. 직렬화조차 안 되면 repr 로 떨어진다."""
    try:
        return encode(envelope).decode()
    except Exception:  # noqa: BLE001 - 보존이 목적이라 어떤 실패도 삼킨다
        return repr(envelope)


def _decode_raw(payload: bytes) -> str:
    return payload.decode(errors="replace")
