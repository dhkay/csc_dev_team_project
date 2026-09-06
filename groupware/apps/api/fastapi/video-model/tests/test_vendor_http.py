"""유료 벤더 응답 → 에러 번역. 두 가지를 잠근다: 본문 보존과 영구/일시 분류.

이 둘이 깨지면 증상이 조용하다. 본문을 잃으면 저장된 에러가 상태줄뿐이라 원인을 알 수 없고(경로가
틀렸는지, 벤더가 붐비는지, 계정이 막혔는지 구분되지 않는다), 영구 실패를 일시로 분류하면 스위퍼가
300초 간격으로 열 번을 되풀이하는 사이 화면이 한 시간 가까이 '만드는 중' 으로 남고 마지막에 원인이
"reconciliation timeout" 으로 덮인다. 실제로 두 증상이 함께 일어났다(힉스필드 503 model_disabled).
"""

from __future__ import annotations

import httpx
import pytest

from app.domains.video.adapters.outbound.processing.vendor_http import (
    ThrottledVisual,
    VendorThrottle,
    raise_for_vendor_status,
)
from app.domains.video.core.application.ports.outbound import (
    BillableVisualPort,
    ResumableVisualPort,
)
from app.domains.video.core.domain.errors import (
    PermanentRenderError,
    VendorRefusedError,
    VendorTransientError,
)
from app.domains.video.core.domain.render_failure import RenderFailure, failure_code_of
from app.domains.video.core.domain.types import VideoJobType


def _resp(status: int, body: str = "", *, json_body: object | None = None) -> httpx.Response:
    if json_body is not None:
        return httpx.Response(status, json=json_body)
    return httpx.Response(status, text=body)


class TestSuccess:
    def test_passes_through(self) -> None:
        """2xx 는 아무것도 하지 않는다."""
        raise_for_vendor_status(_resp(200, "ok"), vendor="Higgsfield")


class TestBodyPreserved:
    def test_carries_vendor_body(self) -> None:
        """본문이 메시지에 남는다. 이것이 없어서 원인을 못 봤다."""
        with pytest.raises(RuntimeError) as exc:
            raise_for_vendor_status(_resp(500, "upstream exploded"), vendor="xAI")
        assert "upstream exploded" in str(exc.value)
        assert "500" in str(exc.value)

    def test_names_the_vendor(self) -> None:
        """어느 벤더가 거절했는지 적는다(한 렌더가 여러 벤더를 부를 수 있다)."""
        with pytest.raises(RuntimeError) as exc:
            raise_for_vendor_status(_resp(500, "boom"), vendor="Higgsfield")
        assert "Higgsfield" in str(exc.value)

    def test_says_so_when_body_is_empty(self) -> None:
        """빈 본문이면 그 사실을 적는다(빈 괄호를 남기지 않는다)."""
        with pytest.raises(RuntimeError) as exc:
            raise_for_vendor_status(_resp(502), vendor="xAI")
        assert "비어 있습니다" in str(exc.value)

    def test_truncates_long_body(self) -> None:
        """긴 본문(HTML 오류 페이지 등)은 자른다. 잡의 error 컬럼과 화면에 그대로 가는 값이다."""
        with pytest.raises(RuntimeError) as exc:
            raise_for_vendor_status(_resp(500, "x" * 5000), vendor="xAI")
        assert len(str(exc.value)) < 700


class TestPermanentClassification:
    def test_4xx_is_permanent(self) -> None:
        """요청이나 계정의 문제다. 같은 요청을 열 번 보내도 같은 답이 온다."""
        with pytest.raises(VendorRefusedError):
            raise_for_vendor_status(
                _resp(403, json_body={"detail": "not_enough_credits"}), vendor="Higgsfield"
            )

    def test_5xx_is_transient(self) -> None:
        """벤더 사정이라 다시 시도할 값이 있다. 스위퍼가 재큐잉한다."""
        with pytest.raises(RuntimeError) as exc:
            raise_for_vendor_status(_resp(503, "temporarily unavailable"), vendor="Higgsfield")
        assert not isinstance(exc.value, PermanentRenderError)

    def test_5xx_with_permanent_detail_is_permanent(self) -> None:
        """상태는 나중에 오라고 하고 본문은 영원히 안 된다고 하는 경우. 본문을 믿는다.

        실측한 응답이다: 벤더가 막아 둔 모델에 503 + {"detail":"model_disabled"}.
        """
        with pytest.raises(VendorRefusedError) as exc:
            raise_for_vendor_status(
                _resp(503, json_body={"detail": "model_disabled"}), vendor="Higgsfield"
            )
        # 벤더 어휘만으로는 사용자가 무엇을 해야 할지 모른다. 설명과 원어를 함께 남긴다.
        assert "사용 중지" in str(exc.value)
        assert "model_disabled" in str(exc.value)

    def test_permanent_is_a_permanent_render_error(self) -> None:
        """워커가 즉시 FAILED 로 확정하는 근거는 이 상속 관계다."""
        with pytest.raises(PermanentRenderError):
            raise_for_vendor_status(_resp(401, "unauthorized"), vendor="xAI")

    @pytest.mark.parametrize(
        ("status", "body"),
        [
            (429, "Quota exceeded"),  # Gemini: 분당 한도와 일일 한도가 같은 본문으로 온다
            (423, "Later"),  # 힉스필드: 일시 차단, 벤더 권고가 '나중에'
            (408, "request timeout"),
        ],
    )
    def test_time_bound_4xx_is_transient(self, status: int, body: str) -> None:
        """4xx 지만 시점의 문제인 코드는 일시다.

        한도나 일시 차단을 영구로 확정하면 잠시 뒤면 될 렌더를 되돌릴 수 없게 만든다. 분당 창은
        재큐잉 간격(300초) 안에 풀리고, 일일 한도인지는 되풀이를 본 스위퍼가 따로 확정한다.
        """
        with pytest.raises(RuntimeError) as exc:
            raise_for_vendor_status(_resp(status, body), vendor="Gemini")
        assert not isinstance(exc.value, PermanentRenderError)

    def test_time_bound_status_still_loses_to_a_permanent_detail(self) -> None:
        """본문이 영구를 말하면 상태코드가 무엇이든 영구다. 두 규칙의 우선순위를 못박는다."""
        with pytest.raises(VendorRefusedError):
            raise_for_vendor_status(
                _resp(429, json_body={"detail": "not_enough_credits"}), vendor="Higgsfield"
            )


class TestDetailExtraction:
    def test_reads_nested_message(self) -> None:
        """xAI 는 사유를 한 겹 안에 담는다: {"error": {"message": ...}}."""
        with pytest.raises(RuntimeError) as exc:
            raise_for_vendor_status(
                _resp(500, json_body={"error": {"message": "model_disabled"}}), vendor="xAI"
            )
        assert "사용 중지" in str(exc.value)

    def test_unknown_detail_stays_transient(self) -> None:
        """모르는 사유는 일시로 둔다. 본문이 남으므로 다음 사람이 표에 한 줄을 더한다.

        미리 짐작해 영구로 분류하면, 실은 일시였던 실패가 재시도 없이 확정된다.
        """
        with pytest.raises(RuntimeError) as exc:
            raise_for_vendor_status(
                _resp(503, json_body={"detail": "region_congested"}), vendor="Higgsfield"
            )
        assert not isinstance(exc.value, PermanentRenderError)
        assert "region_congested" in str(exc.value)

    def test_non_json_body_is_kept(self) -> None:
        """JSON 이 아니어도 본문은 남는다(프록시가 HTML 을 돌려주는 경우)."""
        with pytest.raises(RuntimeError) as exc:
            raise_for_vendor_status(_resp(504, "<html>gateway timeout</html>"), vendor="xAI")
        assert "gateway timeout" in str(exc.value)


class TestFailureCodes:
    """예외에 실리는 사유 코드. 소비자는 문장이 아니라 이 코드로 알림을 가른다."""

    def test_throttle_is_rate_limited(self) -> None:
        with pytest.raises(RuntimeError) as exc:
            raise_for_vendor_status(_resp(429, "Quota exceeded"), vendor="Gemini")
        assert failure_code_of(exc.value) == "rate_limited"

    def test_locked_is_rate_limited_too(self) -> None:
        """힉스필드 423 도 벤더가 "나중에" 라고 한 것이라 같은 부류다."""
        with pytest.raises(RuntimeError) as exc:
            raise_for_vendor_status(_resp(423, "Later"), vendor="Higgsfield")
        assert failure_code_of(exc.value) == "rate_limited"

    def test_no_credits_is_credit_exhausted(self) -> None:
        with pytest.raises(VendorRefusedError) as exc:
            raise_for_vendor_status(
                _resp(403, json_body={"detail": "not_enough_credits"}), vendor="Higgsfield"
            )
        assert failure_code_of(exc.value) == "credit_exhausted"

    def test_other_refusals_are_vendor_refused(self) -> None:
        with pytest.raises(VendorRefusedError) as exc:
            raise_for_vendor_status(_resp(401, "unauthorized"), vendor="xAI")
        assert failure_code_of(exc.value) == "vendor_refused"

    def test_plain_5xx_has_no_code(self) -> None:
        """벤더 사정의 5xx 는 사유를 모른다. 모르는 것을 코드로 지어내지 않는다."""
        with pytest.raises(RuntimeError) as exc:
            raise_for_vendor_status(_resp(503, "temporarily unavailable"), vendor="Higgsfield")
        assert failure_code_of(exc.value) is None


class _FakeTime:
    """잠들지 않는 시계. sleep 은 기록만 하고 시각을 그만큼 앞으로 돌린다."""

    def __init__(self) -> None:
        self.now = 1_000.0
        self.slept: list[float] = []

    def clock(self) -> float:
        return self.now

    async def sleep(self, seconds: float) -> None:
        self.slept.append(seconds)
        self.now += seconds


def _throttle(t: _FakeTime, **over) -> VendorThrottle:  # noqa: ANN003
    return VendorThrottle("V", clock=t.clock, sleep=t.sleep, **over)


class TestVendorThrottle:
    """벤더 공용 한도 다루기. 어댑터 셋이 같은 객체를 쓰므로 여기서 한 번 잠근다."""

    @pytest.mark.asyncio
    async def test_paces_submits_of_the_same_key(self) -> None:
        t = _FakeTime()
        throttle = _throttle(t, submits_per_minute=2.0)  # 30초 간격

        assert await throttle.pace_submit("k") == 0.0
        assert await throttle.pace_submit("k") == 30.0
        assert await throttle.pace_submit("other") == 0.0, "다른 키는 서로 기다리지 않는다"

    @pytest.mark.asyncio
    async def test_zero_rate_means_no_pacing(self) -> None:
        t = _FakeTime()
        throttle = _throttle(t, submits_per_minute=0)

        await throttle.pace_submit("k")
        assert await throttle.pace_submit("k") == 0.0
        assert t.slept == []

    @pytest.mark.asyncio
    async def test_key_limit_overrides_the_server_default(self) -> None:
        """키에 등록된 한도가 오면 서버 기본 간격 대신 그 간격으로 벌린다."""
        t = _FakeTime()
        throttle = _throttle(t, submits_per_minute=2.0)  # 기본 30초 간격

        assert await throttle.pace_submit("k", submits_per_minute=6.0) == 0.0
        assert await throttle.pace_submit("k", submits_per_minute=6.0) == 10.0
        # 한도가 없는 호출은 기본 간격으로 돌아간다(같은 키의 마지막 제출 시각은 공유한다).
        assert await throttle.pace_submit("k") == 30.0

    @pytest.mark.asyncio
    async def test_key_limit_can_enable_pacing_where_default_has_none(self) -> None:
        """기본이 0(간격 없음)인 벤더도 키에 한도가 있으면 그 간격을 지킨다."""
        t = _FakeTime()
        throttle = _throttle(t, submits_per_minute=0)

        await throttle.pace_submit("k", submits_per_minute=4.0)
        assert await throttle.pace_submit("k", submits_per_minute=4.0) == 15.0

    @pytest.mark.asyncio
    async def test_retries_rate_limited_calls_then_returns(self) -> None:
        t = _FakeTime()
        outcomes: list[object] = [_rate_limited(), _rate_limited(), "ok"]

        assert await _throttle(t).retry_rate_limited(_scripted(outcomes), what="제출") == "ok"
        assert t.slept == [10.0, 20.0]

    @pytest.mark.asyncio
    async def test_prefers_the_vendors_retry_after(self) -> None:
        t = _FakeTime()
        outcomes: list[object] = [_rate_limited(retry_after_s=7.0), "ok"]

        await _throttle(t).retry_rate_limited(_scripted(outcomes), what="제출")
        assert t.slept == [7.0]

    @pytest.mark.asyncio
    async def test_gives_up_with_rate_limited_code(self) -> None:
        """예산(정책 기본 4회)을 다 써도 한도면 RATE_LIMITED 로 올린다. 그다음 판정은 스위퍼의 것이다."""
        t = _FakeTime()

        async def call() -> str:
            raise _rate_limited()

        with pytest.raises(RuntimeError) as exc:
            await _throttle(t).retry_rate_limited(call, what="제출")

        assert failure_code_of(exc.value) == "rate_limited"
        assert t.slept == [10.0, 20.0, 40.0, 60.0]

    @pytest.mark.asyncio
    async def test_does_not_retry_other_failures(self) -> None:
        """한도만 기다린다. 다른 실패는 재시도로 고쳐지지 않으니 첫 실패에서 올린다."""
        t = _FakeTime()

        async def call() -> str:
            raise VendorRefusedError("V가 요청을 거절했습니다(403): not_enough_credits")

        with pytest.raises(VendorRefusedError):
            await _throttle(t).retry_rate_limited(call, what="제출")
        assert t.slept == []


class TestRetryAfterHeader:
    """벤더가 말한 대기는 예외에 실려 재시도하는 쪽까지 간다."""

    def test_rate_limited_error_carries_retry_after(self) -> None:
        with pytest.raises(VendorTransientError) as exc:
            raise_for_vendor_status(
                httpx.Response(429, text="slow", headers={"Retry-After": "7"}), vendor="V"
            )
        assert exc.value.retry_after_s == 7.0

    def test_unparsable_header_is_none(self) -> None:
        """HTTP 날짜 형식은 쓰지 않는다. 그때는 표의 대기로 돌아간다."""
        with pytest.raises(VendorTransientError) as exc:
            raise_for_vendor_status(
                httpx.Response(429, text="slow", headers={"Retry-After": "Wed, 21 Oct 2026"}),
                vendor="V",
            )
        assert exc.value.retry_after_s is None


def _rate_limited(retry_after_s: float | None = None) -> VendorTransientError:
    return VendorTransientError(
        "V 요청 한도 초과(429): slow",
        failure=RenderFailure.RATE_LIMITED,
        retry_after_s=retry_after_s,
    )


def _scripted(outcomes: list[object]):  # noqa: ANN202
    """호출마다 목록의 다음 항목을 낸다. 예외면 던지고 아니면 돌려준다."""

    async def call() -> object:
        outcome = outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    return call


class _FakeInner:
    """벤더 프로토콜만 아는 어댑터 흉내. 앞 N 번의 제출은 한도에 걸린다."""

    def __init__(self, fail_submits: int = 0) -> None:
        self.fail_submits = fail_submits
        self.submits: list[dict] = []
        self.polls: list[str] = []

    def billable_seconds(self, params: dict) -> int | None:
        return 5

    async def submit(self, params: dict, source_path: str | None) -> str:
        self.submits.append(params)
        if self.fail_submits > 0:
            self.fail_submits -= 1
            raise _rate_limited()
        return "h1"

    async def poll_to_file(self, handle: str, out_dir: str, params: dict | None = None) -> str:
        self.polls.append(handle)
        return f"{out_dir}/result.mp4"


class TestThrottledVisual:
    """어댑터를 감싸 한도 다루기를 밖에서 붙인다. 어댑터는 자기가 감싸인 것을 모른다."""

    @pytest.mark.asyncio
    async def test_paces_submits_of_the_same_key_before_calling_the_adapter(self) -> None:
        t = _FakeTime()
        inner = _FakeInner()
        visual = ThrottledVisual(inner, _throttle(t, submits_per_minute=2.0))

        await visual.submit({"api_key": "k"}, None)
        await visual.submit({"api_key": "k"}, None)

        assert t.slept == [30.0]
        assert len(inner.submits) == 2

    @pytest.mark.asyncio
    async def test_key_limit_in_params_overrides_the_vendor_default(self) -> None:
        t = _FakeTime()
        visual = ThrottledVisual(_FakeInner(), _throttle(t, submits_per_minute=2.0))
        params = {"api_key": "k", "submits_per_minute": 6.0}

        await visual.submit(params, None)
        await visual.submit(params, None)

        assert t.slept == [10.0]

    @pytest.mark.asyncio
    async def test_retries_a_rate_limited_submit(self) -> None:
        t = _FakeTime()
        inner = _FakeInner(fail_submits=2)

        handle = await ThrottledVisual(inner, _throttle(t)).submit({"api_key": "k"}, None)

        assert handle == "h1"
        assert t.slept == [10.0, 20.0]
        assert len(inner.submits) == 3

    @pytest.mark.asyncio
    async def test_skips_pacing_without_a_key(self) -> None:
        """키가 없는 제출은 간격을 재지 않는다. 어댑터가 곧 CREDENTIAL_MISSING 으로 확정할 호출이다."""
        t = _FakeTime()
        visual = ThrottledVisual(_FakeInner(), _throttle(t, submits_per_minute=2.0))

        await visual.submit({}, None)
        await visual.submit({}, None)

        assert t.slept == []

    @pytest.mark.asyncio
    async def test_process_runs_submit_then_poll(self, tmp_path) -> None:
        inner = _FakeInner()
        visual = ThrottledVisual(inner, _throttle(_FakeTime()))

        result = await visual.process(VideoJobType.GENERATE, {"api_key": "k"}, None, str(tmp_path))

        assert result.path.endswith("result.mp4")
        assert inner.polls == ["h1"]

    @pytest.mark.asyncio
    async def test_process_rejects_other_job_types(self) -> None:
        with pytest.raises(ValueError):
            await ThrottledVisual(_FakeInner(), _throttle(_FakeTime())).process(
                VideoJobType.TRANSCODE, {}, None, "/tmp"
            )

    def test_exposes_the_ports_compose_checks(self) -> None:
        """compose 가 isinstance 로 재개 가능/청구 가능을 고른다. 감싸도 둘 다 보여야 한다."""
        visual = ThrottledVisual(_FakeInner(), _throttle(_FakeTime()))
        assert isinstance(visual, ResumableVisualPort)
        assert isinstance(visual, BillableVisualPort)
        assert visual.billable_seconds({}) == 5


class TestSlideshowNeedsImage:
    """씬 이미지 없이 슬라이드쇼를 부른 잡은 즉시 실패해야 한다.

    벤더 거절과 같은 부류다. 재시도가 이미지를 만들어 주지 않으므로, 일반 실패로 두면 스위퍼가
    열 번을 되풀이하는 동안 화면이 '만드는 중' 이고 원인이 마지막에 덮인다. 이 조합이 만들어지는
    경로 자체는 csc-marketing 이 막지만(씬 이미지가 없는 버전은 키 없이 렌더를 시작하지 않는다),
    이미 큐에 있던 잡과 잘못된 배선이 남으므로 여기서도 못박는다.
    """

    @pytest.mark.asyncio
    async def test_missing_image_is_permanent(self) -> None:
        from app.domains.video.adapters.outbound.processing.slideshow import (
            SlideshowProcessing,
        )
        from app.domains.video.core.domain.types import VideoJobType

        with pytest.raises(PermanentRenderError, match="씬 이미지"):
            await SlideshowProcessing().process(
                type=VideoJobType.GENERATE, params={}, source_path=None, out_dir="."
            )
