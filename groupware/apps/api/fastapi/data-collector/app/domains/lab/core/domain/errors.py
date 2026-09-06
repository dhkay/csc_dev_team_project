"""lab 도메인 예외. 프레임워크 비종속(HTTP 를 모른다): 변환은 서비스/라우터가 한다.

업스트림의 4xx/5xx 는 여기 없다. 그건 예외가 아니라 결과(ProbeResult)로 다룬다.
아래 둘은 "업스트림 응답을 받지 못한" 경우, 즉 상태코드가 존재하지 않는 상황만 표현한다.
"""

from __future__ import annotations

from collections.abc import Sequence


class LabError(Exception):
    """lab 기본 예외."""


class CredentialsNotConfiguredError(LabError):
    """자격증명 미설정: 호출을 시도하지 않았다.

    미설정 변수명을 그대로 실어 보낸다. 운영자가 알고 싶은 건 "왜 안 되나" 가 아니라
    "무엇을 채워야 하나" 이기 때문이다.
    """

    def __init__(self, missing: Sequence[str]) -> None:
        self.missing = tuple(missing)
        super().__init__(f"자격증명 미설정: {', '.join(self.missing)}")


class UpstreamUnreachableError(LabError):
    """연결 실패/타임아웃: 업스트림에 닿지 못해 상태코드가 없다."""
