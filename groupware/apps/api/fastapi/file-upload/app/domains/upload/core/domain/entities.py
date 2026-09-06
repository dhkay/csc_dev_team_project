"""도메인 엔티티: 순수 dataclass (ORM 무관).

업로드된 파일/에셋 1건. SQLAlchemy 모델(adapters/outbound/db/models.py)과는 별개이며
mappers.py 로만 변환한다. 여기서는 FastAPI, SQLAlchemy 를 import 하지 않는다.
이 서버는 파일 업로드/저장만 담당하며 FFmpeg/영상 처리는 하지 않는다(video-model 책임).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from .types import StorageArea, UploadStatus


@dataclass
class UploadAsset:
    id: str
    file_name: str
    mime_type: str
    size: int
    object_key: str
    status: UploadStatus
    created_at: datetime
    # 서버간 결과 저장(POST /uploads/store)의 멱등 키(=media job_id). 일반 업로드는 None.
    idempotency_key: str | None = None
    # 소유 인덱스: "조직 파일 집합"을 object_key 파싱 없이 DB 로 조회하기 위한 귀속 메타.
    # 삭제/아카이브/복구/접근통제(조직 스코프)의 기준. BFF 가 세션에서 도출해 presign 에 명시 전달.
    #   scope: "platform" | "groupware" (경로 1차 폴더와 동일 의미)
    #   organization_id: 소유 조직(테넌트) PK. platform/flat 산출물은 None 일 수 있음.
    scope: str | None = None
    organization_id: int | None = None
    # 스토리지 화면(공통/조직/개인 파일 브라우저)이 관리하는 자산에만 채워지는 값들
    # storage_area 가 None 이면 스토리지 자산이 아니다. 목록/용량/이동 어디에도 나타나지 않는다.
    #   이 제외는 관례가 아니라 경로로 갈린다. /uploads/presign 에는 이 값을 넣을 방법이 없다.
    storage_area: StorageArea | None = None
    # 부서 영역일 때의 소속 부서(userdb departments.id). 다른 영역에서는 None.
    department_id: int | None = None
    # 올린 사람(organization_users.id). 개인 영역의 접근 키이자 모든 영역의 수정 권한 기준.
    owner_user_id: int | None = None
    # 휴지통: 값이 있으면 목록에서 빠지고 휴지통 화면에만 보인다. 바이트는 그대로 남는다.
    deleted_at: datetime | None = None
    deleted_by_user_id: int | None = None
    # 이름 변경/이동/삭제 시각. 정렬은 coalesce(updated_at, created_at) 로 한다.
    updated_at: datetime | None = None

@dataclass(frozen=True)
class StorageListing:
    """스토리지 목록 한 페이지 + 조건에 걸린 전체 건수.

    전체 건수를 함께 두는 이유는 화면이 "몇 개 중 몇 개를 보고 있는지" 를 적기 때문이다.
    그 값이 없으면 더 보기 버튼을 언제 보여야 할지 알 수 없다.
    """

    assets: list[UploadAsset]
    total: int
