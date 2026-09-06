"""DTO ↔ 도메인 변환."""

from __future__ import annotations

from ....core.domain.entities import LogRecord, UsageBucket
from ....core.domain.types import (
    LogFilter,
    LogPage,
    PageRequest,
    ScopeRequest,
    UsageQuery,
)
from .schemas import (
    LogRecordResponse,
    LogSearchRequest,
    LogSearchResponse,
    UsageBucketResponse,
    UsageRequest,
    UsageResponse,
)


def to_scope(body: LogSearchRequest | UsageRequest) -> ScopeRequest:
    return ScopeRequest(organization_id=body.organization_id, all_orgs=body.all_orgs)


def to_filter(body: LogSearchRequest) -> LogFilter:
    return LogFilter(
        kind=body.kind,
        scope=body.scope,
        levels=tuple(body.levels),
        services=tuple(body.services),
        ai_tool=body.ai_tool,
        organization_id=body.organization_id,
        action_prefix=body.action_prefix,
        trace_id=body.trace_id,
        request_id=body.request_id,
        job_id=body.job_id,
        actor_id=body.actor_id,
        channel_id=body.channel_id,
        billed_only=body.billed_only,
        search=body.search,
        since=body.since,
        until=body.until,
    )


def to_page(body: LogSearchRequest) -> PageRequest:
    cursor = (
        (body.cursor_at, body.cursor_id)
        if body.cursor_at is not None and body.cursor_id
        else None
    )
    return PageRequest(limit=body.limit, cursor=cursor)


def to_usage_query(body: UsageRequest) -> UsageQuery:
    return UsageQuery(
        since=body.since,
        until=body.until,
        organization_id=body.organization_id,
        ai_tool=body.ai_tool,
        group_by_day=body.group_by_day,
    )


def to_search_response(page: LogPage) -> LogSearchResponse:
    cursor_at, cursor_id = page.next_cursor if page.next_cursor else (None, None)
    return LogSearchResponse(
        records=[_to_record_response(r) for r in page.records],
        next_cursor_at=cursor_at,
        next_cursor_id=cursor_id,
        total=page.total,
    )


def to_usage_response(buckets: list[UsageBucket]) -> UsageResponse:
    return UsageResponse(
        buckets=[
            UsageBucketResponse(
                day=b.day,
                organization_id=b.organization_id,
                ai_tool=b.ai_tool,
                action=b.action,
                calls=b.calls,
                token_input=b.token_input,
                token_output=b.token_output,
                p95_duration_ms=b.p95_duration_ms,
            )
            for b in buckets
        ]
    )


def _to_record_response(record: LogRecord) -> LogRecordResponse:
    return LogRecordResponse(
        event_id=record.event_id,
        occurred_at=record.occurred_at,
        ingested_at=record.ingested_at,
        environment=record.environment,
        service=record.service,
        scope=record.scope,
        ai_tool=record.ai_tool,
        organization_id=record.organization_id,
        kind=record.kind,
        level=record.level,
        action=record.action,
        message=record.message,
        trace_id=record.trace_id,
        request_id=record.request_id,
        job_id=record.job_id,
        actor_type=record.actor_type,
        actor_id=record.actor_id,
        duration_ms=record.duration_ms,
        token_input=record.token_input,
        token_output=record.token_output,
        payload=record.payload,
        extra=record.extra,
    )
