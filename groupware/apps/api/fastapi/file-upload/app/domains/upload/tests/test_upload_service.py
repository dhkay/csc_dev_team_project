"""Service 단위 테스트: Outbound Port(StoragePort/Repository) 를 fake 로 주입."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.domains.upload.adapters.outbound.storage import signing
from app.domains.upload.core.application.services import UploadService
from app.domains.upload.core.domain.types import UploadStatus
from app.domains.upload.tests.fakes import FakeArchive, FakeStorage, FakeUploadRepository

MAX = 50 * 1024 * 1024


async def chunks(*parts: bytes):
    """바이트를 스트림으로 흘려보내는 테스트 헬퍼(브라우저 PUT 이 하는 일과 같은 모양)."""
    for part in parts:
        yield part


def make_service() -> tuple[UploadService, FakeStorage]:
    storage = FakeStorage()
    # archive 는 내부 생성(2-튜플 반환 유지: 기존 테스트 무영향). 아카이브 검증 테스트는 별도 구성.
    return UploadService(FakeUploadRepository(), storage, FakeArchive(), MAX), storage


async def test_presign_yields_pending_asset_and_put_url() -> None:
    service, _ = make_service()

    asset, url = await service.create_presign(
        "보고서.pdf", "application/pdf", 1024, "platform"
    )

    assert asset.status is UploadStatus.PENDING
    assert asset.file_name == "보고서.pdf"
    # object_key = "{scope}/{uuid}": 사용자 파일명 비사용(traversal 차단), 앱별 폴더 분리.
    assert asset.object_key == f"platform/{asset.id}"
    assert "/blob?token=" in url


async def test_delete_removes_bytes_and_meta() -> None:
    service, storage = make_service()
    asset, url = await service.create_presign(
        "s.png", "image/png", 10, "groupware", "42/marketing-video/personal/7"
    )
    token = url.split("token=")[1]
    await service.store_blob_stream(token, chunks(b"x" * 10))
    assert await storage.exists(asset.object_key)

    # 삭제 → 스토리지 바이트 + 메타 제거, True 반환.
    assert await service.delete(asset.id) is True
    assert not await storage.exists(asset.object_key)
    # 멱등: 없는 걸 다시 삭제하면 False.
    assert await service.delete(asset.id) is False


async def test_create_presign_rejects_oversize() -> None:
    service, _ = make_service()
    with pytest.raises(ValueError):
        await service.create_presign("big.mp4", "video/mp4", MAX + 1, "platform")


async def test_create_presign_rejects_unknown_scope() -> None:
    service, _ = make_service()
    with pytest.raises(ValueError):
        await service.create_presign("a.png", "image/png", 3, "../etc")


async def test_groupware_scope_nests_under_partition() -> None:
    service, _ = make_service()

    asset, _ = await service.create_presign("a.png", "image/png", 3, "groupware", "42")

    # 그룹웨어는 조직(테넌트)별 하위 폴더로 분리.
    assert asset.object_key == f"groupware/42/{asset.id}"


async def test_groupware_scope_requires_partition() -> None:
    service, _ = make_service()
    with pytest.raises(ValueError):
        await service.create_presign("a.png", "image/png", 3, "groupware")


async def test_create_presign_rejects_invalid_partition() -> None:
    service, _ = make_service()
    with pytest.raises(ValueError):
        await service.create_presign("a.png", "image/png", 3, "groupware", "../x")


async def test_groupware_multi_segment_partition_hierarchy() -> None:
    service, _ = make_service()
    # 계층 partition: 조직/AI도구/개인 경로. 각 세그먼트가 [a-z0-9-]+ 면 허용.
    asset, _ = await service.create_presign(
        "s.png", "image/png", 3, "groupware", "42/marketing-video/personal/7"
    )
    assert asset.object_key == f"groupware/42/marketing-video/personal/7/{asset.id}"


async def test_create_presign_rejects_bad_partition_segments() -> None:
    service, _ = make_service()
    # 빈 세그먼트/traversal/앞뒤, 연속 슬래시/대문자: 전부 거부(traversal 차단 유지).
    for bad in ("42//x", "42/../x", "42/x/", "/42", "42/Marketing"):
        with pytest.raises(ValueError):
            await service.create_presign("a.png", "image/png", 3, "groupware", bad)


async def test_store_blob_stream_writes_bytes() -> None:
    service, storage = make_service()
    asset, url = await service.create_presign("a.png", "image/png", 3, "platform")
    token = url.split("token=", 1)[1]

    await service.store_blob_stream(token, chunks(b"abc"))

    assert storage.blobs[asset.object_key] == b"abc"


async def test_store_blob_stream_rejects_a_short_payload() -> None:
    """선언한 크기보다 짧으면 커밋하지 않는다.

    업로드가 끊기면 보통 스트림이 예외로 끝나지만, 앞단이 본문을 일찍 닫으면 짧은 본문이 정상
    종료처럼 도착할 수 있다. 그대로 커밋하면 잘린 파일이 확정 가능해져 목록에 멀쩡해 보이는
    깨진 파일이 남는다.
    """
    service, storage = make_service()
    asset, url = await service.create_presign("a.png", "image/png", 10, "platform")
    token = url.split("token=", 1)[1]

    with pytest.raises(ValueError):
        await service.store_blob_stream(token, chunks(b"abc"))

    assert asset.object_key not in storage.blobs


async def test_store_blob_stream_rejects_an_oversized_payload() -> None:
    """선언한 크기를 넘으면 받는 중에 끊는다(다 받은 뒤 재는 것은 늦다)."""
    service, storage = make_service()
    asset, url = await service.create_presign("a.png", "image/png", 2, "platform")
    token = url.split("token=", 1)[1]

    with pytest.raises(ValueError):
        await service.store_blob_stream(token, chunks(b"abcdef"))

    assert asset.object_key not in storage.blobs


async def test_store_blob_stream_rejects_invalid_token() -> None:
    service, _ = make_service()
    with pytest.raises(PermissionError):
        await service.store_blob_stream("bogus", chunks(b"abc"))


async def test_confirm_requires_uploaded_then_marks_uploaded() -> None:
    service, _ = make_service()
    asset, url = await service.create_presign("a.png", "image/png", 3, "platform")

    # PUT 전에는 confirm 불가(디스크에 파일 없음)
    with pytest.raises(ValueError):
        await service.confirm(asset.id)

    await service.store_blob_stream(url.split("token=", 1)[1], chunks(b"abc"))
    confirmed = await service.confirm(asset.id)
    assert confirmed.status is UploadStatus.UPLOADED


async def test_get_download_returns_path_after_confirm() -> None:
    service, _ = make_service()
    asset, url = await service.create_presign("a.png", "image/png", 3, "platform")
    await service.store_blob_stream(url.split("token=", 1)[1], chunks(b"abc"))
    await service.confirm(asset.id)

    got, path = await service.get_download(asset.id)
    assert got.mime_type == "image/png"
    assert path is not None and path.endswith(asset.object_key)


async def test_get_download_rejects_unconfirmed() -> None:
    service, _ = make_service()
    asset, _ = await service.create_presign("a.png", "image/png", 3, "platform")
    with pytest.raises(ValueError):
        await service.get_download(asset.id)


async def test_archive_and_delete_organization_moves_uploaded_to_archive() -> None:
    # 조직 하드 삭제 정리: UPLOADED 는 아카이브 이동+1차 삭제+ARCHIVED, PENDING 은 메타만 삭제,
    # 다른 조직 자산은 무영향, 재호출은 멱등.
    repo = FakeUploadRepository()
    storage = FakeStorage()
    archive = FakeArchive()
    service = UploadService(repo, storage, archive, MAX)

    # org 42 의 UPLOADED 자산
    a1, url1 = await service.create_presign(
        "a.png", "image/png", 3, "groupware", "42", organization_id=42
    )
    await service.store_blob_stream(url1.split("token=", 1)[1], chunks(b"abc"))
    await service.confirm(a1.id)
    # org 42 의 PENDING 자산(업로드 미확인)
    a2, _ = await service.create_presign(
        "b.png", "image/png", 3, "groupware", "42", organization_id=42
    )
    # org 99 의 UPLOADED 자산: 무영향이어야 함
    a3, url3 = await service.create_presign(
        "c.png", "image/png", 3, "groupware", "99", organization_id=99
    )
    await service.store_blob_stream(url3.split("token=", 1)[1], chunks(b"zzz"))
    await service.confirm(a3.id)

    moved = await service.archive_and_delete_organization(42)

    assert moved == 1  # UPLOADED 1건만 아카이브 카운트
    # a1: 1차 삭제 + 아카이브 보관 + 메타 ARCHIVED(보존)
    assert not await storage.exists(a1.object_key)
    assert await archive.exists(a1.object_key)
    assert repo.saved[a1.id].status is UploadStatus.ARCHIVED
    # a2(PENDING): 메타 행 삭제
    assert a2.id not in repo.saved
    # a3(다른 조직): 무영향
    assert await storage.exists(a3.object_key)
    assert repo.saved[a3.id].status is UploadStatus.UPLOADED

    # 멱등: 재호출 시 이미 ARCHIVED 라 0건.
    assert await service.archive_and_delete_organization(42) == 0


async def test_mint_access_urls_scopes_by_organization() -> None:
    # 조직 스코프 발급: 자기 조직(42) 자산만, 다른 조직(99)은 누락. all_orgs=True 면 전부.
    repo = FakeUploadRepository()
    storage = FakeStorage()
    service = UploadService(repo, storage, FakeArchive(), MAX)

    # 선언 크기와 보내는 바이트 수를 맞춘다(짧은 본문은 커밋되지 않는다).
    a1, u1 = await service.create_presign("a.png", "image/png", 1, "groupware", "42", organization_id=42)
    await service.store_blob_stream(u1.split("token=", 1)[1], chunks(b"a"))
    await service.confirm(a1.id)
    a2, u2 = await service.create_presign("b.png", "image/png", 1, "groupware", "99", organization_id=99)
    await service.store_blob_stream(u2.split("token=", 1)[1], chunks(b"b"))
    await service.confirm(a2.id)

    scoped = await service.mint_access_urls([a1.id, a2.id], organization_id=42, all_orgs=False)
    assert a1.id in scoped and a2.id not in scoped  # 다른 조직 자산은 발급 안 됨
    assert "token=" in scoped[a1.id]

    all_out = await service.mint_access_urls([a1.id, a2.id], organization_id=None, all_orgs=True)
    assert a1.id in all_out and a2.id in all_out  # ROOT(all_orgs) 는 전부


async def test_get_download_requires_token_when_signed_enforced() -> None:
    # require_signed_download=True 면 서명 토큰(대상 id 일치) 없이는 PermissionError.
    repo = FakeUploadRepository()
    storage = FakeStorage()
    service = UploadService(repo, storage, FakeArchive(), MAX, require_signed_download=True)

    a, url = await service.create_presign("a.png", "image/png", 3, "platform")
    await service.store_blob_stream(url.split("token=", 1)[1], chunks(b"abc"))
    await service.confirm(a.id)

    with pytest.raises(PermissionError):
        await service.get_download(a.id)  # 토큰 없음 → 거부
    with pytest.raises(PermissionError):
        await service.get_download(a.id, "sig-other")  # 다른 대상 토큰 → 거부

    got, path = await service.get_download(a.id, f"sig-{a.id}")  # 올바른 서명 → 통과
    assert got.id == a.id and path is not None


async def test_get_download_internal_bypasses_signed_requirement() -> None:
    # 내부 서비스(worker) = internal=True 면 require_signed_download 여도 서명 토큰 없이 통과(원본 fetch).
    repo = FakeUploadRepository()
    storage = FakeStorage()
    service = UploadService(repo, storage, FakeArchive(), MAX, require_signed_download=True)
    a, url = await service.create_presign("a.png", "image/png", 3, "platform")
    await service.store_blob_stream(url.split("token=", 1)[1], chunks(b"abc"))
    await service.confirm(a.id)

    got, path = await service.get_download(a.id, None, internal=True)
    assert got.id == a.id and path is not None


def test_download_token_roundtrip() -> None:
    # 언어중립 다운로드 토큰(uid.exp.hmac): 서명/검증/만료/시크릿불일치/PUT토큰 교차사용 차단.
    tok = signing.sign_download("abc-123", "secret", 60)
    assert signing.verify_download(tok, "secret") == "abc-123"
    assert signing.verify_download(tok, "wrong-secret") is None
    assert signing.verify_download(signing.sign_download("x", "secret", -1), "secret") is None
    # PUT 토큰(JSON JWT)은 다운로드 검증 포맷을 통과 못 한다(교차사용 차단).
    put_tok = signing.sign({"uid": "abc-123", "key": "k"}, "secret", 60)
    assert signing.verify_download(put_tok, "secret") is None

async def test_reap_pending_deletes_only_stale_pending() -> None:
    """오래된 PENDING 만 거둔다. 진행 중(TTL 이내)과 완료된 자산은 건드리지 않는다.

    수거자가 UPLOADED 를 건드리면 참조 중인 자산이 사라진다. 참조 여부를 아는 것은 소비 서비스이고
    이 서버가 아니므로, 이 경계가 무너지면 되돌릴 방법이 없다.
    """
    repo = FakeUploadRepository()
    storage = FakeStorage()
    service = UploadService(repo, storage, FakeArchive(), MAX)
    now = datetime.now(timezone.utc)

    stale, _ = await service.create_presign("old.png", "image/png", 3, "platform")
    fresh, _ = await service.create_presign("new.png", "image/png", 3, "platform")
    done, url = await service.create_presign("done.png", "image/png", 3, "platform")
    await service.store_blob_stream(url.split("token=", 1)[1], chunks(b"abc"))
    await service.confirm(done.id)
    # 오래된 것만 과거로 밀어 둔다(생성 시각은 서비스가 now 로 채운다).
    repo.saved[stale.id].created_at = now - timedelta(hours=48)

    result = await service.reap_pending_assets(timedelta(hours=24), 500)

    assert result.deleted == 1 and result.has_more is False
    assert await repo.find_by_id(stale.id) is None       # 오래된 PENDING → 거둠
    assert await repo.find_by_id(fresh.id) is not None   # 진행 중 → 보존
    assert await repo.find_by_id(done.id) is not None    # 완료 → 보존


async def test_reap_pending_reports_more_when_batch_is_full() -> None:
    # 한 번에 limit 까지만 거둔다. 꽉 찼으면 has_more 로 알린다(개수로 역추론하게 하지 않는다).
    repo = FakeUploadRepository()
    service = UploadService(repo, FakeStorage(), FakeArchive(), MAX)
    old = datetime.now(timezone.utc) - timedelta(hours=48)
    for i in range(3):
        a, _ = await service.create_presign(f"{i}.png", "image/png", 3, "platform")
        repo.saved[a.id].created_at = old

    result = await service.reap_pending_assets(timedelta(hours=24), 2)

    assert result.deleted == 2 and result.has_more is True
    assert len(repo.saved) == 1
