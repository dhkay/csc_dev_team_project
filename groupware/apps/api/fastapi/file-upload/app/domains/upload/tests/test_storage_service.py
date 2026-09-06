"""스토리지 화면 서비스 단위 테스트: Outbound Port 를 fake 로 주입.

여기서 지키려는 것은 두 가지다. 스코프를 부풀려 보내도 넘지 못하는 경계가 실제로 있는가,
그리고 이름이 바뀌어도 파일이 제자리에 있는가.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.domains.upload.core.application.services import UploadService
from app.domains.upload.core.application.storage_service import StorageService
from app.domains.upload.core.domain.entities import UploadAsset
from app.domains.upload.core.domain.types import (
    StorageArea,
    StorageScope,
    StorageSort,
    UploadStatus,
)
from app.domains.upload.tests.fakes import FakeArchive, FakeStorage, FakeUploadRepository

MAX = 200 * 1024 * 1024
ORG = 7
ME = 11
OTHER = 12
SALES = 3
SALES_TEAM = 4
DEV = 5


def make_service() -> tuple[StorageService, FakeUploadRepository, FakeStorage]:
    repo = FakeUploadRepository()
    storage = FakeStorage()
    return StorageService(repo, storage, MAX), repo, storage


def seed(
    repo: FakeUploadRepository,
    storage: FakeStorage,
    *,
    asset_id: str,
    area: StorageArea | None,
    organization_id: int = ORG,
    owner: int | None = ME,
    department_id: int | None = None,
    name: str = "파일.pdf",
    size: int = 100,
    status: UploadStatus = UploadStatus.UPLOADED,
    deleted_at: datetime | None = None,
    deleted_by: int | None = None,
) -> UploadAsset:
    """자산 1건을 바이트와 함께 심는다. area=None 이면 스토리지 자산이 아니다."""
    object_key = f"groupware/{organization_id}/storage/{asset_id}"
    asset = UploadAsset(
        id=asset_id,
        file_name=name,
        mime_type="application/pdf",
        size=size,
        object_key=object_key,
        status=status,
        created_at=datetime.now(timezone.utc),
        scope="groupware",
        organization_id=organization_id,
        storage_area=area,
        department_id=department_id,
        owner_user_id=owner,
        deleted_at=deleted_at,
        deleted_by_user_id=deleted_by,
    )
    repo.saved[asset_id] = asset
    storage.blobs[object_key] = b"x" * size
    return asset


COMMON = StorageScope(area=StorageArea.COMMON)
PERSONAL = StorageScope(area=StorageArea.PERSONAL)
MY_DEPT = StorageScope(
    area=StorageArea.DEPARTMENT, department_id=SALES, department_ids=(SALES,)
)
MANAGER_DEPT = StorageScope(
    area=StorageArea.DEPARTMENT, department_id=DEV, can_manage_org=True
)


# 스코프 경계


async def test_list_excludes_non_storage_assets() -> None:
    """아바타나 마케팅 씬 이미지는 같은 표에 있어도 이 화면의 것이 아니다."""
    service, repo, storage = make_service()
    seed(repo, storage, asset_id="avatar", area=None, name="내사진.png")
    seed(repo, storage, asset_id="doc", area=StorageArea.COMMON)

    listing = await service.list_items(ORG, ME, COMMON)

    assert [a.id for a in listing.assets] == ["doc"]
    assert listing.total == 1


async def test_list_excludes_other_organizations() -> None:
    """조직 경계는 서버가 자기 값(신원 헤더)으로 확인하므로 스코프를 부풀려도 넘지 못한다."""
    service, repo, storage = make_service()
    seed(repo, storage, asset_id="mine", area=StorageArea.COMMON)
    seed(repo, storage, asset_id="theirs", area=StorageArea.COMMON, organization_id=99)

    listing = await service.list_items(ORG, ME, COMMON)

    assert [a.id for a in listing.assets] == ["mine"]


async def test_common_area_is_scoped_to_one_organization() -> None:
    """공통은 그 조직 안에서 공용이다. 다른 조직 사람이 읽지도 쓰지도 못한다."""
    service, repo, storage = make_service()
    seed(repo, storage, asset_id="ours", area=StorageArea.COMMON, organization_id=ORG)
    seed(repo, storage, asset_id="theirs", area=StorageArea.COMMON, organization_id=99)

    ours = await service.list_items(ORG, ME, COMMON)
    theirs = await service.list_items(99, ME, COMMON)

    assert [a.id for a in ours.assets] == ["ours"]
    assert [a.id for a in theirs.assets] == ["theirs"]


async def test_upload_lands_in_the_callers_organization() -> None:
    """저장 경로의 조직은 신원에서 온 값이다. 요청 본문에 조직을 넣을 자리가 없다."""
    service, _, _ = make_service()

    asset, _ = await service.create_presign(
        ORG, ME, COMMON, "공용 서식.docx", "application/msword", 100
    )

    assert asset.organization_id == ORG
    assert asset.object_key.startswith(f"groupware/{ORG}/storage/common/")


async def test_other_organization_cannot_confirm_our_upload() -> None:
    """조직이 다르면 그 자산은 존재하지 않는 것으로 답한다(쓰기 경로도 같은 경계를 쓴다)."""
    service, _, storage = make_service()
    asset, _ = await service.create_presign(
        ORG, ME, COMMON, "공용 서식.docx", "application/msword", 100
    )
    storage.blobs[asset.object_key] = b"bytes"

    with pytest.raises(LookupError):
        await service.confirm(99, ME, COMMON, asset.id)


async def test_personal_area_shows_only_own_files() -> None:
    """개인 영역에는 넓힐 수단 자체가 계약에 없다. 언제나 본인 것만 본다."""
    service, repo, storage = make_service()
    seed(repo, storage, asset_id="mine", area=StorageArea.PERSONAL, owner=ME)
    seed(repo, storage, asset_id="theirs", area=StorageArea.PERSONAL, owner=OTHER)

    listing = await service.list_items(ORG, ME, PERSONAL)

    assert [a.id for a in listing.assets] == ["mine"]


async def test_department_list_holds_only_the_browsed_department() -> None:
    """팀장이 하위 부서에 접근할 수 있어도, 한 부서를 열면 그 부서 파일만 보인다."""
    service, repo, storage = make_service()
    seed(
        repo, storage, asset_id="sales", area=StorageArea.DEPARTMENT, department_id=SALES
    )
    seed(
        repo,
        storage,
        asset_id="sub",
        area=StorageArea.DEPARTMENT,
        department_id=SALES_TEAM,
    )
    leader = StorageScope(
        area=StorageArea.DEPARTMENT,
        department_id=SALES,
        department_ids=(SALES, SALES_TEAM),
        is_team_leader=True,
    )

    listing = await service.list_items(ORG, ME, leader)

    assert [a.id for a in listing.assets] == ["sales"]


async def test_empty_department_set_is_rejected() -> None:
    """빈 인가 집합은 와일드카드가 아니다. 여기서 통과시키면 전 부서가 열린다."""
    service, _, _ = make_service()
    scope = StorageScope(area=StorageArea.DEPARTMENT, department_id=SALES)

    with pytest.raises(PermissionError):
        await service.list_items(ORG, ME, scope)


async def test_department_outside_the_authorized_set_is_rejected() -> None:
    """지금 보려는 부서가 인가 집합 안에 있는지 서버가 다시 확인한다."""
    service, _, _ = make_service()
    scope = StorageScope(
        area=StorageArea.DEPARTMENT, department_id=DEV, department_ids=(SALES,)
    )

    with pytest.raises(PermissionError):
        await service.list_items(ORG, ME, scope)


async def test_department_scope_without_department_is_invalid() -> None:
    """어느 부서를 보는지 없이 부서 영역을 여는 요청은 잘못된 요청이다."""
    service, _, _ = make_service()
    scope = StorageScope(area=StorageArea.DEPARTMENT, can_manage_org=True)

    with pytest.raises(ValueError):
        await service.list_items(ORG, ME, scope)


async def test_org_manager_opens_any_department() -> None:
    """전 부서 접근을 뜻하는 값은 can_manage_org 하나뿐이다."""
    service, repo, storage = make_service()
    seed(repo, storage, asset_id="dev", area=StorageArea.DEPARTMENT, department_id=DEV)

    listing = await service.list_items(ORG, ME, MANAGER_DEPT)

    assert [a.id for a in listing.assets] == ["dev"]


async def test_list_hides_pending_and_trashed() -> None:
    """확정 전 자산이 보이면 수거자가 거둔 뒤 사라져 사용자에게는 유실로 읽힌다."""
    service, repo, storage = make_service()
    seed(repo, storage, asset_id="ok", area=StorageArea.COMMON)
    seed(
        repo,
        storage,
        asset_id="pending",
        area=StorageArea.COMMON,
        status=UploadStatus.PENDING,
    )
    seed(
        repo,
        storage,
        asset_id="trashed",
        area=StorageArea.COMMON,
        deleted_at=datetime.now(timezone.utc),
        deleted_by=ME,
    )

    live = await service.list_items(ORG, ME, COMMON)
    trash = await service.list_items(ORG, ME, COMMON, trashed=True)

    assert [a.id for a in live.assets] == ["ok"]
    assert [a.id for a in trash.assets] == ["trashed"]


async def test_target_out_of_scope_is_not_found() -> None:
    """403 을 주면 남의 부서에 그 파일이 있다는 사실을 알려 주는 오라클이 된다."""
    service, repo, storage = make_service()
    seed(repo, storage, asset_id="theirs", area=StorageArea.PERSONAL, owner=OTHER)

    with pytest.raises(LookupError):
        await service.rename(ORG, ME, PERSONAL, "theirs", "가로채기.pdf")


async def test_claiming_another_area_does_not_open_the_target() -> None:
    """공통이라고 주장하며 남의 개인 파일에 손대는 경로를 닫는다."""
    service, repo, storage = make_service()
    seed(repo, storage, asset_id="theirs", area=StorageArea.PERSONAL, owner=OTHER)
    lying = StorageScope(area=StorageArea.COMMON, can_manage_org=True)

    with pytest.raises(LookupError):
        await service.rename(ORG, ME, lying, "theirs", "가로채기.pdf")


# 업로드


async def test_presign_stamps_ownership_and_immutable_path() -> None:
    """경로에는 불변 id 만 들어간다. 사람 이름도 부서 이름도 파일 이름도 들어가지 않는다."""
    service, repo, _ = make_service()

    asset, url = await service.create_presign(
        ORG, ME, MY_DEPT, "1분기 보고서.pdf", "application/pdf", 1024
    )

    assert asset.status is UploadStatus.PENDING
    assert asset.storage_area is StorageArea.DEPARTMENT
    assert asset.department_id == SALES
    assert asset.owner_user_id == ME
    assert asset.organization_id == ORG
    assert asset.object_key == f"groupware/{ORG}/storage/dept/{SALES}/{asset.id}"
    assert "보고서" not in asset.object_key
    assert "/blob?token=" in url


async def test_personal_upload_is_keyed_by_user_id() -> None:
    """개인 영역은 사용자 id 로 갈린다. 개명해도 폴더가 바뀌지 않는다."""
    service, _, _ = make_service()

    asset, _ = await service.create_presign(
        ORG, ME, PERSONAL, "메모.txt", "text/plain", 10
    )

    assert asset.object_key == f"groupware/{ORG}/storage/personal/{ME}/{asset.id}"


async def test_presign_rejects_oversize() -> None:
    """상한을 넘는 크기는 업로드가 시작되기 전에 막는다."""
    service, _, _ = make_service()

    with pytest.raises(ValueError):
        await service.create_presign(
            ORG, ME, COMMON, "큰파일.zip", "application/zip", MAX + 1
        )


@pytest.mark.parametrize("bad", ["", "   ", "..", "폴더/파일.pdf", "a" * 256])
async def test_presign_rejects_unusable_names(bad: str) -> None:
    """빈 이름, 경로 구분자, 지나치게 긴 이름은 거부한다."""
    service, _, _ = make_service()

    with pytest.raises(ValueError):
        await service.create_presign(ORG, ME, COMMON, bad, "text/plain", 10)


async def test_file_appears_only_after_confirm() -> None:
    """확정 전 자산은 목록에도 사용량에도 잡히지 않는다."""
    service, _, storage = make_service()
    asset, _ = await service.create_presign(
        ORG, ME, COMMON, "계약서.pdf", "application/pdf", 10
    )

    before = await service.list_items(ORG, ME, COMMON)
    storage.blobs[asset.object_key] = b"bytes"
    await service.confirm(ORG, ME, COMMON, asset.id)
    after = await service.list_items(ORG, ME, COMMON)

    assert before.total == 0
    assert [a.id for a in after.assets] == [asset.id]


async def test_discard_removes_an_unconfirmed_upload() -> None:
    """업로드 취소: 확정 전 자산은 바이트와 기록을 함께 지운다(수거자를 기다리지 않는다)."""
    service, repo, storage = make_service()
    asset, _ = await service.create_presign(
        ORG, ME, COMMON, "올리다 만 파일.bin", "application/octet-stream", 10
    )
    storage.blobs[asset.object_key] = b"part"

    removed = await service.discard(ORG, ME, COMMON, asset.id)

    assert removed is True
    assert asset.object_key not in storage.blobs
    assert asset.id not in repo.saved


async def test_discard_refuses_a_confirmed_file() -> None:
    """확정된 파일을 지우는 길은 휴지통뿐이다. 되돌릴 수 있는 단계를 건너뛰게 두지 않는다."""
    service, repo, storage = make_service()
    seed(repo, storage, asset_id="doc", area=StorageArea.COMMON)

    with pytest.raises(ValueError):
        await service.discard(ORG, ME, COMMON, "doc")


async def test_discard_refuses_another_members_upload() -> None:
    """남이 올리던 것은 취소할 수 없다(개인 영역이면 존재조차 알려 주지 않는다)."""
    service, repo, storage = make_service()
    seed(
        repo,
        storage,
        asset_id="theirs",
        area=StorageArea.COMMON,
        owner=OTHER,
        status=UploadStatus.PENDING,
    )

    with pytest.raises(PermissionError):
        await service.discard(ORG, ME, COMMON, "theirs")


async def test_confirm_requires_the_bytes_to_have_arrived() -> None:
    """본문이 도착하지 않았으면 확정하지 않는다."""
    service, _, _ = make_service()
    asset, _ = await service.create_presign(
        ORG, ME, COMMON, "계약서.pdf", "application/pdf", 10
    )

    with pytest.raises(ValueError):
        await service.confirm(ORG, ME, COMMON, asset.id)


# 이름 변경과 삭제


async def test_rename_keeps_the_object_key() -> None:
    """개명이 파일을 옮기지 않는다는 것이 이 기능의 안전성 근거다."""
    service, repo, storage = make_service()
    asset = seed(repo, storage, asset_id="doc", area=StorageArea.COMMON, name="초안.pdf")
    original_key = asset.object_key

    renamed = await service.rename(ORG, ME, COMMON, "doc", "  최종본.pdf ")

    assert renamed.file_name == "최종본.pdf"
    assert renamed.object_key == original_key
    assert storage.blobs[original_key] == b"x" * 100


async def test_others_files_cannot_be_renamed() -> None:
    """공통은 전원이 올리는 공간이라, 아무나 남의 파일을 손대면 사고가 된다."""
    service, repo, storage = make_service()
    seed(repo, storage, asset_id="theirs", area=StorageArea.COMMON, owner=OTHER)

    with pytest.raises(PermissionError):
        await service.rename(ORG, ME, COMMON, "theirs", "내멋대로.pdf")


async def test_org_manager_can_clean_up_others_files() -> None:
    """조직 관리 권한자는 어느 파일이든 정리할 수 있다."""
    service, repo, storage = make_service()
    seed(repo, storage, asset_id="theirs", area=StorageArea.COMMON, owner=OTHER)
    manager = StorageScope(area=StorageArea.COMMON, can_manage_org=True)

    assert await service.trash(ORG, ME, manager, ["theirs"]) == 1


async def test_team_leader_can_clean_up_department_files() -> None:
    """팀장은 자기 부서 파일을 정리한다."""
    service, repo, storage = make_service()
    seed(
        repo,
        storage,
        asset_id="doc",
        area=StorageArea.DEPARTMENT,
        department_id=SALES,
        owner=OTHER,
    )
    leader = StorageScope(
        area=StorageArea.DEPARTMENT,
        department_id=SALES,
        department_ids=(SALES,),
        is_team_leader=True,
    )

    assert await service.trash(ORG, ME, leader, ["doc"]) == 1


async def test_trash_and_restore_round_trip() -> None:
    """휴지통은 바이트를 건드리지 않으므로 복원이 언제나 가능하다."""
    service, repo, storage = make_service()
    asset = seed(repo, storage, asset_id="doc", area=StorageArea.COMMON)

    await service.trash(ORG, ME, COMMON, ["doc"])
    trashed = await service.list_items(ORG, ME, COMMON, trashed=True)
    assert storage.blobs[asset.object_key] == b"x" * 100

    await service.restore(ORG, ME, COMMON, ["doc"])
    restored = await service.list_items(ORG, ME, COMMON)

    assert [a.id for a in trashed.assets] == ["doc"]
    assert [a.id for a in restored.assets] == ["doc"]
    assert repo.saved["doc"].deleted_at is None


async def test_already_trashed_items_are_not_counted_again() -> None:
    """같은 요청을 두 번 보내도 실제로 옮긴 건수만 센다."""
    service, repo, storage = make_service()
    seed(repo, storage, asset_id="doc", area=StorageArea.COMMON)

    first = await service.trash(ORG, ME, COMMON, ["doc"])
    second = await service.trash(ORG, ME, COMMON, ["doc"])

    assert (first, second) == (1, 0)


async def test_bulk_action_rejects_the_whole_batch_on_one_bad_target() -> None:
    """일괄 동작은 대상을 다 검증한 뒤에 손댄다. 일부만 처리되고 나머지가 거부되는 상태는 없다."""
    service, repo, storage = make_service()
    seed(repo, storage, asset_id="mine", area=StorageArea.PERSONAL, owner=ME)
    seed(repo, storage, asset_id="theirs", area=StorageArea.PERSONAL, owner=OTHER)

    with pytest.raises(LookupError):
        await service.trash(ORG, ME, PERSONAL, ["mine", "theirs"])

    # 앞의 것도 그대로다. 검증이 먼저 끝나기 때문이다.
    assert repo.saved["mine"].deleted_at is None


async def test_bulk_action_ignores_duplicate_ids() -> None:
    """같은 id 가 두 번 와도 한 번만 센다(선택 목록이 중복을 담아도 결과가 흔들리지 않게)."""
    service, repo, storage = make_service()
    seed(repo, storage, asset_id="doc", area=StorageArea.COMMON)

    assert await service.trash(ORG, ME, COMMON, ["doc", "doc"]) == 1


async def test_purge_requires_the_trash_step_first() -> None:
    """되돌릴 수 없는 동작 앞에는 되돌릴 수 있는 단계가 하나 있어야 한다."""
    service, repo, storage = make_service()
    seed(repo, storage, asset_id="doc", area=StorageArea.COMMON)

    with pytest.raises(ValueError):
        await service.purge(ORG, ME, COMMON, ["doc"])


async def test_purge_removes_bytes_and_row() -> None:
    """영구 삭제는 바이트를 먼저 지우고 그다음 행을 지운다."""
    service, repo, storage = make_service()
    asset = seed(repo, storage, asset_id="doc", area=StorageArea.COMMON)
    await service.trash(ORG, ME, COMMON, ["doc"])

    purged = await service.purge(ORG, ME, COMMON, ["doc"])

    assert purged == 1
    assert asset.object_key not in storage.blobs
    assert "doc" not in repo.saved


async def test_purge_warns_when_bytes_remain(caplog: pytest.LogCaptureFixture) -> None:
    """보상 실패를 삼키지 않는다. 고아가 생겼다는 사실 자체가 남아야 한다."""
    service, repo, storage = make_service()
    asset = seed(repo, storage, asset_id="doc", area=StorageArea.COMMON)
    storage.delete_fails.add(asset.object_key)
    await service.trash(ORG, ME, COMMON, ["doc"])

    with caplog.at_level("WARNING"):
        await service.purge(ORG, ME, COMMON, ["doc"])

    assert any("doc" in record.getMessage() for record in caplog.records)


# 사용량과 접근 URL


async def test_usage_splits_areas_and_trash() -> None:
    """공통은 조직 전체, 조직은 인가된 부서 합, 개인은 본인 것, 휴지통은 따로 센다."""
    service, repo, storage = make_service()
    seed(repo, storage, asset_id="c1", area=StorageArea.COMMON, size=100)
    seed(
        repo,
        storage,
        asset_id="d1",
        area=StorageArea.DEPARTMENT,
        department_id=SALES,
        size=200,
    )
    seed(
        repo,
        storage,
        asset_id="d2",
        area=StorageArea.DEPARTMENT,
        department_id=DEV,
        size=400,
    )
    seed(repo, storage, asset_id="p1", area=StorageArea.PERSONAL, owner=ME, size=50)
    seed(
        repo, storage, asset_id="p2", area=StorageArea.PERSONAL, owner=OTHER, size=1000
    )
    seed(
        repo,
        storage,
        asset_id="t1",
        area=StorageArea.COMMON,
        size=10,
        deleted_at=datetime.now(timezone.utc),
        deleted_by=ME,
    )

    summary = await service.usage(ORG, ME, (SALES,), can_manage_org=False)

    assert (summary.common.bytes, summary.common.files) == (100, 1)
    assert (summary.department.bytes, summary.department.files) == (200, 1)
    assert (summary.personal.bytes, summary.personal.files) == (50, 1)
    # 휴지통은 영역별로 담긴다(사이드바 개수와 눌러서 보이는 목록을 맞추기 위해).
    assert (
        summary.trash_by_area[StorageArea.COMMON].bytes,
        summary.trash_by_area[StorageArea.COMMON].files,
    ) == (10, 1)
    assert summary.trash_total.files == 1


async def test_manager_usage_sums_every_department() -> None:
    """조직 관리 권한자의 조직 영역 사용량은 전 부서를 합친 값이다."""
    service, repo, storage = make_service()
    seed(
        repo,
        storage,
        asset_id="d1",
        area=StorageArea.DEPARTMENT,
        department_id=SALES,
        size=200,
    )
    seed(
        repo,
        storage,
        asset_id="d2",
        area=StorageArea.DEPARTMENT,
        department_id=DEV,
        size=400,
    )

    summary = await service.usage(ORG, ME, (), can_manage_org=True)

    assert (summary.department.bytes, summary.department.files) == (600, 2)


async def test_read_file_refuses_targets_outside_the_scope() -> None:
    """조직만 보는 발급 경로면 남의 개인 파일을 열 수 있다. 스코프로 막는다."""
    service, repo, storage = make_service()
    seed(repo, storage, asset_id="mine", area=StorageArea.PERSONAL, owner=ME)
    seed(repo, storage, asset_id="theirs", area=StorageArea.PERSONAL, owner=OTHER)

    asset, path = await service.read_file(ORG, ME, PERSONAL, "mine")
    assert asset.id == "mine"
    assert path

    with pytest.raises(LookupError):
        await service.read_file(ORG, ME, PERSONAL, "theirs")


async def test_read_file_refuses_trashed_files() -> None:
    """휴지통에 있는 파일은 내용을 주지 않는다(목록에도 없다)."""
    service, repo, storage = make_service()
    seed(
        repo,
        storage,
        asset_id="doc",
        area=StorageArea.COMMON,
        deleted_at=datetime.now(timezone.utc),
        deleted_by=ME,
    )

    with pytest.raises(LookupError):
        await service.read_file(ORG, ME, COMMON, "doc")


# 외부 주소 차단
#
# 스토리지 파일은 조직 안에서만 오간다. 그래서 "무기명 주소를 만들지 않는다" 와
# "그 주소를 받아 주지 않는다" 를 둘 다 확인한다. 한쪽만 지키면 나중에 다른 경로가
# 주소를 만들었을 때 그대로 새어 나간다.


def make_upload_service(
    repo: FakeUploadRepository, storage: FakeStorage
) -> UploadService:
    """같은 저장소를 보는 범용 업로드 서비스(스토리지 화면이 쓰지 않는 다른 문)."""
    return UploadService(repo, storage, FakeArchive(), MAX)


async def test_storage_files_never_get_a_signed_url() -> None:
    """조직만 보는 범용 발급 경로가 스토리지 자산을 건너뛴다.

    여기서 주소가 하나라도 나오면 받은 사람이 조직 밖으로 넘길 수 있고, 받는 쪽은 로그인 없이
    파일을 연다. 공통과 조직 파일에는 그런 길이 있으면 안 된다.
    """
    _, repo, storage = make_service()
    seed(repo, storage, asset_id="common-doc", area=StorageArea.COMMON)
    seed(
        repo,
        storage,
        asset_id="dept-doc",
        area=StorageArea.DEPARTMENT,
        department_id=SALES,
    )
    seed(repo, storage, asset_id="mine", area=StorageArea.PERSONAL, owner=ME)

    urls = await make_upload_service(repo, storage).mint_access_urls(
        ["common-doc", "dept-doc", "mine"], organization_id=ORG, all_orgs=False
    )

    assert urls == {}


async def test_storage_files_are_not_served_by_the_public_route() -> None:
    """브라우저가 직접 부르는 경로는 스토리지 자산을 내주지 않는다.

    서명 요구를 끄는 운영 스위치가 있어도, 서명 토큰이 유효해도 마찬가지다. 읽는 길은
    서비스토큰을 가진 내부 호출자(web BFF)뿐이고, 그 BFF 가 스코프를 확인한 뒤 중계한다.
    """
    _, repo, storage = make_service()
    seed(repo, storage, asset_id="doc", area=StorageArea.COMMON)
    upload_service = make_upload_service(repo, storage)

    with pytest.raises(ValueError):
        await upload_service.get_download("doc", token=None, internal=False)

    asset, path = await upload_service.get_download("doc", token=None, internal=True)
    assert asset.id == "doc"
    assert path


async def test_page_reports_total_beyond_the_limit() -> None:
    """한 번에 받는 개수를 넘겨도 전체 건수는 그대로 알려 준다(화면의 더 보기가 이 값을 쓴다)."""
    service, repo, storage = make_service()
    for index, name in enumerate(["c.pdf", "a.pdf", "b.pdf"]):
        seed(repo, storage, asset_id=f"f{index}", area=StorageArea.COMMON, name=name)

    page = await service.list_items(ORG, ME, COMMON, sort=StorageSort.NAME, limit=2)
    widened = await service.list_items(ORG, ME, COMMON, sort=StorageSort.NAME, limit=5)

    assert [a.file_name for a in page.assets] == ["a.pdf", "b.pdf"]
    assert page.total == 3
    # 더 보기로 넓히면 앞의 순서가 그대로 유지된 채 뒤가 이어진다.
    assert [a.file_name for a in widened.assets] == ["a.pdf", "b.pdf", "c.pdf"]


async def test_search_narrows_by_name() -> None:
    """검색어는 그 영역 안에서 이름으로만 좁힌다."""
    service, repo, storage = make_service()
    seed(repo, storage, asset_id="a", area=StorageArea.COMMON, name="2026 계약서.pdf")
    seed(repo, storage, asset_id="b", area=StorageArea.COMMON, name="회의록.docx")

    listing = await service.list_items(ORG, ME, COMMON, search="계약")

    assert [a.id for a in listing.assets] == ["a"]


async def test_unconfirmed_storage_asset_is_still_reaper_material() -> None:
    """스토리지 자산도 확정 전에는 기존 PENDING 수거자의 대상이다(별도 규칙을 만들지 않는다)."""
    service, repo, _ = make_service()
    asset, _ = await service.create_presign(
        ORG, ME, COMMON, "미완성.pdf", "application/pdf", 10
    )
    asset.created_at = datetime.now(timezone.utc) - timedelta(hours=48)

    stale = await repo.find_pending_before(
        datetime.now(timezone.utc) - timedelta(hours=24), 10
    )

    assert [a.id for a in stale] == [asset.id]


# 공개 접근(공통 한정)


async def test_common_file_reads_without_identity() -> None:
    """공통 파일은 조직도 사용자도 묻지 않고 읽힌다. 그 주소가 밖으로 나가는 것이 전제다."""
    service, repo, storage = make_service()
    seed(repo, storage, asset_id="doc", area=StorageArea.COMMON)

    asset, path = await service.read_common_file("doc")

    assert asset.id == "doc"
    assert path


async def test_common_read_refuses_other_areas() -> None:
    """조직과 개인 파일은 id 를 알아도 이 경로로 열리지 않는다."""
    service, repo, storage = make_service()
    seed(repo, storage, asset_id="mine", area=StorageArea.PERSONAL, owner=ME)
    seed(
        repo, storage, asset_id="dept", area=StorageArea.DEPARTMENT, department_id=SALES
    )
    seed(repo, storage, asset_id="avatar", area=None)

    for asset_id in ("mine", "dept", "avatar", "없는-id"):
        with pytest.raises(LookupError):
            await service.read_common_file(asset_id)


async def test_common_read_refuses_unconfirmed_and_trashed() -> None:
    """확정 전이거나 휴지통에 있는 공통 파일도 열리지 않는다."""
    service, repo, storage = make_service()
    seed(
        repo,
        storage,
        asset_id="pending",
        area=StorageArea.COMMON,
        status=UploadStatus.PENDING,
    )
    seed(
        repo,
        storage,
        asset_id="trashed",
        area=StorageArea.COMMON,
        deleted_at=datetime.now(timezone.utc),
        deleted_by=ME,
    )

    for asset_id in ("pending", "trashed"):
        with pytest.raises(LookupError):
            await service.read_common_file(asset_id)
