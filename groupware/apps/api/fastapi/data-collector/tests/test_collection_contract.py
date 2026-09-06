"""수집 API 계약 테스트(csc-marketing 이 의존하는 표면).

여기서 깨지는 것들은 전부 조용한 증상으로만 드러난다: 경로가 바뀌면 소비자가 빈 목록으로
degrade 하고, expectedBuckets 가 빠지면 진행률 바가 사라지고, status 가 빠지면 UI 가 다시
빈 배열로 상태를 추측한다.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from csc_net_utils import create_service_token

from app.config import get_settings
from app.domains.collection.core.domain.entities import CollectionSnapshot, CollectionTarget
from app.domains.collection.core.domain.types import CollectionStatus
from app.domains.datalab.adapters.inbound.http.router import get_collection_service
from app.main import create_app

SECRET = "dev-only-service-secret"
VALID_CID = "50000002"


class StubCollection:
    """상태와 items 를 지정해 주는 CollectionInboundPort 대역."""

    def __init__(self, status: CollectionStatus, items: list[dict] | None = None) -> None:
        self._status = status
        self._items = items or []
        self.enqueued: list[CollectionTarget] = []

    async def get_latest(self, target: CollectionTarget) -> CollectionSnapshot:
        return CollectionSnapshot(
            target=target,
            status=self._status,
            items=self._items,
            collected_at=datetime.now(timezone.utc) if self._items else None,
        )

    async def enqueue_refresh(self, target: CollectionTarget) -> None:
        self.enqueued.append(target)


def _client(stub: StubCollection) -> TestClient:
    get_settings.cache_clear()
    app = create_app()
    app.dependency_overrides[get_collection_service] = lambda: stub
    return TestClient(app)


def _headers(service: str = "csc-marketing") -> dict[str, str]:
    return {"X-Service-Token": create_service_token(SECRET, service)}


# ---- 카탈로그 ----


def test_sources_lists_available_and_planned() -> None:
    body = _client(StubCollection(CollectionStatus.OK)).get("/sources", headers=_headers()).json()
    by_id = {s["id"]: s for s in body}

    # 수집 구현이 있는 소스는 available 이다.
    for source_id in (
        "NAVER_SHOPPING_INSIGHT",
        "NAVER_AD_KEYWORD",
        "NAVER_SEARCH_TREND",
        "GOOGLE_TRENDS",
        "NATE_REALTIME",
        "WIKIPEDIA_SUMMARY",
    ):
        assert by_id[source_id]["status"] == "available", source_id
    # 구현이 없는 소스도 목록에는 나온다(AI 도구가 자체 목록을 들지 않게 하려는 목적).
    assert by_id["COUPANG_REVIEW"]["status"] == "planned"
    # 수집 방식(크롤/API)은 내보내지 않는다: 소비자가 그걸로 할 수 있는 일이 없다.
    assert "method" not in by_id["NAVER_SHOPPING_INSIGHT"]


def test_options_serve_categories_and_expected_counts() -> None:
    client = _client(StubCollection(CollectionStatus.OK))
    body = client.get("/sources/NAVER_SHOPPING_INSIGHT/options", headers=_headers()).json()

    assert len(body["categories"]) == 12
    assert body["categories"][0] == {"value": "50000000", "label": "패션의류"}
    # 진행률 분모의 단일 출처. 프론트가 Python 상수를 복제하지 않게 한다.
    assert {p["value"]: p["expected"] for p in body["periods"]} == {
        "daily": 12,
        "weekly": 12,
        "monthly": 3,
    }


def test_options_of_a_planned_source_is_409_not_404() -> None:
    client = _client(StubCollection(CollectionStatus.OK))
    assert client.get("/sources/COUPANG_REVIEW/options", headers=_headers()).status_code == 409
    assert client.get("/sources/NOPE/options", headers=_headers()).status_code == 404


# ---- 수집 조회 ----


def test_latest_keeps_the_path_and_fields_csc_marketing_depends_on() -> None:
    stub = StubCollection(
        CollectionStatus.OK, [{"date": "2026-08-10", "keywords": [{"rank": 1, "keyword": "김치찌개"}]}]
    )
    res = _client(stub).get(
        f"/datalab/shopping-keywords/latest?cid={VALID_CID}&period=daily", headers=_headers()
    )
    body = res.json()

    assert res.status_code == 200
    assert body["cid"] == VALID_CID and body["period"] == "daily"
    assert body["buckets"][0]["keywords"][0]["keyword"] == "김치찌개"
    assert body["status"] == "ok"
    assert body["expectedBuckets"] == 12


@pytest.mark.parametrize(
    ("status", "expected"),
    [(CollectionStatus.COLLECTING, "collecting"), (CollectionStatus.FAILED, "failed")],
)
def test_expected_buckets_is_filled_even_when_nothing_is_collected(status, expected) -> None:
    """버킷이 비어 있는 순간이 바로 분모가 필요한 순간이다.

    이게 비면 소비자는 다시 상수를 복제하거나 진행률을 포기한다.
    """
    res = _client(StubCollection(status)).get(
        f"/datalab/shopping-keywords/latest?cid={VALID_CID}&period=monthly", headers=_headers()
    )
    body = res.json()

    assert body["status"] == expected
    assert body["buckets"] == []
    assert body["expectedBuckets"] == 3
    assert body["collectedAt"] is None


def test_unknown_category_is_rejected_immediately() -> None:
    """검증이 없으면 알 수 없는 분야가 그대로 벤더에 가고, 빈 응답이 '수집 중'과 구분되지 않아
    화면이 영구 로딩으로 굳는다(그리고 폴링이 멈추지 않는다)."""
    stub = StubCollection(CollectionStatus.OK)
    res = _client(stub).get(
        "/datalab/shopping-keywords/latest?cid=99999999&period=daily", headers=_headers()
    )

    assert res.status_code == 400
    assert stub.enqueued == []  # 잡도 등록되지 않는다


def test_refresh_validates_the_category_too() -> None:
    stub = StubCollection(CollectionStatus.OK)
    client = _client(stub)
    assert (
        client.post(
            "/datalab/shopping-keywords/refresh?cid=99999999&period=daily", headers=_headers()
        ).status_code
        == 400
    )
    assert (
        client.post(
            f"/datalab/shopping-keywords/refresh?cid={VALID_CID}&period=daily", headers=_headers()
        ).status_code
        == 200
    )
    assert len(stub.enqueued) == 1
