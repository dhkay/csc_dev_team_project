"""로그 엔벨로프의 닫힌 집합 타입: kind/level/scope/도구 key.

TS 측 동일 구현: packages/log-contracts (@csc/log-contracts).
두 목록이 어긋나면 `scripts/check-log-contracts.mjs` 가 CI 에서 실패시킨다.
"""

from __future__ import annotations

from enum import Enum


class LogKind(str, Enum):
    """로그 종류: 토픽/테이블 분리 축.

    종류마다 스키마, 보존기간, 볼륨이 근본적으로 달라서 이 축으로만 물리 분리한다.
    조직/AI도구는 카디널리티가 높아 토픽이 아니라 컬럼으로 간다.
    """

    EVENT = "EVENT"    # 도메인 이벤트: 잡 생명주기, LLM 호출, 크롤 결과
    ERROR = "ERROR"    # 에러/예외: 스택 포함
    AUDIT = "AUDIT"    # 감사: 누가 무엇을 언제 변경했나 (보존 무기한)
    ACCESS = "ACCESS"  # HTTP 접근: 볼륨 최대, 샘플링 대상


class LogLevel(str, Enum):
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARN = "WARN"
    ERROR = "ERROR"
    FATAL = "FATAL"


class LogScope(str, Enum):
    """이 로그가 누구의 것인가: 인가와 격리의 기준.

    kind(종류)와 직교한다. 예: 조직 감사 로그 = scope=ORGANIZATION + kind=AUDIT.
    """

    PLATFORM = "PLATFORM"          # 조직 무관: 부팅, 마이그레이션, 크론, 플랫폼 감사
    ORGANIZATION = "ORGANIZATION"  # 특정 조직: organization_id 필수
    AI_TOOL = "AI_TOOL"            # 특정 AI 도구: ai_tool 필수


class AiToolKey(str, Enum):
    """AI 도구 key: @csc/entitlements 의 AiToolKey 를 미러링한다.

    SSOT 는 TS 쪽(packages/entitlements)이다. Python 에는 대응 패키지가 없어 문자열을 복제하며,
    두 목록의 일치는 CI 스크립트가 강제한다. 도구 추가 시 양쪽을 함께 고칠 것.

    주의: AI 어시스턴트(챗봇)는 AI 도구가 아니라 전역 기본 제공 기능이라 여기 없다.
    챗봇 트래픽은 ai_tool 을 비우고 service='language-model' + action='chat.*' 로 식별한다.
    """

    MARKETING_VIDEO = "marketing-video"


class PrincipalType(str, Enum):
    """감사 로그 주체의 종류: user 서버 토큰 클레임 principalType 과 같은 어휘."""

    ADMIN_USER = "ADMIN_USER"                # 벤더 운영자 (admin_users)
    ORGANIZATION_USER = "ORGANIZATION_USER"  # 조직 유저 (organization_users)
    SERVICE = "SERVICE"                      # 서비스 자신 (크론, 마이그레이션 등 무인 주체)


def to_ai_tool_key(value: str | None) -> AiToolKey | None:
    """미지 값을 걸러내는 닫힌 집합 가드: TS 의 toAiToolKeys 와 동형.

    카탈로그에서 사라진 도구 key 가 오래된 프로듀서에서 흘러들어와도 여기서 제거된다.
    """
    if not value:
        return None
    try:
        return AiToolKey(value)
    except ValueError:
        return None
