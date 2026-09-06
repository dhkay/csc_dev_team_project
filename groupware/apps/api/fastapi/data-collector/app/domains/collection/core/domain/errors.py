"""수집 커널 예외. 프레임워크 비종속: HTTP 변환은 인바운드 어댑터가 한다."""

from __future__ import annotations

from collections.abc import Sequence


class CollectionError(Exception):
    """수집 커널 기본 예외."""


class UnknownCollectionSourceError(CollectionError):
    """레지스트리에 없는 소스.

    폴백하지 않고 던지는 이유: 추론은 엉뚱한 provider 로 폴백해도 응답 하나가 나빠질 뿐이지만,
    수집은 엉뚱한 소스가 답하면 맞는 키 아래에 틀린 데이터가 영속 저장되고 캐시로 굳는다.
    """

    def __init__(self, source: str, known: Sequence[str]) -> None:
        self.source = source
        self.known = tuple(known)
        super().__init__(
            f"등록되지 않은 수집 소스: {source} (등록: {', '.join(self.known)})"
        )
