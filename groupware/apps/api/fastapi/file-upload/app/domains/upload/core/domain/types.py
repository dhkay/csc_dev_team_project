"""도메인 Enum / Type."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class UploadStatus(str, Enum):
    PENDING = "PENDING"      # presigned URL 발급됨, 아직 업로드 미확인
    UPLOADED = "UPLOADED"    # 업로드 확인 완료
    ARCHIVED = "ARCHIVED"    # 조직 하드 삭제 정리로 2차 아카이브 이동됨(1차 바이트 삭제, 메타 보존)


@dataclass(frozen=True)
class ReapResult:
    """수거 1회의 결과.

    has_more 를 함께 주는 이유: 한 번에 limit 까지만 거두므로, 그 수를 채웠다면 남은 후보가 더 있다.
    호출부(주기 잡이든 운영 호출이든)가 다시 부를지 판단할 근거가 응답 안에 있어야 한다
    (빈 결과와 "더 있음"을 개수로 역추론하게 하지 않는다).
    """

    deleted: int
    has_more: bool


class StorageArea(str, Enum):
    """스토리지 영역: 한 조직 안에서 파일이 누구의 것인지를 가르는 축.

    COMMON     조직 전원이 함께 쓰는 영역. 공개 링크를 걸 수 있는 유일한 영역이다.
    DEPARTMENT 부서별 영역. 부서 트리는 조직 관리(userdb departments)의 것을 그대로 쓴다.
    PERSONAL   본인만 보는 영역.

    이 값이 NULL 인 자산은 스토리지 화면의 것이 아니다(마케팅 씬 이미지, 영상 산출물, 아바타,
    조직 로고). 그것들은 /uploads/presign 으로 들어오고 그 경로에는 이 값을 넣을 방법이 없다.
    """

    COMMON = "COMMON"
    DEPARTMENT = "DEPARTMENT"
    PERSONAL = "PERSONAL"


class StorageSort(str, Enum):
    """목록 정렬 축. 방향은 별도(order)로 받는다."""

    NAME = "name"
    SIZE = "size"
    UPDATED = "updated"


@dataclass(frozen=True)
class StorageScope:
    """호출자가 지금 보고 있는 영역과, 그가 접근할 수 있는 범위.

    판정은 BFF 가 하고 집행은 이 서버가 한다. BFF 가 세션과 조직 디렉터리에서 도출해 보내며,
    이 서버는 부서 트리를 해석하지 않는다(팀장이 무엇인지도 모른다). 다만 서버가 자기 값으로
    아는 것(조직, 본인 user id, 대상 행의 실제 소유 컬럼)은 반드시 스스로 확인한다.

    department_ids 는 인가 집합이다. 비어 있으면 와일드카드가 아니라 거부다. 전 부서 접근을
    뜻하는 값은 can_manage_org 하나뿐이고, 그 이름이 그 자체로 의도를 말한다.
    """

    area: StorageArea
    department_id: int | None = None
    department_ids: tuple[int, ...] = ()
    can_manage_org: bool = False
    is_team_leader: bool = False


@dataclass(frozen=True)
class StorageUsage:
    """한 묶음의 사용량(바이트 합계 + 파일 수)."""

    bytes: int
    files: int


@dataclass(frozen=True)
class StorageUsageSummary:
    """스토리지 사용량 요약: 호출자가 볼 수 있는 범위 기준.

    common 은 조직 전체, department 는 인가된 부서 합, personal 은 본인 것이며 셋 다 살아 있는
    파일만 센다. 휴지통은 영역별로 따로 담는다(trash_by_area): 휴지통 화면이 영역 단위라
    합계만 주면 사이드바에 적힌 개수와 눌러서 보이는 목록이 어긋난다. 합계가 필요한 자리는
    trash_total 로 더한다.
    """

    common: StorageUsage
    department: StorageUsage
    personal: StorageUsage
    trash_by_area: dict[StorageArea, StorageUsage]

    @property
    def trash_total(self) -> StorageUsage:
        return StorageUsage(
            bytes=sum(u.bytes for u in self.trash_by_area.values()),
            files=sum(u.files for u in self.trash_by_area.values()),
        )


@dataclass(frozen=True)
class StorageListQuery:
    """목록 조회 조건: 서비스가 스코프를 검증해 만든 뒤 레포지토리에 넘긴다.

    department_ids 가 None 이면 조직 전 부서(조직 관리 권한자)를 뜻한다. 빈 튜플과 다르다.
    """

    organization_id: int
    area: StorageArea
    user_id: int
    department_ids: tuple[int, ...] | None
    trashed: bool
    search: str | None
    sort: StorageSort
    descending: bool
    limit: int
