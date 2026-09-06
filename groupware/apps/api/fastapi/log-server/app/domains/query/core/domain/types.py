"""조회 도메인 타입: 필터, 스코프 요청, 페이지네이션 값 객체."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from csc_log_contracts import LogKind, LogLevel, LogScope

#: 한 페이지 최대 행 수. 조회 UI 가 무심코 수백만 행을 끌어오지 못하게 상한을 둔다.
MAX_PAGE_SIZE = 200
DEFAULT_PAGE_SIZE = 50


@dataclass(frozen=True)
class ScopeRequest:
    """호출자가 무엇을 볼 수 있는지: 인가의 입력이자 유일한 근거.

    BFF 가 세션에서 도출해 넘긴다. 신뢰 경계는 서비스토큰 계층이다
    (`.claude/rules/security-architecture.md`, language-model `app/deps.py` 와 동일 모델).

    `all_orgs` 는 플랫폼 ROOT 세션에서만 BFF 가 붙인다. file-upload 의
    `POST /uploads/access-urls` 와 같은 패턴.
    """

    organization_id: int | None = None
    all_orgs: bool = False

    @property
    def is_platform_wide(self) -> bool:
        return self.all_orgs


@dataclass(frozen=True)
class LogFilter:
    """조회 조건. 전부 선택이며 미지정은 '제한 없음'."""

    kind: LogKind | None = None
    scope: LogScope | None = None
    levels: tuple[LogLevel, ...] = ()
    services: tuple[str, ...] = ()
    ai_tool: str | None = None
    #: 조직 필터. 인가에 의해 좁혀진 최종 값만 여기 들어온다(요청 값이 아니라).
    organization_id: int | None = None
    action_prefix: str | None = None
    trace_id: str | None = None
    request_id: str | None = None
    job_id: str | None = None
    #: 행위자(조직 유저 id). "이 사람이 무엇을 했나" 조회용: 실제 컬럼이라 등호 비교로 끝난다.
    actor_id: int | None = None
    #: 채널 id. envelope 에는 채널 개념이 없어 payload 에 실려 오므로 JSON 추출로 판정한다
    #: (승격이 필요해지면 payload → 실제 컬럼으로 올릴 수 있다. 수집 매퍼가 payload 에서
    #:  승격 컬럼을 뽑는 기존 관례와 같은 경로라 프로듀서 변경이 필요 없다).
    channel_id: int | None = None
    #: 청구액이 실제로 발생한 행만. `payload.cost.micro_usd > 0` 으로 판정한다.
    #:
    #: '비용 없음'은 한 가지가 아니다. free(사내 모델이라 청구 없음), usage-missing(사용량을
    #: 못 받아 모름), rate-unknown(단가표에 없음), 그리고 cost 자체가 없는 활동(삭제 등)이
    #: 모두 여기 섞인다. 이 필터는 그 넷을 구분하지 않고 돈이 나간 행만 남긴다:
    #: "얼마 썼나"를 볼 때 필요한 구분은 그거 하나뿐이라서다.
    #: (모름/무료를 따로 보려면 status 별 필터가 필요하고, 그때는 cost 를 컬럼으로 승격할 시점이다.)
    billed_only: bool = False
    search: str | None = None  # message 부분 일치
    since: datetime | None = None
    until: datetime | None = None


@dataclass(frozen=True)
class PageRequest:
    """커서 페이지네이션.

    offset 이 아니라 커서를 쓰는 이유: 로그는 계속 쌓여서 offset 페이지네이션이
    페이지를 넘길 때마다 행을 건너뛰거나 중복시킨다.
    """

    limit: int = DEFAULT_PAGE_SIZE
    #: 직전 페이지 마지막 행의 (occurred_at, event_id). 이보다 오래된 행부터 반환.
    cursor: tuple[datetime, str] | None = None

    def normalized(self) -> PageRequest:
        capped = max(1, min(self.limit, MAX_PAGE_SIZE))
        return PageRequest(limit=capped, cursor=self.cursor)


@dataclass(frozen=True)
class UsageQuery:
    """집계 조회: 조직/도구별 사용량(호출 수, 토큰, p95 지연)."""

    since: datetime
    until: datetime
    organization_id: int | None = None
    ai_tool: str | None = None
    group_by_day: bool = True


@dataclass(frozen=True)
class LogPage:
    """조회 결과 한 페이지."""

    records: list = field(default_factory=list)
    next_cursor: tuple[datetime, str] | None = None
    #: 필터에 맞는 전체 행 수. 페이지가 아니라 조건의 성질이라 첫 페이지에만 실린다
    #: (이어보기 응답은 None). 로드된 행 수로는 "조건에 몇 건이 맞는가"를 답할 수 없어서 둔다:
    #: 페이지 크기(50)보다 원장이 크면 필터를 바꿀 때마다 목록이 1페이지로 되감겨,
    #: 화면의 건수가 필터 결과가 아니라 '더 보기'를 몇 번 눌렀는지를 반영해 버린다.
    total: int | None = None
