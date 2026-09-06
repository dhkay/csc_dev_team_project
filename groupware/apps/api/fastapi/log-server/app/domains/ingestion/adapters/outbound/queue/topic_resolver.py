"""TopicResolverPort 구현: AI 도구 승격 정책이 사는 단 한 곳.

기본은 전 로그가 `csc.logs.{kind}` 로 간다. 어떤 AI 도구의 트래픽/보존정책/격리 요구가
커지면 그 도구 key 를 `promoted_tools` 에 넣는 것만으로 `csc.{tool}.logs.{kind}` 로 갈린다
코드 변경 없이 설정만으로 파이프라인이 분리된다.

인스턴스는 자기 `scope_name` 이 담당하는 토픽만 구독한다. 그래서 승격된 도구용으로
같은 이미지를 `LOG_SCOPE=marketing-video` 로 한 벌 더 띄우면 그 도구 전용 컨슈머가 된다.
"""

from __future__ import annotations

from collections.abc import Iterable

from csc_log_contracts import (
    PLATFORM_SCOPE,
    LogEnvelope,
    all_topics,
    dlq_topic_name,
    topic_name,
)


class ScopedTopicResolver:
    """TopicResolverPort(Protocol) 의 구현."""

    def __init__(
        self,
        promoted_tools: Iterable[str] = (),
        scope_name: str = PLATFORM_SCOPE,
    ) -> None:
        #: 전용 네임스페이스로 승격된 AI 도구 key 집합.
        self._promoted = {t.strip() for t in promoted_tools if t.strip()}
        #: 이 인스턴스가 담당하는 scope. 기본(platform)이면 승격되지 않은 전부를 맡는다.
        self._scope_name = scope_name

    def resolve(self, envelope: LogEnvelope) -> str:
        return topic_name(envelope.kind, self._scope_for(envelope))

    def resolve_dlq(self) -> str:
        return dlq_topic_name(self._scope_name)

    def subscriptions(self) -> list[str]:
        """자기 scope 의 토픽만 구독한다. 승격 인스턴스가 남의 로그를 먹지 않도록."""
        return all_topics(self._scope_name)

    def _scope_for(self, envelope: LogEnvelope) -> str:
        """승격된 도구면 그 도구 네임스페이스, 아니면 이 인스턴스의 scope."""
        tool = envelope.ai_tool.value if envelope.ai_tool else None
        if tool and tool in self._promoted:
            return tool
        return self._scope_name
