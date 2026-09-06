"""csc 로그 엔벨로프 계약 (Python 측 단일 구현).

TS 측 동일 구현: packages/log-contracts (@csc/log-contracts).
AiToolKey 는 packages/entitlements 를 미러링하며, 일치는 CI 스크립트가 강제한다.

zero-dep: 표준 라이브러리만 쓴다. 모든 프로듀서가 의존하므로 여기 들어온 의존성은 전 서비스로 번진다.
"""

from .envelope import Actor, LogEnvelope
from .errors import InvalidEnvelopeError, LogContractError
from .serde import decode, encode, from_dict, to_dict
from .topics import (
    NAMESPACE,
    PLATFORM_SCOPE,
    all_topics,
    consumer_group,
    dlq_topic_name,
    topic_name,
)
from .types import (
    AiToolKey,
    LogKind,
    LogLevel,
    LogScope,
    PrincipalType,
    to_ai_tool_key,
)

__all__ = [
    # 엔벨로프
    "LogEnvelope",
    "Actor",
    # 타입
    "LogKind",
    "LogLevel",
    "LogScope",
    "AiToolKey",
    "PrincipalType",
    "to_ai_tool_key",
    # 직렬화
    "to_dict",
    "from_dict",
    "encode",
    "decode",
    # 토픽
    "topic_name",
    "dlq_topic_name",
    "consumer_group",
    "all_topics",
    "NAMESPACE",
    "PLATFORM_SCOPE",
    # 예외
    "LogContractError",
    "InvalidEnvelopeError",
]
