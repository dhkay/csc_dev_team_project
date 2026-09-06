"""카탈로그 도메인 예외. 프레임워크 비종속: HTTP 변환은 인바운드 어댑터가 한다."""

from __future__ import annotations

from collections.abc import Sequence


class CatalogError(Exception):
    """카탈로그 기본 예외."""


class UnknownSourceError(CatalogError):
    """등록되지 않은 소스 id."""

    def __init__(self, source_id: str, known: Sequence[str]) -> None:
        self.source_id = source_id
        self.known = tuple(known)
        super().__init__(f"알 수 없는 수집 소스: {source_id}")


class SourceOptionsUnavailableError(CatalogError):
    """서술자는 있으나 선택지가 없다(수집 구현 전)."""

    def __init__(self, source_id: str) -> None:
        self.source_id = source_id
        super().__init__(f"아직 수집 구현이 없는 소스입니다: {source_id}")
