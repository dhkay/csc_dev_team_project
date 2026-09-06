"""도메인 에러 (conversation 도메인): 프레임워크 비종속."""

from __future__ import annotations


class AssistantDisabledError(Exception):
    """AI 어시스턴트 전역 킬스위치가 꺼짐: 플랫폼 관리자가 비활성화.

    inbound 어댑터(대화 라우터)가 사용자 메시지(SSE error)로 변환한다.
    """
