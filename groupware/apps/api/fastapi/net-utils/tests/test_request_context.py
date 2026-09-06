"""상관관계 컨텍스트 불변식 잠금.

여기서 지키는 건 두 가지다.
1. trace 는 이어지고 request 는 갈린다. 이게 뒤집히면 "행위 1건 전체"와 "이 호출 하나"를
   구분할 수 없어져 상관관계의 존재 이유가 사라진다.
2. 외부 입력을 그대로 믿지 않는다. trace id 는 헤더로 들어와 그대로 로그 저장소까지 흘러가므로
   길이/문자셋을 강제하지 않으면 로그 인젝션과 무한 길이 값의 통로가 된다.
"""

from __future__ import annotations

from csc_net_utils import (
    TRACE_ID_HEADER,
    RequestContext,
    get_request_context,
    get_trace_id,
)

# 내부 배관(id 생성/정규화/컨텍스트 주입)은 공개 API 가 아니라 모듈에서 직접 가져온다
# 앱 코드가 이 경로로 들어오면 안 된다는 경계를 테스트가 그대로 보여준다.
from csc_net_utils.request_context import (
    context_from_headers,
    correlation_headers,
    generate_id,
    reset_request_context,
    sanitize_correlation_id,
    set_request_context,
)


def test_id_는_16자_hex_다() -> None:
    value = generate_id()

    assert len(value) == 16
    assert all(c in "0123456789abcdef" for c in value)


def test_id_는_반복_생성해도_겹치지_않는다() -> None:
    """풀을 여러 번 리필하도록 풀 크기(512개)보다 많이 뽑는다."""
    ids = {generate_id() for _ in range(5000)}

    assert len(ids) == 5000


def test_trace_는_이어지고_request_는_새로_생긴다() -> None:
    incoming = "abc123def456"

    first = context_from_headers({TRACE_ID_HEADER: incoming})
    second = context_from_headers({TRACE_ID_HEADER: incoming})

    assert first.trace_id == incoming == second.trace_id  # 홉을 넘어도 유지
    assert first.request_id != second.request_id  # 홉마다 다름


def test_trace_가_없으면_진입점으로_보고_생성한다() -> None:
    ctx = context_from_headers({})

    assert ctx.trace_id
    assert ctx.trace_id != ctx.request_id


def test_너무_긴_trace_는_거부하고_새로_만든다() -> None:
    """무한 길이 헤더로 로그 컬럼/메모리를 밀어내는 것을 차단."""
    ctx = context_from_headers({TRACE_ID_HEADER: "a" * 500})

    assert len(ctx.trace_id) == 16


def test_제어문자가_섞인_trace_는_거부한다() -> None:
    """로그 인젝션(개행으로 가짜 로그 줄 만들기) 차단."""
    for bad in ["abc\ndef", "abc def", "abc\r\n[FAKE]", "abc;drop", "<script>"]:
        assert sanitize_correlation_id(bad) is None


def test_정상_형식은_그대로_통과한다() -> None:
    for good in ["abc123", "a-b_c", "0123456789abcdef", "A" * 64]:
        assert sanitize_correlation_id(good) == good


def test_컨텍스트가_없으면_아웃바운드_헤더도_없다() -> None:
    """워커/크론처럼 요청 밖에서 도는 코드가 가짜 헤더를 만들지 않게."""
    assert get_request_context() is None
    assert correlation_headers() == {}


def test_컨텍스트를_깔면_아웃바운드_헤더가_실린다() -> None:
    ctx = RequestContext(trace_id="t-1", request_id="r-1")
    token = set_request_context(ctx)
    try:
        assert get_trace_id() == "t-1"
        assert correlation_headers() == {"X-Trace-Id": "t-1", "X-Request-Id": "r-1"}
    finally:
        reset_request_context(token)

    assert get_request_context() is None  # reset 후 누출 없음


async def test_컨텍스트는_await_경계를_넘어_유지된다() -> None:
    """contextvars 를 쓰는 이유: 스레드로컬이면 await 후 값이 사라진다."""
    import asyncio

    ctx = RequestContext(trace_id="t-async", request_id="r-async")
    token = set_request_context(ctx)
    try:
        await asyncio.sleep(0)
        assert get_trace_id() == "t-async"
    finally:
        reset_request_context(token)


async def test_동시_태스크는_서로의_컨텍스트를_보지_않는다() -> None:
    """요청 간 컨텍스트 누출은 곧 로그가 남의 조직으로 기록되는 사고다."""
    import asyncio

    seen: dict[str, str | None] = {}

    async def handler(name: str) -> None:
        token = set_request_context(RequestContext(trace_id=name, request_id=name))
        try:
            await asyncio.sleep(0.01)
            seen[name] = get_trace_id()
        finally:
            reset_request_context(token)

    await asyncio.gather(handler("a"), handler("b"), handler("c"))

    assert seen == {"a": "a", "b": "b", "c": "c"}
