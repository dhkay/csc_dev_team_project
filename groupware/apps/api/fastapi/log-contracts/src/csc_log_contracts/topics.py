"""Kafka 토픽 네이밍 규약: 프로듀서/컨슈머 공유.

토픽은 kind 로만 쪼갠다. 보존기간이 kind 별로 다르고 Kafka 는 토픽 단위로 retention 을 주기 때문이다.
조직/AI도구는 카디널리티가 높아 토픽이 아니라 메시지 키와 컬럼으로 간다(토픽 폭발 방지).

유일한 예외가 승격이다. 특정 AI 도구가 트래픽/보존정책/격리 요구를 충족하면 그 도구만
전용 토픽 네임스페이스로 올려 독립 파이프라인(전용 컨슈머그룹 + 전용 ClickHouse DB)을 갖는다.
정책(어느 도구를 승격할지)은 log-server 설정이 정하고, 여기서는 이름만 만든다.
"""

from __future__ import annotations

from .types import LogKind

NAMESPACE = "csc"
PLATFORM_SCOPE = "platform"

#: 검증/적재에 실패한 메시지의 종착지. scope 별로 하나씩 둔다.
DLQ_SUFFIX = "dlq"


def topic_name(kind: LogKind, scope_name: str = PLATFORM_SCOPE) -> str:
    """`csc.logs.event` (기본) 또는 `csc.marketing-video.logs.event` (승격).

    scope_name 이 기본값이면 네임스페이스를 끼우지 않아, 승격 전후로 기본 토픽 이름이 바뀌지 않는다.
    """
    if scope_name == PLATFORM_SCOPE:
        return f"{NAMESPACE}.logs.{kind.value.lower()}"
    return f"{NAMESPACE}.{scope_name}.logs.{kind.value.lower()}"


def dlq_topic_name(scope_name: str = PLATFORM_SCOPE) -> str:
    """`csc.logs.dlq` / `csc.marketing-video.logs.dlq`."""
    if scope_name == PLATFORM_SCOPE:
        return f"{NAMESPACE}.logs.{DLQ_SUFFIX}"
    return f"{NAMESPACE}.{scope_name}.logs.{DLQ_SUFFIX}"


def consumer_group(scope_name: str = PLATFORM_SCOPE) -> str:
    """`log-sink.platform` / `log-sink.marketing-video`.

    승격된 도구가 자기 오프셋을 독립적으로 갖도록 scope 마다 그룹을 분리한다.
    """
    return f"log-sink.{scope_name}"


def all_topics(scope_name: str = PLATFORM_SCOPE) -> list[str]:
    """해당 scope 의 전 토픽(4 kind + DLQ): 토픽 생성/구독에 사용."""
    return [topic_name(k, scope_name) for k in LogKind] + [dlq_topic_name(scope_name)]
