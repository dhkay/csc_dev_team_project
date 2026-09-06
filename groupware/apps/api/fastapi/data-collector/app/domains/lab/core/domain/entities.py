"""lab 도메인 엔티티: 업스트림 왕복 기록과 프로브 결과, 그리고 요청 값 객체.

순수 파이썬만 쓴다(FastAPI/httpx/SQLAlchemy import 금지).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .types import LabSource, ProbeOutcome


@dataclass(frozen=True)
class UpstreamExchange:
    """어댑터가 돌려주는 해석되지 않은 왕복 기록. 어댑터는 성패를 판정하지 않는다.

    판정을 서비스로 몰아두면 "업스트림 실패는 예외가 아니다" 라는 규칙이 소스마다 복제되지 않는다.
    """

    method: str
    url: str  # 쿼리 포함. 네 API 모두 헤더 인증이라 쿼리에 시크릿이 없다
    sent_header_names: tuple[str, ...]  # 값이 아니라 **이름만**: 값은 전부 시크릿이다
    request_body: Any | None
    status_code: int
    elapsed_ms: int
    body: Any | None  # JSON 파싱 성공 시 그대로, 실패 시 원문 텍스트


@dataclass(frozen=True)
class ProbeResult:
    """프로브 1회의 결과. 업스트림 4xx/5xx 도 실패가 아니라 이 형태로 돌아온다."""

    source: LabSource
    outcome: ProbeOutcome
    exchange: UpstreamExchange | None = None
    error: str | None = None  # 우리 쪽 실패 사유(업스트림 본문이 아니다)
    missing_env: tuple[str, ...] = ()
    hint: str | None = None  # 알려진 실패 패턴의 조치 안내


# ---- 요청 값 객체 (sandbox/api-test 의 실측 파라미터와 1:1) ----


@dataclass(frozen=True)
class KeywordGroup:
    group_name: str
    keywords: tuple[str, ...]


@dataclass(frozen=True)
class SearchTrendQuery:
    """LAB-001 데이터랩 검색어 트렌드."""

    start_date: str
    end_date: str
    time_unit: str  # date | week | month
    keyword_groups: tuple[KeywordGroup, ...]
    device: str | None = None
    gender: str | None = None
    ages: tuple[str, ...] = ()


@dataclass(frozen=True)
class CategorySpec:
    name: str
    param: tuple[str, ...]


@dataclass(frozen=True)
class ShoppingCategoriesQuery:
    """LAB-002 쇼핑인사이트 분야별. category 는 배열이다."""

    start_date: str
    end_date: str
    time_unit: str
    category: tuple[CategorySpec, ...]
    device: str | None = None
    gender: str | None = None
    ages: tuple[str, ...] = ()


@dataclass(frozen=True)
class ShoppingKeywordAgeQuery:
    """LAB-003 쇼핑인사이트 키워드 연령별. category 는 단수 문자열이다(No.2 와 다르다)."""

    start_date: str
    end_date: str
    time_unit: str
    category: str
    keyword: str


@dataclass(frozen=True)
class KeywordToolQuery:
    """LAB-004 검색광고 키워드도구."""

    hint_keywords: tuple[str, ...]  # 최대 5개, 공백 제거 후 콤마 결합
    show_detail: bool = True
    month: str | None = None
    limit: int = 20  # 응답 절단(791행/170KB 를 그대로 렌더하면 Scalar 가 못 쓴다)


@dataclass(frozen=True)
class KeywordVolume:
    keyword: str
    monthly_searches: int


@dataclass(frozen=True)
class NormalizedKeywords:
    """LAB-004 전용 정규화 결과. 절단했으면 반드시 그 사실을 함께 싣는다."""

    keywords: tuple[KeywordVolume, ...] = field(default_factory=tuple)
    returned: int = 0
    total: int = 0
    truncated: bool = False
