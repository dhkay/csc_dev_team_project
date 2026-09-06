"""요청 상관관계 컨텍스트 (trace/request id): 서버 간 호출을 하나로 꿰는 값.

계약: docs/specs/service-http-contract.md §4.
TS 측 동일 구현: packages/net-utils/src/request-context.ts

두 개를 구분한다.
- trace_id   : 사용자 행위 1건의 끝에서 끝까지. 최초 진입점(BFF)에서 만들고 이후 홉은 그대로 전달.
- request_id : 이 홉의 HTTP 요청 1건. 홉마다 새로 만든다.

모든 요청에서 도는 코드다. `contextvars` 는 스레드로컬과 달리 await 경계를 넘어 값이 유지되고
읽기와 쓰기가 사실상 상수 시간이다. id 는 `os.urandom(8).hex()` 로 만들며, 엔트로피 풀링으로
줄이려 하지 말 것. 풀 상태 접근 비용이 이득을 넘어 더 느리고 스레드 안전하지도 않다. uuid4 는
9배 느리고 문자열도 두 배 길다(헤더 바이트). 상관관계 id 는 64비트면 충돌이 실질적으로 0이다.
실측은 bench_middleware.py 로 재현한다.
"""

from __future__ import annotations

import os
import re
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any

#: 전달 헤더 이름(소문자: ASGI 스코프의 헤더는 소문자 바이트로 온다).
TRACE_ID_HEADER = "x-trace-id"
REQUEST_ID_HEADER = "x-request-id"

#: 상관관계 id 최대 길이. 외부 값이 그대로 로그 저장소로 흘러가므로 반드시 자른다
#: (무한 길이 헤더로 로그 컬럼/메모리를 밀어내는 것을 차단).
MAX_ID_LENGTH = 64

#: 허용 문자: 영숫자/하이픈/언더스코어. 로그 인젝션(개행, 제어문자)을 원천 차단.
_ID_PATTERN = re.compile(r"\A[A-Za-z0-9_-]+\Z")


@dataclass(frozen=True, slots=True)
class RequestContext:
    """요청 1건의 상관관계 정보. 생성 후 바꾸지 않는다."""

    trace_id: str
    request_id: str
    organization_id: int | None = None
    user_id: int | None = None


_context: ContextVar[RequestContext | None] = ContextVar("csc_request_context", default=None)


# ---- id 생성 ----
_ID_BYTES = 8  # 64비트: 충돌 확률 실질적으로 0


def generate_id() -> str:
    """16자 hex 상관관계 id. 상태 없음 = 스레드 안전(위 성능 주석 참고)."""
    return os.urandom(_ID_BYTES).hex()


def sanitize_correlation_id(raw: Any) -> str | None:
    """외부에서 들어온 상관관계 id 를 정규화. 형식이 어긋나면 None(호출부가 새로 만든다)."""
    if not isinstance(raw, str):
        return None
    trimmed = raw.strip()
    if not trimmed or len(trimmed) > MAX_ID_LENGTH:
        return None
    return trimmed if _ID_PATTERN.match(trimmed) else None


def get_request_context() -> RequestContext | None:
    """현재 컨텍스트(없으면 None: 워커/크론 등 요청 밖 실행)."""
    return _context.get()


def get_trace_id() -> str | None:
    ctx = _context.get()
    return ctx.trace_id if ctx else None


def get_request_id() -> str | None:
    ctx = _context.get()
    return ctx.request_id if ctx else None


def set_request_context(context: RequestContext):  # noqa: ANN201 - contextvars Token
    """컨텍스트를 설정하고 되돌리기용 Token 을 반환한다.

    ASGI 미들웨어는 `run()` 같은 콜백 래핑 없이 set/reset 을 쓴다. 요청마다 태스크가 이미
    분리돼 있어 컨텍스트가 새지 않고, 함수 래핑 비용도 없다.
    """
    return _context.set(context)


def reset_request_context(token) -> None:  # noqa: ANN001 - contextvars Token
    _context.reset(token)


def context_from_headers(
    headers: dict[str, str],
    *,
    organization_id: int | None = None,
    user_id: int | None = None,
) -> RequestContext:
    """인바운드 헤더에서 컨텍스트를 만든다.

    trace_id 는 있으면 채택(끝에서 끝까지 유지), 없으면 생성 → 이 홉이 진입점이라는 뜻.
    request_id 는 항상 새로 만든다. 홉마다 달라야 "이 호출만" 을 집어낼 수 있다.
    """
    return RequestContext(
        trace_id=sanitize_correlation_id(headers.get(TRACE_ID_HEADER)) or generate_id(),
        request_id=generate_id(),
        organization_id=organization_id,
        user_id=user_id,
    )


def correlation_headers() -> dict[str, str]:
    """아웃바운드 요청에 실을 상관관계 헤더. 컨텍스트가 없으면 빈 dict."""
    ctx = _context.get()
    if ctx is None:
        return {}
    return {"X-Trace-Id": ctx.trace_id, "X-Request-Id": ctx.request_id}
