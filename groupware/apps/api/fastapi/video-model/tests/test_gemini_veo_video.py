"""Gemini(Veo) 직접 호출 어댑터의 벤더 계약.

여기가 깨지면 증상이 조용하거나 비싸다. 요청 본문의 모양이 하나만 틀려도 첫 호출이 400 인데 그
400 은 잡이 워커까지 간 뒤에 나오고, 화면에는 "만들기가 취소되었습니다" 로만 보인다. 반대로
통과해 버리는 실수는 더 비싸다: 길이를 잘못 보내면 초당 과금이라 요금이 그대로 늘어난다.

그래서 문서로 확인한 것만 단정한다(2026-09-02, ai.google.dev/gemini-api/docs/veo).
"""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from app.domains.video.adapters.outbound.processing import gemini_veo_video as mod
from app.domains.video.adapters.outbound.processing.gemini_veo_video import (
    GeminiVeoVideoProcessing,
    _auth,
    _pick_duration,
    _prompt_of,
    _video_uri_of,
)
from app.domains.video.adapters.outbound.processing.vendor_http import (
    ThrottledVisual,
    VendorThrottle,
)
from app.domains.video.core.domain.errors import (
    DeadVisualHandleError,
    PermanentRenderError,
    VendorRefusedError,
)

MODEL = "veo-3.1-generate-preview"


class _FakeTime:
    """잠들지 않는 시계. sleep 은 기록만 하고 시각을 그만큼 앞으로 돌린다.

    제출 간격(30초)과 429 백오프(최대 130초)를 실제로 기다리면 테스트가 분 단위가 된다.
    """

    def __init__(self) -> None:
        self.now = 1_000.0
        self.slept: list[float] = []

    def clock(self) -> float:
        return self.now

    async def sleep(self, seconds: float) -> None:
        self.slept.append(seconds)
        self.now += seconds


def _bare(time: _FakeTime | None = None) -> GeminiVeoVideoProcessing:
    """감싸지 않은 어댑터. 벤더 프로토콜(요청 모양, 폴링 의미)만 보는 테스트가 쓴다."""
    t = time or _FakeTime()
    return GeminiVeoVideoProcessing(
        base_url="https://generativelanguage.googleapis.com",
        timeout=1.0,
        poll_interval=0.01,
        sleep=t.sleep,
    )


def _adapter(time: _FakeTime | None = None, **over) -> ThrottledVisual:  # noqa: ANN003
    """워커 레지스트리와 같은 모양: 어댑터를 ThrottledVisual 로 감싼다. `over` 는 한도 설정이다."""
    t = time or _FakeTime()
    return ThrottledVisual(_bare(t), VendorThrottle("Gemini", clock=t.clock, sleep=t.sleep, **over))


def _mock(monkeypatch, handler) -> None:
    real = httpx.AsyncClient
    monkeypatch.setattr(
        mod.httpx,
        "AsyncClient",
        lambda **kw: real(**kw, transport=httpx.MockTransport(handler)),
    )


class TestAuth:
    def test_uses_api_key_header(self) -> None:
        """API 키는 헤더로 간다. Bearer 는 OAuth 토큰용이라 API 키에 쓰면 인증되지 않는다."""
        assert _auth("k") == {"x-goog-api-key": "k"}


class TestPrompt:
    def test_uses_scene_description(self) -> None:
        assert _prompt_of({"prompt": " 제품 클로즈업 "}) == "제품 클로즈업"

    def test_falls_back_when_empty(self) -> None:
        """prompt 는 required 다. 비워 보내면 거절되므로 우리가 채운다."""
        assert _prompt_of({}) != ""
        assert _prompt_of({"prompt": "   "}) != ""

    def test_truncates_conservatively(self) -> None:
        """상한이 토큰(1,024)이라 글자 수로는 정확히 알 수 없다. 한국어는 토큰이 무거워 보수적으로 자른다."""
        assert len(_prompt_of({"prompt": "가" * 5000})) == 1500


class TestDuration:
    @pytest.mark.parametrize(
        ("wanted", "expected"),
        [(1, 4), (4, 4), (4.1, 6), (6, 6), (6.5, 8), (8, 8), (30, 8)],
    )
    def test_rounds_up_to_allowed(self, wanted: float, expected: int) -> None:
        """열거값은 4, 6, 8 뿐이다. 내리면 나레이션이 잘린 클립이 되므로 올려서 맞춘다."""
        assert _pick_duration(wanted) == expected

    def test_unparsable_takes_the_shortest(self) -> None:
        """초당 과금이라 모를 때 긴 값을 고르면 그만큼 돈이 더 나간다."""
        assert _pick_duration(None) == 4
        assert _pick_duration("잘못된값") == 4

    def test_billable_matches_what_we_send(self) -> None:
        """청구 초와 보낸 길이가 같은 식이어야 한다. 따로 계산하면 청구서와 기록이 어긋난다."""
        params = {"duration_sec": 5.0}
        assert _adapter().billable_seconds(params) == _pick_duration(params["duration_sec"])


class TestRequiredInputs:
    """배선이 끊긴 경우. 영구 실패여야 한다(재시도로 고쳐지지 않는다)."""

    @pytest.mark.asyncio
    async def test_missing_api_key_raises(self) -> None:
        with pytest.raises(PermanentRenderError, match="API 키"):
            await _adapter().submit({"model_path": MODEL}, None)

    @pytest.mark.asyncio
    async def test_missing_model_raises(self) -> None:
        """기본 모델을 두면 고르지 않은 등급으로 만들어지고, 초당 요금이 네 배까지 차이 난다."""
        with pytest.raises(PermanentRenderError, match="모델"):
            await _adapter().submit({"api_key": "k"}, None)


class TestRequestBody:
    """첫 호출을 깨뜨리는 것들을 여기서 못박는다.

    이 단정들의 출처는 벤더 문서가 아니라 실제 응답이다. 문서만 보고 짰을 때 첫 두 호출이 그대로
    400 이었다(개수 필드를 받지 않고, 길이는 문자열이 아니라 숫자였다). 문서가 다르게 적는 자리가
    있으므로, 여기 값을 문서에 맞춰 되돌리면 렌더가 다시 400 으로 죽는다.
    """

    @staticmethod
    def _capture(monkeypatch) -> dict:
        sent: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            sent["path"] = request.url.path
            sent["body"] = json.loads(request.content)
            sent["key"] = request.headers.get("x-goog-api-key")
            return httpx.Response(200, json={"name": f"models/{MODEL}/operations/op1"})

        _mock(monkeypatch, handler)
        return sent

    @pytest.mark.asyncio
    async def test_sends_the_documented_shape(self, monkeypatch) -> None:
        sent = self._capture(monkeypatch)
        handle = await _adapter().submit(
            {
                "api_key": "k",
                "model_path": MODEL,
                "prompt": "p",
                "duration_sec": 7.0,
                "aspect_ratio": "9:16",
                "resolution": "720p",
            },
            None,
        )
        assert sent["path"] == f"/v1beta/models/{MODEL}:predictLongRunning"
        assert sent["key"] == "k"
        assert sent["body"] == {
            "instances": [{"prompt": "p"}],
            "parameters": {
                "aspectRatio": "9:16",
                "resolution": "720p",
                "durationSeconds": 8,
                "personGeneration": "allow_all",
            },
        }
        # 재개 핸들은 operation 이름이다(이 값으로 재폴링해 재과금 없이 결과를 회수한다).
        assert handle == f"models/{MODEL}/operations/op1"

    @pytest.mark.asyncio
    async def test_duration_is_a_number(self, monkeypatch) -> None:
        """문자열로 보내면 400 이다("needs to be a number"). 벤더 문서는 문자열 열거라고 적는다."""
        sent = self._capture(monkeypatch)
        await _adapter().submit({"api_key": "k", "model_path": MODEL, "duration_sec": 4}, None)
        assert sent["body"]["parameters"]["durationSeconds"] == 4

    @pytest.mark.asyncio
    async def test_parameters_is_a_sibling_of_instances(self, monkeypatch) -> None:
        """instances 안에 넣으면 400 이다. 가장 흔한 첫 호출 실수라 따로 단정한다."""
        sent = self._capture(monkeypatch)
        await _adapter().submit({"api_key": "k", "model_path": MODEL}, None)
        assert "parameters" in sent["body"]
        assert "parameters" not in sent["body"]["instances"][0]

    @pytest.mark.asyncio
    async def test_omits_fields_this_model_rejects(self, monkeypatch) -> None:
        """이 모델이 거절하는 필드를 보내지 않는다.

        `numberOfVideos` 는 문서의 파라미터 표에 있는데도 거절된다(실측 400: "isn't supported by
        this model"). 한 요청이 영상 하나를 만드는 것이 고정이라 보낼 값도 없다.
        `negativePrompt` 는 공용 SDK 설정에만 있는 필드라 이 API 에서는 미지 파라미터다.
        """
        sent = self._capture(monkeypatch)
        await _adapter().submit({"api_key": "k", "model_path": MODEL, "prompt": "p"}, None)
        params = sent["body"]["parameters"]
        assert "numberOfVideos" not in params
        assert "sampleCount" not in params
        assert "negativePrompt" not in params

    @pytest.mark.asyncio
    async def test_maps_unsupported_aspect_to_vertical(self, monkeypatch) -> None:
        """Veo 는 16:9 와 9:16 만 받는다. 그 밖의 값은 세로로 근사한다(렌더 캔버스가 세로다)."""
        sent = self._capture(monkeypatch)
        await _adapter().submit(
            {"api_key": "k", "model_path": MODEL, "aspect_ratio": "4:5"}, None
        )
        assert sent["body"]["parameters"]["aspectRatio"] == "9:16"

    @pytest.mark.asyncio
    async def test_never_requests_a_resolution_the_canvas_cannot_use(self, monkeypatch) -> None:
        """480p 요청도 720p 로 보낸다. Veo 는 480p 가 없고, 1080p 는 8초를 강제하며 더 비싸다."""
        sent = self._capture(monkeypatch)
        await _adapter().submit({"api_key": "k", "model_path": MODEL, "resolution": "480p"}, None)
        assert sent["body"]["parameters"]["resolution"] == "720p"


class TestVendorRefusal:
    @pytest.mark.asyncio
    async def test_invalid_key_is_permanent(self, monkeypatch) -> None:
        """이 API 는 잘못된 키에 401 이 아니라 400 을 준다. 본문이 사유를 말한다."""
        _mock(
            monkeypatch,
            lambda request: httpx.Response(
                400,
                json={
                    "error": {
                        "code": 400,
                        "message": "API key not valid. Please pass a valid API key.",
                        "status": "INVALID_ARGUMENT",
                    }
                },
            ),
        )
        with pytest.raises(VendorRefusedError, match="API key not valid"):
            await _adapter().submit({"api_key": "bad", "model_path": MODEL}, None)

    @pytest.mark.asyncio
    async def test_quota_is_transient(self, monkeypatch) -> None:
        """429 는 시점의 문제다. 영구로 확정하면 되돌릴 수 없다. 코드는 RATE_LIMITED 로 실린다."""
        from app.domains.video.core.domain.render_failure import failure_code_of

        _mock(
            monkeypatch,
            lambda request: httpx.Response(
                429, json={"error": {"message": "Quota exceeded", "status": "RESOURCE_EXHAUSTED"}}
            ),
        )
        with pytest.raises(RuntimeError) as exc:
            await _adapter().submit({"api_key": "k", "model_path": MODEL}, None)
        assert not isinstance(exc.value, PermanentRenderError)
        assert failure_code_of(exc.value) == "rate_limited"


def _ok_submit(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json={"name": f"models/{MODEL}/operations/op1"})


class TestSubmitPacing:
    """같은 키의 제출은 간격을 두고 나간다. Google 이 프로젝트 단위로 분당 제출 수를 잰다."""

    @pytest.mark.asyncio
    async def test_second_submit_with_same_key_waits_for_the_interval(self, monkeypatch) -> None:
        _mock(monkeypatch, _ok_submit)
        t = _FakeTime()
        adapter = _adapter(t, submits_per_minute=2.0)  # 30초 간격
        params = {"api_key": "k", "model_path": MODEL}

        await adapter.submit(params, None)
        await adapter.submit(params, None)
        await adapter.submit(params, None)

        assert t.slept == [30.0, 30.0], "두 번째, 세 번째 제출이 각각 간격만큼 기다려야 한다"

    @pytest.mark.asyncio
    async def test_concurrent_submits_are_spread_out(self, monkeypatch) -> None:
        """병렬 렌더가 씬 셋을 동시에 보내도 제출은 0, 30, 60초에 하나씩 나간다."""
        _mock(monkeypatch, _ok_submit)
        t = _FakeTime()
        adapter = _adapter(t, submits_per_minute=2.0)
        params = {"api_key": "k", "model_path": MODEL}

        await asyncio.gather(*(adapter.submit(params, None) for _ in range(3)))

        assert sorted(t.slept) == [30.0, 30.0]

    @pytest.mark.asyncio
    async def test_different_keys_do_not_wait_for_each_other(self, monkeypatch) -> None:
        """다른 조직(다른 프로젝트)의 제출은 서로의 간격에 걸리지 않는다."""
        _mock(monkeypatch, _ok_submit)
        t = _FakeTime()
        adapter = _adapter(t, submits_per_minute=2.0)

        await adapter.submit({"api_key": "org-a", "model_path": MODEL}, None)
        await adapter.submit({"api_key": "org-b", "model_path": MODEL}, None)

        assert t.slept == []

    @pytest.mark.asyncio
    async def test_key_limit_in_params_overrides_the_default_interval(self, monkeypatch) -> None:
        """조직이 키와 함께 등록한 한도(params.submits_per_minute)가 서버 기본값보다 우선한다."""
        _mock(monkeypatch, _ok_submit)
        t = _FakeTime()
        adapter = _adapter(t, submits_per_minute=2.0)  # 기본 30초 간격
        params = {"api_key": "k", "model_path": MODEL, "submits_per_minute": 6.0}

        await adapter.submit(params, None)
        await adapter.submit(params, None)

        assert t.slept == [10.0]

    @pytest.mark.asyncio
    async def test_zero_rate_disables_pacing(self, monkeypatch) -> None:
        _mock(monkeypatch, _ok_submit)
        t = _FakeTime()
        adapter = _adapter(t, submits_per_minute=0)
        params = {"api_key": "k", "model_path": MODEL}

        await adapter.submit(params, None)
        await adapter.submit(params, None)

        assert t.slept == []


class TestThrottleBackoff:
    """429 는 그 자리에서 기다렸다가 다시 보낸다(문서 권고: 지수 백오프, Retry-After 우선)."""

    @staticmethod
    def _flaky(fail_times: int, headers: dict[str, str] | None = None):
        state = {"left": fail_times}

        def handler(request: httpx.Request) -> httpx.Response:
            if state["left"] > 0:
                state["left"] -= 1
                return httpx.Response(
                    429,
                    json={"error": {"message": "Quota exceeded", "status": "RESOURCE_EXHAUSTED"}},
                    headers=headers or {},
                )
            return _ok_submit(request)

        return handler

    @pytest.mark.asyncio
    async def test_retries_after_backoff_and_succeeds(self, monkeypatch) -> None:
        _mock(monkeypatch, self._flaky(fail_times=2))
        t = _FakeTime()

        name = await _adapter(t).submit({"api_key": "k", "model_path": MODEL}, None)

        assert name.endswith("op1")
        assert t.slept == [10.0, 20.0], "10초, 20초 순으로 기다린 뒤 통과했다"

    @pytest.mark.asyncio
    async def test_retry_after_header_wins_over_the_schedule(self, monkeypatch) -> None:
        _mock(monkeypatch, self._flaky(fail_times=1, headers={"Retry-After": "7"}))
        t = _FakeTime()

        await _adapter(t).submit({"api_key": "k", "model_path": MODEL}, None)

        assert t.slept == [7.0]

    @pytest.mark.asyncio
    async def test_gives_up_after_the_budget(self, monkeypatch) -> None:
        """예산을 다 써도 429 면 RATE_LIMITED 로 올린다. 그다음 판정은 스위퍼의 것이다."""
        from app.domains.video.core.domain.render_failure import failure_code_of

        _mock(monkeypatch, self._flaky(fail_times=99))
        t = _FakeTime()

        with pytest.raises(RuntimeError) as exc:
            await _adapter(t, retries=4).submit({"api_key": "k", "model_path": MODEL}, None)

        assert failure_code_of(exc.value) == "rate_limited"
        assert t.slept == [10.0, 20.0, 40.0, 60.0]

    @pytest.mark.asyncio
    async def test_polling_backs_off_too(self, monkeypatch, tmp_path) -> None:
        """폴링 GET 의 429 로 씬을 잃지 않는다. 한 번 기다린 뒤 같은 handle 을 다시 폴링한다."""
        status_calls = {"n": 0}
        video = b"\x00" * mod._MIN_VIDEO_BYTES

        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.host == "dl.example":
                return httpx.Response(200, content=video, headers={"content-type": "video/mp4"})
            status_calls["n"] += 1
            if status_calls["n"] == 1:
                return httpx.Response(429, json={"error": {"message": "slow down"}})
            return httpx.Response(
                200,
                json={
                    "done": True,
                    "response": {
                        "generateVideoResponse": {
                            "generatedSamples": [{"video": {"uri": "https://dl.example/v.mp4"}}]
                        }
                    },
                },
            )

        _mock(monkeypatch, handler)
        t = _FakeTime()

        path = await _adapter(t).poll_to_file(
            f"models/{MODEL}/operations/op1", str(tmp_path), {"api_key": "k"}
        )

        assert path.endswith("result.mp4")
        assert status_calls["n"] == 2
        assert t.slept == [10.0]


class TestCompletedWithoutVideo:
    """done 인데 영상이 없는 경우.

    안전 필터 차단은 제출의 4xx 가 아니라 완료된 operation 안에서 드러난다. 그것을 일반 실패로
    던지면 스위퍼가 같은 handle 을 열 번 재폴링하며 50분을 쓰고 답은 영원히 같다. handle 을
    버리라고 알려야 다음 시도가 새로 제출한다.
    """

    def test_operation_error_kills_the_handle(self) -> None:
        with pytest.raises(DeadVisualHandleError, match="blocked"):
            _video_uri_of({"done": True, "error": {"code": 3, "message": "blocked"}}, "op1")

    def test_empty_result_kills_the_handle(self) -> None:
        with pytest.raises(DeadVisualHandleError, match="안전 필터"):
            _video_uri_of({"done": True, "response": {"generateVideoResponse": {}}}, "op1")

    def test_reads_the_documented_path(self) -> None:
        """REST 응답의 자리는 SDK 와 다르다(generatedSamples vs generated_videos). 섞으면 못 찾는다."""
        uri = _video_uri_of(
            {
                "done": True,
                "response": {
                    "generateVideoResponse": {
                        "generatedSamples": [{"video": {"uri": "https://x/files/1:download"}}]
                    }
                },
            },
            "op1",
        )
        assert uri == "https://x/files/1:download"


class TestPolling:
    @pytest.mark.asyncio
    async def test_missing_done_means_not_done(self) -> None:
        """진행 중에는 done 이 false 가 아니라 아예 없을 수 있다. 없음을 완료로 읽으면 결과 없이 죽는다."""
        calls = {"n": 0}

        def handler(request: httpx.Request) -> httpx.Response:
            calls["n"] += 1
            if calls["n"] == 1:
                return httpx.Response(200, json={"name": "op1"})  # done 없음
            return httpx.Response(
                200,
                json={
                    "done": True,
                    "response": {
                        "generateVideoResponse": {
                            "generatedSamples": [{"video": {"uri": "https://x/v.mp4"}}]
                        }
                    },
                },
            )

        adapter = _bare()
        async with httpx.AsyncClient(
            base_url="https://generativelanguage.googleapis.com",
            transport=httpx.MockTransport(handler),
        ) as client:
            uri = await adapter._await_done(client, "models/x/operations/op1", "k")
        assert uri == "https://x/v.mp4"
        assert calls["n"] == 2  # 첫 응답을 완료로 읽지 않았다

    @pytest.mark.asyncio
    async def test_polls_the_operation_name_without_reprefixing(self) -> None:
        """operation 이름에 'models/...' 가 이미 들어 있다. 접두사를 다시 붙이면 404 가 된다."""
        seen: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen["path"] = request.url.path
            return httpx.Response(
                200,
                json={
                    "done": True,
                    "response": {
                        "generateVideoResponse": {
                            "generatedSamples": [{"video": {"uri": "https://x/v.mp4"}}]
                        }
                    },
                },
            )

        async with httpx.AsyncClient(
            base_url="https://generativelanguage.googleapis.com",
            transport=httpx.MockTransport(handler),
        ) as client:
            await _bare()._await_done(client, f"models/{MODEL}/operations/op1", "k")
        assert seen["path"] == f"/v1beta/models/{MODEL}/operations/op1"
