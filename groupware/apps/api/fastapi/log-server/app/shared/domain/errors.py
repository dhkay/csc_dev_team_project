"""도메인 예외: 프레임워크 비종속(HTTP 를 모른다).

HTTP 상태 변환은 inbound 어댑터(라우터)가 담당한다. 코어가 HTTPException 을 던지기
시작하면 코어를 프레임워크 없이 테스트할 수 없게 된다.
"""

from __future__ import annotations


class DomainError(Exception):
    """log-server 도메인 기본 예외."""


class ScopeDeniedError(DomainError):
    """요청한 스코프를 볼 권한이 없음. 라우터가 403 으로 변환."""


class InvalidQueryError(DomainError):
    """조회 조건이 잘못됨. 라우터가 400 으로 변환."""
