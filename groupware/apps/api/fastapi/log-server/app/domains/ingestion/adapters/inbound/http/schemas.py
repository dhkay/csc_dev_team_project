"""요청/응답 Pydantic DTO.

전송 필드명은 snake_case 로 고정한다. Python 계약(`csc_log_contracts.serde.to_dict`)과
TS 계약(`@csc/log-contracts` toWire)이 같은 바이트를 만들어야 하기 때문이다.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from csc_log_contracts import LogKind, LogLevel, LogScope, PrincipalType
from pydantic import BaseModel, Field

#: 한 번에 받는 최대 레코드 수. 프로듀서 클라이언트의 flush 배치(100)보다 넉넉히 크게 잡되,
#: 무한 배치로 워커 메모리를 밀어내지 못하게 상한을 둔다.
MAX_BATCH_SIZE = 500


class ActorPayload(BaseModel):
    principal_type: PrincipalType
    actor_id: int | None = None


class LogRecordRequest(BaseModel):
    """단일 로그 레코드. 필드 구성은 LogEnvelope 와 1:1."""

    kind: LogKind
    level: LogLevel
    scope: LogScope
    service: str = Field(min_length=1)
    action: str = Field(min_length=1)
    message: str = ""

    event_id: uuid.UUID | None = None
    occurred_at: datetime | None = None

    ai_tool: str | None = None
    organization_id: int | None = None

    trace_id: str | None = None
    request_id: str | None = None
    job_id: str | None = None
    actor: ActorPayload | None = None

    payload: dict[str, Any] = Field(default_factory=dict)
    duration_ms: int | None = None
    token_input: int | None = None
    token_output: int | None = None

    environment: str | None = None


class IngestRequest(BaseModel):
    records: list[LogRecordRequest] = Field(min_length=1, max_length=MAX_BATCH_SIZE)


class RejectedItem(BaseModel):
    reason: str
    detail: str


class IngestResponse(BaseModel):
    """부분 성공 영수증: 거부 건은 사유와 함께 돌려준다(조용한 유실 금지)."""

    accepted: int
    rejected: int
    errors: list[RejectedItem] = Field(default_factory=list)
