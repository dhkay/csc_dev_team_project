"""계약 위반 예외: 프레임워크 비종속(HTTP 를 모른다).

HTTP 변환은 log-server 의 inbound 어댑터가 담당한다.
"""

from __future__ import annotations


class LogContractError(Exception):
    """로그 계약 기본 예외."""


class InvalidEnvelopeError(LogContractError):
    """엔벨로프 불변식 위반: 수집 거부 또는 DLQ 대상."""
