"""요청 스코프 공통 의존성: 신원(Identity) 추출.

추출 자체는 공유 패키지(`csc_net_utils.identity`)로 올라갔다(두 번째 사용처가 생긴 시점).
여기서는 공유 인프라 타입을 이 앱의 도메인 타입으로 매핑만 한다. 그래야 도메인이
공유 라이브러리 타입에 묶이지 않는다.

신뢰 경계 = 서비스토큰 계층. 상세는 csc_net_utils.identity 의 docstring 참고.
"""

from __future__ import annotations

from fastapi import Depends

from csc_net_utils import Identity, get_identity as _get_identity

from app.domains.conversation.core.domain.types import IdentityRecord


async def get_identity(identity: Identity = Depends(_get_identity)) -> IdentityRecord:
    return IdentityRecord(
        organization_id=identity.organization_id,
        user_id=identity.user_id,
    )
