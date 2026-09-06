"""유료 벤더 HTTP 를 다루는 공용 조각 둘: 응답을 에러로 번역하기, 한도(429)를 다루기.

## 응답 번역 (`raise_for_vendor_status`)

`resp.raise_for_status()` 대신 이걸 쓴다. 그것은 응답 본문을 버린다. 남는 메시지는 상태줄과 URL 뿐이고,
그것이 잡의 `error` 로 저장돼 사용자 화면까지 간다. 벤더는 대개 왜 거절했는지를 본문 한 줄로 알려 주는데
그 한 줄이 사라진다.

분류를 틀리면 값이 크다. 워커는 `PermanentRenderError` 를 즉시 FAILED 로 확정하고, 그 밖의
실패는 스위퍼가 최대 10번 재큐잉한다(간격 300초). 그 예산은 '워커가 죽어서 못 끝냈다' 를 위한
것이다. 벤더가 모델을 막아 뒀거나 크레딧이 없어 거절한 요청은 열 번을 돌려도 같은 답을 받으므로,
그 사이 화면은 한 시간 가까이 '만드는 중' 이고 원인은 마지막에 "reconciliation timeout" 으로 덮인다.

기준은 상태 코드다. 4xx = 영구(요청이나 계정의 문제), 5xx = 일시(벤더 사정). 양쪽으로 예외가 있다.
  - 5xx 인데 본문이 영구를 말한다(힉스필드 `{"detail":"model_disabled"}`). 상태는 나중에 오라고
    하고 본문은 영원히 안 된다고 한다. 그래서 본문도 함께 본다.
  - 4xx 인데 벤더가 스스로 "나중에" 라고 한다(`_TRANSIENT_STATUSES`). 한도(429)나 일시 차단(423)은
    요청의 잘못이 아니라 시점의 문제다. 재큐잉 간격(300초)이 분당 창보다 길어 재시도가 통과한다.
    다만 Gemini 는 분당 한도와 일일 한도를 같은 429 본문으로 답하므로(details 없음), 여기서는
    RATE_LIMITED 코드만 싣고 일일 한도 판정은 재큐잉 뒤에도 되풀이되는지를 보는 스위퍼가 한다.

`_PERMANENT_DETAILS` 는 실제로 받아 본 것만 담는다. 벤더 문자열을 미리 모아 두면 곧 벤더가
바꾸고, 그때 표에 없는 사유는 조용히 일시로 분류된다. 모르는 사유는 본문을 그대로 실어 일시로
두는 것이 낫다. 재큐잉은 시간을 쓰지만 본문이 남으므로 다음 사람이 이 표에 한 줄을 더한다.

## 한도 다루기 (`VendorThrottle`, `ThrottledVisual`)

벤더는 프로젝트(키) 단위로 분당 제출 수를 잰다. 병렬 렌더가 씬 셋을 같은 순간에 보내면 그 자체로
한도를 넘는다(Gemini Veo 프리뷰의 Tier 1 사례가 분당 2회). 폴링은 세지 않는 것을 확인했다.
어댑터는 벤더 프로토콜만 알고, 한도는 레지스트리가 어댑터를 `ThrottledVisual` 로 감싸며 밖에서 붙인다.
  1. 제출 간격 조절(`pace_submit`): 같은 키의 제출을 최소 간격으로 벌린다. 씬 셋이 동시에 도착해도
     제출은 간격을 두고 나가고 생성은 겹쳐서 돈다. 간격은 키에 등록된 한도가 있으면 그것, 없으면
     벤더 기본값(설정)이다.
  2. 429 재시도(`retry_rate_limited`): 제출과 폴링이 RATE_LIMITED 로 실패하면 정책(`RetryPolicy`)의
     백오프 뒤 같은 호출을 다시 한다(벤더 문서 권고: 지수 백오프, `Retry-After` 우선). 다 써도 429 면
     그대로 올려 스위퍼가 판정한다.
시계와 sleep 을 주입받는 이유는 테스트가 30초를 실제로 기다리지 않게 하기 위함이다.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

import httpx

from ....core.domain.errors import VendorRefusedError, VendorTransientError
from ....core.domain.render_failure import RenderFailure
from ....core.domain.retry_policy import RENDER_RETRY_POLICY, RetryPolicy
from ....core.domain.types import ProcessedResult, VideoJobType

logger = logging.getLogger(__name__)

_T = TypeVar("_T")

# 5xx 로 오지만 재시도가 무의미한 사유(실측한 것만). 값은 (사용자가 읽을 설명, 실패 사유 코드):
#   'model_disabled' 같은 벤더 어휘는 화면에 그대로 뜨면 아무것도 알려 주지 않는다.
_PERMANENT_DETAILS: dict[str, tuple[str, RenderFailure]] = {
    "model_disabled": ("이 모델이 벤더에서 사용 중지된 상태입니다", RenderFailure.VENDOR_REFUSED),
    "model_not_found": ("벤더에 이 모델 경로가 없습니다", RenderFailure.VENDOR_REFUSED),
    "not_enough_credits": ("벤더 크레딧이 부족합니다", RenderFailure.CREDIT_EXHAUSTED),
}

# 4xx 지만 시점의 문제라 재시도가 통과할 수 있는 코드. 벤더가 스스로 "나중에" 라고 말하는 것들만.
#   408 요청 타임아웃 / 423 일시 차단(힉스필드) / 429 한도 초과.
_TRANSIENT_STATUSES = frozenset({408, 423, 429})
# 그중 한도에 걸린 것. 코드를 실어야 스위퍼가 되풀이를 보고 일일 한도로 확정할 수 있다.
_THROTTLE_STATUSES = frozenset({423, 429})

# 본문에서 사유가 담기는 자리(벤더마다 다르다). 힉스필드는 detail, xAI 는 error.message.
_DETAIL_KEYS = ("detail", "message", "error")

_MAX_BODY = 500


def raise_for_vendor_status(resp: httpx.Response, *, vendor: str) -> None:
    """벤더 응답이 실패면 본문을 실은 예외를 던진다. 성공(2xx)이면 아무것도 하지 않는다.

    영구 실패는 `VendorRefusedError`(= PermanentRenderError)로, 일시 실패는 `VendorTransientError`
    로 던진다. 받는 쪽은 이 구분을 다시 하지 않는다.
    """
    if not resp.is_error:
        return

    detail = _detail_of(resp)
    body = _body_of(resp)
    known = _PERMANENT_DETAILS.get(detail or "")
    transient_status = resp.status_code in _TRANSIENT_STATUSES
    # 본문이 영구를 말하면(known) 상태코드가 무엇이든 영구다. 그 외에는 상태코드가 정한다.
    permanent = known is not None or (resp.status_code < 500 and not transient_status)

    # 사람이 읽는 부분(known)이 있으면 그걸 앞에, 없으면 본문이 곧 설명이다. 본문은 어느 경우든
    #   남긴다: 우리가 요약한 문장이 틀렸을 때 원본이 없으면 다시 추적할 수 없다.
    reason = f"{known[0]} ({detail})" if known else body

    if permanent:
        raise VendorRefusedError(
            f"{vendor}가 요청을 거절했습니다({resp.status_code}): {reason}",
            failure=known[1] if known else RenderFailure.VENDOR_REFUSED,
        )
    if resp.status_code in _THROTTLE_STATUSES:
        # 벤더가 말한 대기(Retry-After)가 있으면 실어 보낸다. 재시도하는 쪽이 백오프 표보다 그 값을 우선한다.
        raise VendorTransientError(
            f"{vendor} 요청 한도 초과({resp.status_code}): {reason}",
            failure=RenderFailure.RATE_LIMITED,
            retry_after_s=_retry_after_s(resp),
        )
    raise VendorTransientError(f"{vendor} 호출이 실패했습니다({resp.status_code}): {reason}")


class VendorThrottle:
    """벤더 하나의 한도 다루기: 키별 제출 간격 조절 + 429 재시도. 벤더마다 하나 두고 `ThrottledVisual` 이 쓴다.

    `submits_per_minute` 이 0 이면 그 벤더의 기본 간격 조절을 하지 않는다(한도를 모르는 벤더의 기본).
    키에 등록된 한도가 오면 그것이 우선하고, 429 재시도는 어느 경우든 동작한다.
    """

    def __init__(
        self,
        vendor: str,
        *,
        submits_per_minute: float = 0.0,
        retries: int | None = None,
        policy: RetryPolicy = RENDER_RETRY_POLICY,
        clock: Callable[[], float] | None = None,
        sleep: Callable[[float], Awaitable[None]] | None = None,
    ) -> None:
        self.vendor = vendor
        self._interval = 60.0 / submits_per_minute if submits_per_minute > 0 else 0.0
        self._policy = policy
        self._retries = policy.rate_limit_retries if retries is None else max(0, retries)
        self._clock = clock
        self._sleep = sleep
        # 키마다 락을 둔다. 락 안에서 마지막 제출 시각을 읽고 기다리고 갱신하므로, 씬 셋이 동시에
        #   도착해도 0초, 간격, 2배 간격에 하나씩 나간다. 다른 키(다른 조직)는 서로 기다리지 않는다.
        self._locks: dict[str, asyncio.Lock] = {}
        self._last_submit: dict[str, float] = {}

    async def sleep(self, seconds: float) -> None:
        """이 객체의 모든 대기가 이 문을 지난다. 주입된 sleep 이 없으면 asyncio 의 것을 호출 시점에 찾는다."""
        await (self._sleep or asyncio.sleep)(seconds)

    async def pace_submit(
        self, api_key: str, *, submits_per_minute: float | None = None
    ) -> float:
        """이 키의 제출 차례가 올 때까지 기다린다. 실제로 기다린 초를 돌려준다(로그와 테스트용).

        `submits_per_minute` 는 그 키에 등록된 한도다. 있으면 벤더 기본값 대신 그 간격을 쓴다.
        벤더가 한도를 재는 단위가 키의 프로젝트라, 조직마다 다른 티어를 하나의 설정으로는 맞출 수 없다.
        """
        interval = self._interval
        if submits_per_minute:
            interval = 60.0 / float(submits_per_minute)
        if interval <= 0:
            return 0.0
        key_id = _key_id(api_key)
        lock = self._locks.setdefault(key_id, asyncio.Lock())
        async with lock:
            last = self._last_submit.get(key_id)
            wait = 0.0 if last is None else max(0.0, last + interval - self._now())
            if wait > 0:
                logger.info("%s 제출 간격 조절: %.0f초 기다린 뒤 보낸다", self.vendor, wait)
                await self.sleep(wait)
            self._last_submit[key_id] = self._now()
            return wait

    async def retry_rate_limited(
        self, call: Callable[[], Awaitable[_T]], *, what: str
    ) -> _T:
        """호출이 RATE_LIMITED 로 실패하면 백오프 뒤 다시 한다. 다른 실패는 그대로 올린다.

        재시도 예산을 다 쓴 429 도 그대로 올라가 RATE_LIMITED 코드가 실린다: 그다음 판정(분당 창인가
        일일 한도인가)은 재큐잉 뒤 되풀이 여부를 보는 스위퍼의 것이다.
        """
        for attempt in range(self._retries):
            try:
                return await call()
            except VendorTransientError as exc:
                if exc.failure is not RenderFailure.RATE_LIMITED:
                    raise
                delay = self._policy.backoff_delay(attempt, exc.retry_after_s)
                logger.warning(
                    "%s 한도(%s): %.0f초 뒤 다시 보낸다(%d/%d)",
                    self.vendor, what, delay, attempt + 1, self._retries,
                )
                await self.sleep(delay)
        # 마지막 시도. 여기서의 429 는 예산을 다 쓴 것이라 그대로 올라간다.
        return await call()

    def _now(self) -> float:
        return (self._clock or asyncio.get_running_loop().time)()


class ThrottledVisual:
    """외부 유료 벤더 어댑터를 감싸 한도 다루기를 밖에서 붙인다. 어댑터에는 벤더 프로토콜만 남는다.

    submit 앞에서 같은 키의 제출 간격을 벌리고, submit 과 poll_to_file 이 RATE_LIMITED 로 실패하면
    백오프 뒤 같은 호출을 다시 한다. 다시 불러도 안전한 이유: 429 를 받은 제출은 벤더가 아무것도
    만들지 않았고, 폴링은 handle 기준이라 멱등이다.

    ResumableVisualPort 와 BillableVisualPort 를 그대로 내보낸다(외부 유료 벤더는 둘 다 구현한다).
    compose 가 isinstance 로 고르는데 3.12 의 runtime_checkable 검사는 __getattr__ 위임을 보지
    않으므로 메서드를 직접 둔다.
    """

    def __init__(self, inner: Any, throttle: VendorThrottle) -> None:
        self._inner = inner
        self._throttle = throttle

    async def process(
        self,
        type: VideoJobType,
        params: dict[str, Any],
        source_path: str | None,
        out_dir: str,
    ) -> ProcessedResult:
        # 원샷(직접 GENERATE): 제출+폴링을 이어서. COMPOSE 는 submit/poll 을 나눠 재개한다.
        if type != VideoJobType.GENERATE:
            raise ValueError(f"{self._throttle.vendor} 어댑터는 GENERATE 잡만 처리합니다")
        handle = await self.submit(params, source_path)
        out_path = await self.poll_to_file(handle, out_dir, params)
        return ProcessedResult(
            path=out_path, file_name=params.get("file_name", "generated.mp4"), mime_type="video/mp4"
        )

    def billable_seconds(self, params: dict[str, Any]) -> int | None:
        return self._inner.billable_seconds(params)

    async def submit(self, params: dict[str, Any], source_path: str | None) -> str:
        api_key = str(params.get("api_key") or "").strip()
        # 키가 없으면 간격을 재지 않는다. 어댑터가 곧 CREDENTIAL_MISSING 으로 확정한다.
        if api_key:
            await self._throttle.pace_submit(
                api_key, submits_per_minute=params.get("submits_per_minute")
            )
        return await self._throttle.retry_rate_limited(
            lambda: self._inner.submit(params, source_path), what="제출"
        )

    async def poll_to_file(
        self, handle: str, out_dir: str, params: dict[str, Any] | None = None
    ) -> str:
        return await self._throttle.retry_rate_limited(
            lambda: self._inner.poll_to_file(handle, out_dir, params), what="폴링"
        )


def _key_id(api_key: str) -> str:
    """제출 간격 조절의 키. 평문 키를 딕셔너리 키로 들고 있지 않으려고 해시를 쓴다."""
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()[:16]


def _retry_after_s(resp: httpx.Response) -> float | None:
    """`Retry-After` 헤더(초). 없거나 양의 초 단위 숫자가 아니면 None(HTTP 날짜 형식은 쓰지 않는다).

    상한은 걸지 않는다. 그것은 재시도하는 쪽의 정책(RetryPolicy.max_retry_after_s)이다.
    """
    raw = resp.headers.get("retry-after")
    if not raw:
        return None
    try:
        seconds = float(raw)
    except ValueError:
        return None
    return seconds if seconds > 0 else None


def _detail_of(resp: httpx.Response) -> str | None:
    """본문에서 사유 문자열 하나를 뽑는다. JSON 이 아니거나 자리가 없으면 None."""
    try:
        data: Any = resp.json()
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    for key in _DETAIL_KEYS:
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        # xAI 처럼 한 겹 더 들어간 형태: {"error": {"message": "..."}}
        if isinstance(value, dict):
            nested = value.get("message")
            if isinstance(nested, str) and nested.strip():
                return nested.strip()
    return None


def _body_of(resp: httpx.Response) -> str:
    """에러 메시지에 실을 본문. 길면 자르고, 비어 있으면 그 사실을 적는다(빈 괄호를 남기지 않는다)."""
    try:
        text = resp.text.strip()
    except Exception:  # noqa: BLE001 - 디코딩 실패도 메시지를 못 만들 이유는 아니다.
        text = ""
    if not text:
        return "응답 본문이 비어 있습니다"
    return text[:_MAX_BODY].replace("\n", " ")
