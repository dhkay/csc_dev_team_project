"""카탈로그 서비스 테스트."""

from __future__ import annotations

import pytest

from app.domains.catalog.core.application.services import SourceCatalogService
from app.domains.catalog.core.domain.entities import (
    CategoryOption,
    InputOption,
    RefreshPolicy,
    SourceDescriptor,
    SourceOptions,
)
from app.domains.catalog.core.domain.errors import (
    SourceOptionsUnavailableError,
    UnknownSourceError,
)
from app.domains.catalog.core.domain.types import SourceStatus

HOURLY = RefreshPolicy(ttl_seconds=1800, auto=True)
AVAILABLE = SourceDescriptor(
    id="A", label="a", description="", status=SourceStatus.AVAILABLE, refresh=HOURLY
)
PLANNED = SourceDescriptor(
    id="P", label="p", description="", status=SourceStatus.PLANNED
)
OPTIONS = SourceOptions(
    source_id="A", categories=(CategoryOption(value="1", label="하나"),)
)


def _service() -> SourceCatalogService:
    return SourceCatalogService([AVAILABLE, PLANNED], {"A": OPTIONS})


def test_lists_planned_sources_too() -> None:
    """구현이 없어도 목록에는 나온다(AI 도구가 자체 목록을 들지 않게 하려는 목적)."""
    assert [s.id for s in _service().list_sources()] == ["A", "P"]


def test_options_of_a_planned_source_are_a_distinct_failure() -> None:
    """오타(없는 소스)와 '아직 준비 안 됨'은 호출부가 다르게 다뤄야 한다."""
    with pytest.raises(SourceOptionsUnavailableError):
        _service().get_options("P")
    with pytest.raises(UnknownSourceError):
        _service().get_options("NOPE")


def test_category_validation_is_the_gate_for_collection_requests() -> None:
    service = _service()
    assert service.is_valid_category("A", "1") is True
    assert service.is_valid_category("A", "999") is False
    # 구현 없는 소스/없는 소스는 어떤 값도 통과시키지 않는다.
    assert service.is_valid_category("P", "1") is False
    assert service.is_valid_category("NOPE", "1") is False


def test_available_source_without_a_refresh_policy_is_rejected() -> None:
    """정책 없이 available 이 되면 기본 주기를 물려받아 조용히 쿼터를 태운다."""
    no_policy = SourceDescriptor(
        id="Q", label="q", description="", status=SourceStatus.AVAILABLE
    )
    with pytest.raises(ValueError, match="수집 정책 없는"):
        SourceCatalogService([no_policy], {})


def test_refresh_policy_answers_per_source() -> None:
    quota_bound = SourceDescriptor(
        id="Q",
        label="q",
        description="",
        status=SourceStatus.AVAILABLE,
        refresh=RefreshPolicy(ttl_seconds=24 * 3600, auto=False),
    )
    service = SourceCatalogService([AVAILABLE, PLANNED, quota_bound], {"A": OPTIONS})

    assert service.ttl_seconds("A") == 1800
    assert service.ttl_seconds("Q") == 24 * 3600
    assert service.is_auto_refresh("A") is True
    # 쿼터가 좁은 소스는 크론이 건너뛴다. 조회가 있을 때만 모은다.
    assert service.is_auto_refresh("Q") is False
    # 모으지 않는 소스는 정책도 없다.
    assert service.refresh_policy("P") is None
    assert service.is_auto_refresh("P") is False
    assert service.is_auto_refresh("NOPE") is False


def test_input_axis_describes_free_text_parameters() -> None:
    """고정 선택지가 없는 소스는 무엇을 써 넣어야 하는지 카탈로그가 알려준다."""
    keyword_source = SourceDescriptor(
        id="K", label="k", description="", status=SourceStatus.AVAILABLE, refresh=HOURLY
    )
    options = SourceOptions(
        source_id="K",
        inputs=(
            InputOption(
                name="keyword",
                label="키워드",
                required=True,
                max_length=100,
                example="수분크림",
            ),
        ),
    )
    service = SourceCatalogService([keyword_source], {"K": options})

    assert [i.name for i in service.get_options("K").inputs] == ["keyword"]
    # 분야 축이 없는 소스에 분야를 보내는 것은 계약 위반이다(입력 축과 무관하게 거절).
    assert service.is_valid_category("K", "keyword") is False


def test_duplicate_descriptor_and_orphan_options_are_rejected() -> None:
    with pytest.raises(ValueError, match="중복"):
        SourceCatalogService([AVAILABLE, AVAILABLE], {})
    # 서술자 없는 선택지는 목록에 안 나오면서 호출은 되는 유령이 된다.
    with pytest.raises(ValueError, match="서술자 없는"):
        SourceCatalogService([AVAILABLE], {"GHOST": OPTIONS})


def test_real_catalog_exposes_datalab_categories_and_expected_counts() -> None:
    """수집기가 분야와 보관 수의 단일 출처다(프론트가 상수를 복제하지 않게)."""
    from app.source_catalog import get_source_catalog

    options = get_source_catalog().get_options("NAVER_SHOPPING_INSIGHT")
    assert len(options.categories) == 12
    assert {p.value: p.expected for p in options.periods} == {
        "daily": 12,
        "weekly": 12,
        "monthly": 3,
    }
