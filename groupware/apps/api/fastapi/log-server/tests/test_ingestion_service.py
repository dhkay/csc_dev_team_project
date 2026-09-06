"""수집 서비스 불변식 잠금.

여기서 지키는 약속은 두 개다.
1. 잘못된 레코드가 버퍼를 오염시키지 않는다: 발행 전에 걸러진다.
2. 부분 성공이 보장된다: 배치 안의 잘못된 한 건이 나머지 정상 로그를 죽이지 않는다.
   장애 상황에서 정작 필요한 로그가 사라지는 걸 막는 성질이라 회귀하면 치명적이다.
"""

from __future__ import annotations

from csc_log_contracts import (
    Actor,
    LogEnvelope,
    LogKind,
    LogLevel,
    LogScope,
    PrincipalType,
    topic_name,
)

from app.domains.ingestion.adapters.outbound.queue.topic_resolver import ScopedTopicResolver
from app.domains.ingestion.core.application.services import LogIngestionService
from app.domains.ingestion.core.domain.types import RejectReason


class _FakePublisher:
    """LogPublisherPort 의 인메모리 대역."""

    def __init__(self) -> None:
        self.published: list[tuple[str, str, bytes]] = []
        self.dead_letters: list[object] = []

    async def publish(self, topic: str, key: str, payload: bytes) -> None:
        self.published.append((topic, key, payload))

    async def publish_dead_letter(self, topic: str, dead_letter: object) -> None:
        self.dead_letters.append(dead_letter)


def _envelope(**overrides) -> LogEnvelope:
    base = {
        "kind": LogKind.EVENT,
        "level": LogLevel.INFO,
        "scope": LogScope.PLATFORM,
        "service": "video-model",
        "action": "video_job.status_changed",
        "message": "PENDING -> PROCESSING",
    }
    base.update(overrides)
    return LogEnvelope(**base)


def _service(publisher: _FakePublisher) -> LogIngestionService:
    return LogIngestionService(publisher, ScopedTopicResolver())


async def test_정상_엔벨로프는_kind_토픽으로_발행된다() -> None:
    publisher = _FakePublisher()

    receipt = await _service(publisher).accept([_envelope()])

    assert receipt.accepted == 1
    assert receipt.rejected_count == 0
    topic, _key, _payload = publisher.published[0]
    assert topic == topic_name(LogKind.EVENT)


async def test_조직_스코프인데_조직id가_없으면_거부된다() -> None:
    publisher = _FakePublisher()

    receipt = await _service(publisher).accept(
        [_envelope(scope=LogScope.ORGANIZATION, organization_id=None)]
    )

    assert receipt.accepted == 0
    assert receipt.rejected[0].reason is RejectReason.INVALID_ENVELOPE
    # 핵심: 거부된 레코드는 버퍼에 닿지 않는다.
    assert publisher.published == []


async def test_감사로그인데_주체가_없으면_거부된다() -> None:
    publisher = _FakePublisher()

    receipt = await _service(publisher).accept([_envelope(kind=LogKind.AUDIT, actor=None)])

    assert receipt.accepted == 0
    assert receipt.rejected[0].reason is RejectReason.INVALID_ENVELOPE


async def test_감사로그는_주체가_있으면_통과한다() -> None:
    publisher = _FakePublisher()

    receipt = await _service(publisher).accept(
        [
            _envelope(
                kind=LogKind.AUDIT,
                actor=Actor(principal_type=PrincipalType.ADMIN_USER, actor_id=7),
            )
        ]
    )

    assert receipt.accepted == 1
    assert publisher.published[0][0] == topic_name(LogKind.AUDIT)


async def test_배치의_잘못된_한건이_나머지를_죽이지_않는다() -> None:
    """부분 성공: 장애 때 정작 필요한 로그가 사라지지 않게 하는 성질."""
    publisher = _FakePublisher()

    receipt = await _service(publisher).accept(
        [
            _envelope(),
            _envelope(scope=LogScope.AI_TOOL, ai_tool=None),  # 도구 누락 → 거부
            _envelope(),
        ]
    )

    assert receipt.accepted == 2
    assert receipt.rejected_count == 1
    assert len(publisher.published) == 2


async def test_조직_로그는_조직단위_파티션키로_발행된다() -> None:
    """같은 조직의 로그가 같은 파티션에 가야 조직 타임라인의 시간 순서가 보장된다."""
    publisher = _FakePublisher()

    await _service(publisher).accept(
        [_envelope(scope=LogScope.ORGANIZATION, organization_id=42)]
    )

    _topic, key, _payload = publisher.published[0]
    assert key == "42:-"
