"""문서 노출 정책: 부모와 /lab 서브앱이 같은 규칙을 따르는지.

서브앱은 정책을 따로 적어야 해서 잊기 쉽다. 부모만 막고 서브앱이 열려 있으면 prod 에서
검증 표면의 문서가 그대로 노출된다.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import create_app


@pytest.fixture(autouse=True)
def _clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.mark.parametrize("path", ["/docs", "/lab/docs"])
def test_docs_are_available_in_dev(monkeypatch: pytest.MonkeyPatch, path: str) -> None:
    monkeypatch.setenv("APP_ENV", "dev")
    get_settings.cache_clear()
    assert TestClient(create_app()).get(path).status_code == 200


@pytest.mark.parametrize("path", ["/docs", "/lab/docs"])
def test_docs_are_hidden_outside_dev(monkeypatch: pytest.MonkeyPatch, path: str) -> None:
    monkeypatch.setenv("APP_ENV", "staging")
    monkeypatch.setenv("SERVICE_TOKEN_SECRET", "staging-secret")
    get_settings.cache_clear()
    assert TestClient(create_app()).get(path).status_code == 404


def test_lab_can_be_turned_off_entirely(monkeypatch: pytest.MonkeyPatch) -> None:
    """끄면 401 이 아니라 404 다: 표면이 없다는 사실이 응답으로 분명해진다."""
    monkeypatch.setenv("LAB_ENABLED", "false")
    get_settings.cache_clear()
    client = TestClient(create_app())
    assert client.get("/lab/openapi.json").status_code == 404
    assert client.get("/openapi.json").status_code == 200
