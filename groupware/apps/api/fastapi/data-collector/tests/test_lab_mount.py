"""/lab 서브앱 배선 테스트.

이 네 가지가 깨지면 예외가 아니라 조용한 증상으로만 드러난다(포털 탭이 비거나, dev 문서가 401).
그래서 여기가 유일한 감시자다.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from csc_net_utils import create_service_token

from app.config import get_settings
from app.main import create_app

SECRET = "dev-only-service-secret"


@pytest.fixture
def client() -> TestClient:
    get_settings.cache_clear()
    return TestClient(create_app())


def _token(service: str = "scalar-gateway") -> dict[str, str]:
    return {"X-Service-Token": create_service_token(SECRET, service)}


def test_lab_openapi_is_served_without_a_service_token(client: TestClient) -> None:
    """면제 접두사 확인. DEFAULT_EXEMPT_PREFIXES 로 되돌리면 여기서 깨진다.

    포털은 스펙 수집에도 토큰을 보내므로 이 면제가 없어도 포털은 돈다. 깨지는 건 dev 의
    /lab/docs 이고, 그건 아무도 즉시 눈치채지 못한다.
    """
    response = client.get("/lab/openapi.json")
    assert response.status_code == 200


def test_lab_document_paths_are_not_prefixed(client: TestClient) -> None:
    """서브앱 문서의 경로는 마운트 접두사를 포함하지 않는다.

    게이트웨이가 servers 를 /proxy/data-collector-lab 으로 rewrite 하고 프록시가 /lab 을 다시
    붙이는 구조라, 문서 경로에까지 /lab 이 들어가면 호출이 /lab/lab/... 로 두 번 붙는다.
    """
    paths = set(client.get("/lab/openapi.json").json()["paths"])
    assert paths == {
        "/naver/datalab/search",
        "/naver/datalab/shopping/categories",
        "/naver/datalab/shopping/keyword-age",
        "/naver/searchad/keywordstool",
    }


def test_parent_document_does_not_contain_lab_paths(client: TestClient) -> None:
    """두 문서가 실제로 갈렸는지. 한 문서에 접두사만 다른 게 아니다."""
    parent = client.get("/openapi.json").json()["paths"]
    assert not any(path.startswith("/lab") for path in parent)
    # 실사용 표면은 부모 문서에 그대로 있어야 한다(마운트 작업이 이걸 떨어뜨리기 쉽다).
    assert "/datalab/shopping-keywords/latest" in parent


def test_lab_routes_require_a_service_token(client: TestClient) -> None:
    """마운트된 라우트도 부모 미들웨어를 통과한다(Starlette Mount 동작에 의존하는 부분)."""
    unauthenticated = client.post("/lab/naver/datalab/search", json={})
    assert unauthenticated.status_code == 401


def test_lab_routes_reject_non_portal_callers(client: TestClient) -> None:
    """'실사용 아님' 을 주석이 아니라 403 으로 보장한다. csc-marketing 은 이 표면에 닿지 못한다."""
    response = client.post("/lab/naver/datalab/search", json={}, headers=_token("csc-marketing"))
    assert response.status_code == 403


def test_health_needs_no_token(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}
