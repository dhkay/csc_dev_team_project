"""스토리지 라우터 스모크 테스트: 요청이 실제로 응답까지 도달하는지 본다.

서비스 단위 테스트는 규칙을 지키지만 라우터가 서비스를 부르고 그 결과를 응답으로 옮기는 구간은
지나친다. 그 구간의 실수(인자 개수, 응답 매핑)는 타입 검사에도 걸리지 않고 500 으로만 드러난다.
실제로 확정과 이름 변경이 그렇게 깨져 업로드가 실패한 적이 있어, 그 자리를 여기서 고정한다.

서비스는 fake 로 갈아 끼운다(여기서 검증하는 것은 배선이지 규칙이 아니다).
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from csc_net_utils import create_service_token

from app.config import get_settings
from app.domains.upload.adapters.inbound.http.storage_router import get_storage_service
from app.domains.upload.core.domain.entities import StorageListing, UploadAsset
from app.domains.upload.core.domain.types import StorageArea, UploadStatus
from app.main import create_app

ORG = 7
ME = 11
NOW = datetime(2026, 8, 25, tzinfo=timezone.utc)

COMMON_SCOPE = {
    "area": "COMMON",
    "department_id": None,
    "department_ids": [],
    "can_manage_org": False,
    "is_team_leader": False,
}


def _asset(asset_id: str = "doc", name: str = "보고서.pdf") -> UploadAsset:
    return UploadAsset(
        id=asset_id,
        file_name=name,
        mime_type="application/pdf",
        size=100,
        object_key=f"groupware/{ORG}/storage/common/{asset_id}",
        status=UploadStatus.UPLOADED,
        created_at=NOW,
        scope="groupware",
        organization_id=ORG,
        storage_area=StorageArea.COMMON,
        owner_user_id=ME,
    )


class _FakeStorageService:
    """라우터가 부르는 만큼만 구현한 fake. 규칙 검증은 서비스 테스트가 한다."""

    async def list_items(self, *args, **kwargs) -> StorageListing:
        return StorageListing(assets=[_asset()], total=1)

    async def read_common_file(self, upload_id: str) -> tuple[UploadAsset, str]:
        if upload_id != "doc":
            raise LookupError("file not found")
        return _asset(), __file__

    async def confirm(self, *args, **kwargs) -> UploadAsset:
        return _asset()

    async def rename(self, *args, **kwargs) -> UploadAsset:
        return _asset(name="최종본.pdf")


def _client(app) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _headers() -> dict[str, str]:
    secret = get_settings().service_token_secret
    return {
        "X-Service-Token": create_service_token(secret, "web-groupware"),
        "X-Organization-Id": str(ORG),
        "X-User-Id": str(ME),
    }


@pytest.fixture
def app():
    application = create_app()
    application.dependency_overrides[get_storage_service] = lambda: _FakeStorageService()
    return application


async def test_confirm_returns_the_file(app) -> None:
    """업로드 확정이 응답까지 간다. 여기가 깨지면 사용자에게는 업로드 실패로 보인다."""
    async with _client(app) as client:
        res = await client.post(
            "/storage/files/doc/confirm",
            json={"scope": COMMON_SCOPE},
            headers=_headers(),
        )

    assert res.status_code == 200
    assert res.json()["id"] == "doc"


async def test_rename_returns_the_new_name(app) -> None:
    async with _client(app) as client:
        res = await client.post(
            "/storage/files/doc",
            json={"scope": COMMON_SCOPE, "file_name": "최종본.pdf"},
            headers=_headers(),
        )

    # 이름 변경은 PATCH 다. POST 로는 405 여야 한다(경로가 겹치지 않는지 함께 확인).
    assert res.status_code == 405

    async with _client(app) as client:
        res = await client.patch(
            "/storage/files/doc",
            json={"scope": COMMON_SCOPE, "file_name": "최종본.pdf"},
            headers=_headers(),
        )

    assert res.status_code == 200
    assert res.json()["file_name"] == "최종본.pdf"


async def test_common_file_opens_without_identity(app) -> None:
    """공통 파일은 조직도 사용자도 묻지 않고 열린다(로그인 없는 방문자가 보는 경로)."""
    secret = get_settings().service_token_secret
    async with _client(app) as client:
        res = await client.get(
            "/storage/common/doc",
            headers={"X-Service-Token": create_service_token(secret, "web-groupware")},
        )

    assert res.status_code == 200


async def test_common_path_refuses_other_areas(app) -> None:
    """조직과 개인 파일의 id 로 이 경로를 불러도 열리지 않는다."""
    secret = get_settings().service_token_secret
    async with _client(app) as client:
        res = await client.get(
            "/storage/common/mine",
            headers={"X-Service-Token": create_service_token(secret, "web-groupware")},
        )

    assert res.status_code == 404


async def test_other_services_are_refused(app) -> None:
    """스토리지 화면은 groupware 웹 하나가 쓴다. 다른 서비스 토큰은 통과하지 못한다."""
    secret = get_settings().service_token_secret
    async with _client(app) as client:
        res = await client.post(
            "/storage/list",
            json={"scope": COMMON_SCOPE},
            headers={
                "X-Service-Token": create_service_token(secret, "csc-marketing"),
                "X-Organization-Id": str(ORG),
                "X-User-Id": str(ME),
            },
        )

    assert res.status_code == 403


async def test_identity_headers_are_required(app) -> None:
    """조직과 사용자는 서버가 자기 값으로 확인한다. 없으면 요청 자체가 성립하지 않는다."""
    secret = get_settings().service_token_secret
    async with _client(app) as client:
        res = await client.post(
            "/storage/list",
            json={"scope": COMMON_SCOPE},
            headers={"X-Service-Token": create_service_token(secret, "web-groupware")},
        )

    assert res.status_code == 400
