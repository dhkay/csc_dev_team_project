"""토픽 라우팅과 AI 도구 승격 경로 잠금.

승격은 "설정만으로 파이프라인이 갈린다"는 약속 위에 서 있다. 그 약속이 깨지면
도구별 격리가 코드 변경을 요구하게 되므로, 라우팅 규칙을 여기서 고정한다.
"""

from __future__ import annotations

from csc_log_contracts import (
    PLATFORM_SCOPE,
    AiToolKey,
    LogEnvelope,
    LogKind,
    LogLevel,
    LogScope,
)

from app.domains.ingestion.adapters.outbound.queue.topic_resolver import ScopedTopicResolver


def _envelope(**overrides) -> LogEnvelope:
    base = {
        "kind": LogKind.EVENT,
        "level": LogLevel.INFO,
        "scope": LogScope.PLATFORM,
        "service": "video-model",
        "action": "video_job.created",
        "message": "",
    }
    base.update(overrides)
    return LogEnvelope(**base)


def test_기본_스코프는_공용_토픽으로_간다() -> None:
    resolver = ScopedTopicResolver()

    assert resolver.resolve(_envelope()) == "csc.logs.event"


def test_승격되지_않은_도구는_공용_토픽에_남는다() -> None:
    resolver = ScopedTopicResolver(promoted_tools=())

    envelope = _envelope(scope=LogScope.AI_TOOL, ai_tool=AiToolKey.MARKETING_VIDEO)

    assert resolver.resolve(envelope) == "csc.logs.event"


def test_승격된_도구는_전용_네임스페이스로_갈린다() -> None:
    """설정(promoted_tools)만 바꿔도 라우팅이 바뀐다. 코드 변경 없음."""
    resolver = ScopedTopicResolver(promoted_tools=("marketing-video",))

    envelope = _envelope(scope=LogScope.AI_TOOL, ai_tool=AiToolKey.MARKETING_VIDEO)

    assert resolver.resolve(envelope) == "csc.marketing-video.logs.event"


def test_승격_설정은_다른_도구의_로그에_영향을_주지_않는다() -> None:
    resolver = ScopedTopicResolver(promoted_tools=("marketing-video",))

    assert resolver.resolve(_envelope(ai_tool=None)) == "csc.logs.event"


def test_kind_마다_토픽이_갈린다() -> None:
    """보존기간이 kind 별로 달라서 토픽이 나뉜다. 한 토픽으로 합치면 정책을 못 준다."""
    resolver = ScopedTopicResolver()

    topics = {resolver.resolve(_envelope(kind=k)) for k in LogKind}

    assert topics == {
        "csc.logs.event",
        "csc.logs.error",
        "csc.logs.audit",
        "csc.logs.access",
    }


def test_승격_인스턴스는_자기_scope_토픽만_구독한다() -> None:
    """남의 로그를 먹지 않아야 컨슈머그룹 분리가 의미를 갖는다."""
    resolver = ScopedTopicResolver(scope_name="marketing-video")

    subscriptions = resolver.subscriptions()

    assert all(t.startswith("csc.marketing-video.") for t in subscriptions)
    assert "csc.marketing-video.logs.dlq" in subscriptions


def test_기본_인스턴스는_공용_토픽을_구독한다() -> None:
    resolver = ScopedTopicResolver(scope_name=PLATFORM_SCOPE)

    assert "csc.logs.event" in resolver.subscriptions()
    assert "csc.logs.dlq" in resolver.subscriptions()
