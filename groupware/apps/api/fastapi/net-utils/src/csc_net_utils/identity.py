"""요청 신원(Identity) 추출: BFF 가 세션에서 도출해 헤더로 넘긴 org/user.

유효 서비스토큰(ALLOWED_SERVICES 피어)과 함께 왔기에 신뢰한다. 신뢰 경계는 서비스토큰 계층이다
(FastAPI 서버는 유저 JWT 를 검증하지 않는다. `JWT_SECRET` 을 갖지도 않는다).
설계 근거: .claude/rules/security-architecture.md, .claude/rules/multi-tenancy.md

language-model 한 곳에만 있던 `get_identity` 를 두 번째 사용처가 생기는 시점에 여기로 올렸다.
각 앱은 이 `Identity` 를 자기 도메인 타입으로 매핑해 쓴다(공유 인프라 타입이 도메인에 새지 않게).
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Header, HTTPException


@dataclass(frozen=True, slots=True)
class Identity:
    """호출 주체: 조직과 유저. 값은 헤더 원문(문자열) 그대로 보존한다."""

    organization_id: str
    user_id: str


async def get_identity(
    x_organization_id: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None),
) -> Identity:
    """신원 헤더가 필수인 라우트용 의존성. 없으면 400.

    org 스코프가 선택인 라우트는 이 의존성을 쓰지 말고 `request_context.get_request_context()`
    로 힌트만 읽을 것. 그쪽은 없으면 None 이다.
    """
    if not x_organization_id or not x_user_id:
        raise HTTPException(
            status_code=400,
            detail="신원 헤더(X-Organization-Id/X-User-Id)가 필요합니다.",
        )
    return Identity(organization_id=x_organization_id, user_id=x_user_id)
