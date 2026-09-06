"""Pydantic 요청/응답 DTO."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from ....core.domain.types import UploadStatus


class CreatePresignRequest(BaseModel):
    file_name: str = Field(min_length=1)
    mime_type: str = Field(min_length=1)
    size: int = Field(gt=0)
    # 저장 위치 폴더(앱별 분리). BFF 가 주입(브라우저 비선택).
    #   platform           -> platform/{uuid}
    #   groupware + partition -> groupware/{orgId}/{uuid}
    scope: str = Field(min_length=1)
    # 하위 폴더(그룹웨어 조직 식별자 등). 그룹웨어는 필수, 플랫폼은 미사용.
    # 반드시 불변 orgId 를 쓴다(조직명/slug 는 가변 → 경로에 쓰면 rename 시 파일 고아).
    partition: str | None = None
    # 소유 인덱스(경로와 별개로 컬럼 귀속): BFF 가 세션에서 도출해 전달. 조직 파일 집합 조회의 기준.
    organization_id: int | None = None


class PresignResponse(BaseModel):
    upload_id: str
    object_key: str
    presigned_url: str


class UploadAssetResponse(BaseModel):
    id: str
    file_name: str
    mime_type: str
    size: int
    object_key: str
    status: UploadStatus
    created_at: datetime
    # 브라우저가 파일을 GET 할 접근 URL(공인 IP 제한). confirm 응답에 채워진다.
    access_url: str


class ReapPendingResponse(BaseModel):
    """수거 결과: 거둔 건수 + 남은 후보 유무."""

    deleted: int
    has_more: bool


class AssetStatusRequest(BaseModel):
    # 상태를 확인할 에셋 id 목록(렌더 등록 전 사전검증 배치).
    ids: list[str] = Field(min_length=1)


class AssetStatusItem(BaseModel):
    id: str
    status: UploadStatus


class AccessUrlsRequest(BaseModel):
    # 서명 접근 URL 을 발급할 에셋 id 목록(렌더 시 BFF 가 요청).
    ids: list[str] = Field(min_length=1)
    # 요청 주체의 조직: 이 조직 소유 자산만 발급(테넌트 격리). BFF 가 세션에서 도출해 주입.
    organization_id: int | None = None
    # 플랫폼 ROOT 여부: true 면 조직 무관 전체 발급(control-tower ROOT 세션에서만 set).
    all_orgs: bool = False


class AccessUrlsResponse(BaseModel):
    # { uploadId: 서명 접근 URL }: 권한 밖/미존재 id 는 누락.
    urls: dict[str, str]
