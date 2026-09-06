"""스토리지 인가 규칙(순수 함수).

서비스에서 떼어 둔 이유는 곧 서비스가 여럿이 되기 때문이다. 폴더(2단계)와 공유(3단계)가 들어오면
각자 서비스를 갖게 되는데, 그때도 "이 스코프가 유효한가", "이 행이 그 스코프의 것인가",
"이 사람이 손댈 수 있는가" 는 한 벌이어야 한다. 상속으로 나누면 세 곳에서 조금씩 달라지고,
그 어긋남은 남의 부서 파일이 보이는 형태로만 드러난다.

여기 있는 것은 전부 순수 함수다. DB 도 스토리지도 모른다.
"""

from __future__ import annotations

from ..domain.entities import UploadAsset
from ..domain.types import StorageArea, StorageScope


def assert_scope(scope: StorageScope) -> None:
    """스코프 자체의 정합성. 여기서 막지 못하면 그 뒤 조회가 조용히 넓어진다.

    비어 있는 인가 집합은 와일드카드가 아니라 거부다. 전 부서를 뜻하는 값은 can_manage_org
    하나뿐이고, 그 이름이 그 자체로 의도를 말한다.
    """
    if scope.area is not StorageArea.DEPARTMENT:
        return
    if scope.department_id is None:
        raise ValueError("department scope requires a department id")
    if scope.can_manage_org:
        return
    if not scope.department_ids:
        raise PermissionError("no accessible department")
    if scope.department_id not in scope.department_ids:
        raise PermissionError("department out of scope")


def _accessible_department_ids(scope: StorageScope) -> tuple[int, ...] | None:
    """인가된 부서 집합. None 은 전 부서(조직 관리 권한자)를 뜻하며 빈 튜플과 다르다."""
    return None if scope.can_manage_org else tuple(scope.department_ids)


def assert_in_scope(
    asset: UploadAsset,
    organization_id: int,
    user_id: int,
    scope: StorageScope,
) -> None:
    """대상 행이 정말 그 스코프의 것인지 교차 확인한다.

    스코프 밖 대상은 403 이 아니라 404 로 답한다(LookupError). 403 은 남의 부서에 그 파일이
    있다는 사실을 알려 주는 오라클이 된다.

    조직과 본인 id 는 서버가 신원 헤더로 아는 값이라, 스코프를 부풀려 보내도 이 두 경계는 넘지 못한다.
    """
    if (
        asset.organization_id != organization_id
        or asset.storage_area is None
        or asset.storage_area is not scope.area
    ):
        raise LookupError("storage item not found")
    if asset.storage_area is StorageArea.PERSONAL:
        if asset.owner_user_id != user_id:
            raise LookupError("storage item not found")
        return
    if asset.storage_area is StorageArea.DEPARTMENT:
        allowed = _accessible_department_ids(scope)
        if allowed is not None and asset.department_id not in allowed:
            raise LookupError("storage item not found")


def assert_can_modify(asset: UploadAsset, user_id: int, scope: StorageScope) -> None:
    """이름 변경과 삭제의 주체 제한.

    공통과 부서는 전원이 올릴 수 있는 공간이라, 아무나 남의 파일을 지울 수 있으면 사고가 된다.
    올린 사람 본인, 그 부서 팀장, 조직 관리 권한자만 손댈 수 있다.
    """
    if asset.owner_user_id == user_id or scope.can_manage_org:
        return
    if scope.area is StorageArea.DEPARTMENT and scope.is_team_leader:
        return
    raise PermissionError("not allowed to modify this item")


def assert_can_restore(asset: UploadAsset, user_id: int, scope: StorageScope) -> None:
    """복원과 영구 삭제의 주체 제한: 지운 사람, 올린 사람, 그 부서 팀장, 조직 관리 권한자."""
    if (
        asset.deleted_by_user_id == user_id
        or asset.owner_user_id == user_id
        or scope.can_manage_org
    ):
        return
    if scope.area is StorageArea.DEPARTMENT and scope.is_team_leader:
        return
    raise PermissionError("not allowed to modify this item")
