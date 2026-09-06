"""적재 워커 잠금: "로그 파이프라인은 조용히 버리지 않는다"는 약속.

깨진 메시지도, 저장소 장애도, 반드시 DLQ 라는 흔적을 남긴다. 이 성질이 회귀하면
장애 조사 중에 "로그가 없다"와 "로그가 유실됐다"를 구분할 수 없게 된다.
"""

from __future__ import annotations

import pytest
from csc_log_contracts import (
    LogEnvelope,
    LogKind,
    LogLevel,
    LogScope,
    encode,
    topic_name,
)

from app.domains.ingestion.adapters.outbound.queue.topic_resolver import ScopedTopicResolver
from app.domains.ingestion.core.application.services import LogSinkWorkerService
from app.domains.ingestion.core.domain.types import RejectReason


class _FakeSink:
    def __init__(self, fail_on: LogKind | None = None) -> None:
        self.fail_on = fail_on
        self.inserted: dict[LogKind, list[LogEnvelope]] = {}

    async def insert(self, kind: LogKind, envelopes: list[LogEnvelope]) -> None:
        if kind is self.fail_on:
            raise RuntimeError("clickhouse 연결 실패")
        self.inserted.setdefault(kind, []).extend(envelopes)


class _FakePublisher:
    def __init__(self, dlq_fails: bool = False) -> None:
        self.dead_letters: list = []
        self.dlq_fails = dlq_fails

    async def publish(self, topic: str, key: str, payload: bytes) -> None:  # pragma: no cover
        raise AssertionError("sink 워커는 일반 발행을 하지 않는다")

    async def publish_dead_letter(self, topic: str, dead_letter) -> None:
        if self.dlq_fails:
            raise RuntimeError("DLQ 발행 실패")
        self.dead_letters.append(dead_letter)


def _payload(**overrides) -> bytes:
    base = {
        "kind": LogKind.EVENT,
        "level": LogLevel.INFO,
        "scope": LogScope.PLATFORM,
        "service": "video-model",
        "action": "video_job.created",
        "message": "",
    }
    base.update(overrides)
    return encode(LogEnvelope(**base))


def _service(sink: _FakeSink, publisher: _FakePublisher) -> LogSinkWorkerService:
    return LogSinkWorkerService(sink, publisher, ScopedTopicResolver())


async def test_정상_배치는_kind별로_적재된다() -> None:
    sink, publisher = _FakeSink(), _FakePublisher()

    receipt = await _service(sink, publisher).persist(
        [_payload(), _payload(kind=LogKind.ERROR)],
        topic_name(LogKind.EVENT),
    )

    assert receipt.accepted == 2
    assert len(sink.inserted[LogKind.EVENT]) == 1
    assert len(sink.inserted[LogKind.ERROR]) == 1
    assert publisher.dead_letters == []


async def test_깨진_메시지는_DLQ로_가고_나머지는_적재된다() -> None:
    sink, publisher = _FakeSink(), _FakePublisher()

    receipt = await _service(sink, publisher).persist(
        [_payload(), b"{ this is not json", _payload()],
        topic_name(LogKind.EVENT),
    )

    assert receipt.accepted == 2
    assert receipt.rejected[0].reason is RejectReason.MALFORMED
    assert len(publisher.dead_letters) == 1
    # 원본을 보존해야 고친 뒤 재생할 수 있다.
    assert "this is not json" in publisher.dead_letters[0].record.raw


async def test_저장소_장애는_해당_kind만_DLQ로_보내고_나머지는_살린다() -> None:
    sink, publisher = _FakeSink(fail_on=LogKind.ERROR), _FakePublisher()

    receipt = await _service(sink, publisher).persist(
        [_payload(), _payload(kind=LogKind.ERROR)],
        topic_name(LogKind.EVENT),
    )

    assert receipt.accepted == 1  # EVENT 는 살았다
    assert receipt.rejected[0].reason is RejectReason.SINK_FAILED
    assert len(publisher.dead_letters) == 1


async def test_DLQ_발행마저_실패하면_예외가_올라간다() -> None:
    """오프셋 커밋을 막기 위한 것. 여기서 삼키면 그 로그는 영원히 사라진다."""
    sink = _FakeSink(fail_on=LogKind.EVENT)
    publisher = _FakePublisher(dlq_fails=True)

    with pytest.raises(RuntimeError):
        await _service(sink, publisher).persist([_payload()], topic_name(LogKind.EVENT))


async def test_불변식_위반_메시지도_DLQ로_간다() -> None:
    """프로듀서가 검증을 우회해 직접 Kafka 로 넣은 경우의 2차 방어."""
    sink, publisher = _FakeSink(), _FakePublisher()

    # scope=ORGANIZATION 인데 organization_id 가 없는 페이로드를 직접 만든다.
    broken = encode(
        LogEnvelope(
            kind=LogKind.EVENT,
            level=LogLevel.INFO,
            scope=LogScope.ORGANIZATION,
            service="video-model",
            action="x.y",
            message="",
        )
    )

    receipt = await _service(sink, publisher).persist([broken], topic_name(LogKind.EVENT))

    assert receipt.accepted == 0
    assert len(publisher.dead_letters) == 1
