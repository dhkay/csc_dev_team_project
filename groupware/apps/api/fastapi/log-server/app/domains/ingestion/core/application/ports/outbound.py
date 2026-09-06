"""Outbound Port: 외부 의존성 계약. Protocol 로 선언.

- LogPublisherPort  : 버퍼(Kafka)에 발행
- LogSinkPort       : 저장소(ClickHouse)에 배치 적재
- TopicResolverPort : 엔벨로프 → 토픽 이름 (AI 도구 승격 정책이 사는 곳)

세 포트 모두 구체 기술(aiokafka, clickhouse-connect)을 코어에 노출하지 않는다.
저장소를 ClickHouse 에서 바꾸거나 브로커를 Redpanda 로 바꿔도 코어는 그대로다.
"""

from __future__ import annotations

from typing import Protocol

from csc_log_contracts import LogEnvelope, LogKind

from ...domain.entities import DeadLetter


class TopicResolverPort(Protocol):
    """엔벨로프가 어느 토픽으로 갈지 결정한다.

    기본은 `csc.logs.{kind}` 하나지만, 특정 AI 도구를 승격하면 그 도구만
    `csc.{ai_tool}.logs.{kind}` 로 갈린다. 승격은 설정 변경이지 코드 변경이 아니다
    그 정책이 이 포트 뒤에 격리되어 있기 때문이다.
    """

    def resolve(self, envelope: LogEnvelope) -> str: ...

    def resolve_dlq(self) -> str:
        """이 인스턴스가 담당하는 scope 의 DLQ 토픽.

        엔벨로프를 받지 않는다: 실패 레코드는 애초에 파싱이 안 된 경우가 많아 도구를 알 수 없고,
        승격 인스턴스는 자기 scope 토픽만 구독하므로 그 인스턴스의 scope 가 곧 정답이다.
        """
        ...

    def subscriptions(self) -> list[str]:
        """이 인스턴스가 소비해야 할 토픽 목록: 컨슈머가 구독에 사용."""
        ...


class LogPublisherPort(Protocol):
    """버퍼(Kafka) 발행: 수집 경로의 유일한 쓰기 대상."""

    async def publish(self, topic: str, key: str, payload: bytes) -> None: ...

    async def publish_dead_letter(self, topic: str, dead_letter: DeadLetter) -> None:
        """DLQ 발행. 여기서마저 실패하면 예외를 올려 오프셋 커밋을 막는다(유실 방지)."""
        ...


class LogSinkPort(Protocol):
    """저장소(ClickHouse) 적재: kind 별 테이블로 나눠 배치 insert."""

    async def insert(self, kind: LogKind, envelopes: list[LogEnvelope]) -> None:
        """같은 kind 의 엔벨로프를 한 번에 적재한다.

        at-least-once 라 중복이 올 수 있다. 저장소가 event_id 로 최종 중복제거한다
        (ReplacingMergeTree). 따라서 이 메서드는 멱등하다고 간주해도 된다.
        """
        ...
