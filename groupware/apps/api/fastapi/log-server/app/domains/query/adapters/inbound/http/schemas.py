"""조회 요청/응답 Pydantic DTO."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from csc_log_contracts import LogKind, LogLevel, LogScope
from pydantic import BaseModel, Field

from ....core.domain.types import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE


class LogSearchRequest(BaseModel):
    """조회 조건 + 스코프.

    `organization_id` / `all_orgs` 는 BFF 가 세션에서 도출해 채운다. 브라우저가 고르는
    값이 아니다. `all_orgs` 는 플랫폼 ROOT 세션에서만 BFF 가 true 로 붙인다
    (file-upload `POST /uploads/access-urls` 와 동일 패턴).
    """

    organization_id: int | None = None
    all_orgs: bool = False

    kind: LogKind | None = None
    scope: LogScope | None = None
    levels: list[LogLevel] = Field(default_factory=list)
    services: list[str] = Field(default_factory=list)
    ai_tool: str | None = None
    action_prefix: str | None = None
    trace_id: str | None = None
    request_id: str | None = None
    job_id: str | None = None
    #: 행위자(조직 유저 id): "이 사람의 활동만".
    actor_id: int | None = Field(default=None, ge=1)
    #: 채널 id: 도구 안에서 활동이 일어난 채널. payload 에서 판정한다.
    channel_id: int | None = Field(default=None, ge=1)
    #: 청구액이 실제로 발생한 행만(payload.cost.micro_usd > 0). 무료/미측정은 제외된다.
    billed_only: bool = False
    search: str | None = None
    since: datetime | None = None
    until: datetime | None = None

    limit: int = Field(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE)
    #: 직전 페이지의 next_cursor 를 그대로 돌려보낸다.
    cursor_at: datetime | None = None
    cursor_id: str | None = None


class LogRecordResponse(BaseModel):
    event_id: str
    occurred_at: datetime
    ingested_at: datetime
    environment: str
    service: str
    scope: str
    ai_tool: str | None
    organization_id: int | None
    kind: str
    level: str
    action: str
    message: str
    trace_id: str | None
    request_id: str | None
    job_id: str | None
    actor_type: str | None
    actor_id: int | None
    duration_ms: int | None
    token_input: int | None
    token_output: int | None
    payload: dict[str, Any]
    extra: dict[str, Any]


class LogSearchResponse(BaseModel):
    records: list[LogRecordResponse]
    next_cursor_at: datetime | None = None
    next_cursor_id: str | None = None
    #: 필터에 맞는 전체 건수. 첫 페이지 응답에만 실린다(이어보기는 null).
    #: 호출자는 이 값을 필터별 비교에 쓰고, records 길이는 '지금 받은 만큼'으로만 읽어야 한다.
    total: int | None = None


class UsageRequest(BaseModel):
    since: datetime
    until: datetime
    organization_id: int | None = None
    all_orgs: bool = False
    ai_tool: str | None = None
    group_by_day: bool = True


class UsageBucketResponse(BaseModel):
    day: date | None
    organization_id: int | None
    ai_tool: str | None
    action: str
    calls: int
    token_input: int
    token_output: int
    p95_duration_ms: float | None


class UsageResponse(BaseModel):
    buckets: list[UsageBucketResponse]
