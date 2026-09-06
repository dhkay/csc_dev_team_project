"""Higgsfield 중계 영상 어댑터의 벤더 계약.

여기가 깨지면 증상이 조용하다. 고른 것과 다른 모델로 만들어지거나(모델 경로 누락), 모든 씬이 같은
영상이 되거나(프롬프트 누락), 청구 초와 실제 요청 길이가 어긋난다. 셋 다 결과물이나 청구서에서만
드러난다.
"""

from __future__ import annotations

import httpx
import pytest

from app.domains.video.adapters.outbound.processing import higgsfield_video as mod
from app.domains.video.adapters.outbound.processing.higgsfield_video import (
    HiggsfieldVideoProcessing,
    _auth,
    _pick_duration,
    _prompt_of,
)
from app.domains.video.core.domain.errors import PermanentRenderError, VendorRefusedError


def _adapter() -> HiggsfieldVideoProcessing:
    return HiggsfieldVideoProcessing(base_url="https://platform.higgsfield.ai", timeout=1.0)


class TestAuth:
    def test_uses_key_scheme(self) -> None:
        """벤더는 Bearer 가 아니라 `Key {id}:{secret}` 을 쓴다."""
        assert _auth("id:secret") == {"Authorization": "Key id:secret"}


class TestPrompt:
    def test_uses_scene_description(self) -> None:
        """씬 화면 묘사가 그대로 프롬프트가 된다(텍스트→영상은 이 문장이 화면을 만든다)."""
        assert _prompt_of({"prompt": "  a red car on a bridge  "}) == "a red car on a bridge"

    def test_falls_back_when_empty(self) -> None:
        """비면 폴백한다. 벤더 스키마가 prompt 를 required 로 두어 빈 값은 422 다."""
        assert _prompt_of({}) != ""
        assert _prompt_of({"prompt": "   "}) != ""

    def test_truncates_to_vendor_limit(self) -> None:
        """상한(2500)을 넘기면 400 이라 우리가 먼저 자른다."""
        assert len(_prompt_of({"prompt": "x" * 5000})) == 2500


class TestDuration:
    @pytest.mark.parametrize(
        ("want", "expected"),
        [(1.0, 5), (5.0, 5), (5.1, 10), (10.0, 10), (30.0, 10)],
    )
    def test_rounds_up_to_allowed_enum(self, want: float, expected: int) -> None:
        """벤더가 받는 값은 5 또는 10 뿐이고, 담을 수 있는 가장 짧은 값으로 올린다.

        반올림이 아니라 올림인 이유: 6초 나레이션에 5초 영상을 받으면 마지막 1초가 정지 프레임이
        된다(fit_to_duration 이 마지막 프레임을 고정해 채운다).
        """
        assert _pick_duration(want) == expected

    def test_defaults_when_unparsable(self) -> None:
        assert _pick_duration(None) == 5
        assert _pick_duration("abc") == 5

    def test_billable_matches_submitted_duration(self) -> None:
        """청구 초는 제출값과 같은 식이어야 한다. 따로 계산하면 청구서와 기록이 어긋난다."""
        adapter = _adapter()
        model = "kling-video/v2.5-turbo/pro/text-to-video"
        for want in (1.0, 6.0, 12.0):
            billed = adapter.billable_seconds({"duration_sec": want, "model_path": model})
            assert billed == _pick_duration(want)

    def test_enum_is_per_model(self) -> None:
        """열거값은 모델마다 다르다. 그래서 인자로 받는다.

        카탈로그에 없는 모델로도 이 규칙을 지켜야 한다. 확인해 둔 예: MiniMax 는 (6, 10) 이라
        공통 (5, 10) 로 보내면 5 가 열거값 밖이라 400 이다.
        """
        assert _pick_duration(1.0, (6, 10)) == 6
        assert _pick_duration(7.0, (6, 10)) == 10
        assert _pick_duration(99.0, (6, 10)) == 10

    def test_billable_is_none_when_model_takes_no_duration(self) -> None:
        """길이를 받지 않는 모델은 모름(None) 이다. 0 은 '쟀는데 0' 으로 읽혀 무료로 위장된다."""
        adapter = _adapter()
        # 표에 없는 모델(카탈로그에 줄이 늘었는데 어댑터 표를 갱신하지 않은 상태).
        assert adapter.billable_seconds({"duration_sec": 6.0, "model_path": "unknown/model"}) is None



class TestRequiredInputs:
    """배선이 끊긴 경우. 영구 실패여야 한다(재시도로 고쳐지지 않는다).

    일반 실패로 던지면 스위퍼가 10번(간격 300초) 재큐잉해 화면이 50분 동안 '만드는 중' 이고,
    원인은 마지막에 타임아웃 문구로 덮여 무엇을 고쳐야 하는지 사라진다.
    """

    @pytest.mark.asyncio
    async def test_missing_api_key_raises(self) -> None:
        """키 없이 조용히 진행하지 않는다: csc-marketing 이 키 있는 조직만 라우팅하므로 배선 오류다."""
        with pytest.raises(PermanentRenderError, match="API 키"):
            await _adapter().submit({"model_path": "veo3.1/text-to-video"}, None)

    @pytest.mark.asyncio
    async def test_missing_model_path_raises(self) -> None:
        """모델 경로가 없으면 실패한다. 기본 모델로 대신 만들면 고르지 않은 모델로 청구된다."""
        with pytest.raises(PermanentRenderError, match="모델 경로"):
            await _adapter().submit({"api_key": "id:secret"}, None)


class TestVendorRefusal:
    """벤더 거절이 즉시 확정 실패로 올라가고 이유가 메시지에 남는지.

    실측한 응답이라 값을 그대로 쓴다. 여기가 열리면 렌더 하나가 한 시간 가까이 '만드는 중' 으로
    남고(스위퍼 재큐잉 10회), 마지막에 원인이 "reconciliation timeout" 으로 덮인다.
    """

    @pytest.mark.asyncio
    async def test_disabled_model_fails_immediately(self, monkeypatch) -> None:
        """503 + model_disabled: 상태는 다시 오라고 하지만 재제출은 영원히 같은 답을 받는다."""

        def handler(request: httpx.Request) -> httpx.Response:
            assert request.url.path == "/veo3.1/text-to-video"
            return httpx.Response(503, json={"detail": "model_disabled"})

        real = httpx.AsyncClient
        monkeypatch.setattr(
            mod.httpx, "AsyncClient",
            lambda **kw: real(**kw, transport=httpx.MockTransport(handler)),
        )
        with pytest.raises(VendorRefusedError) as exc:
            await _adapter().submit(
                {"api_key": "id:secret", "model_path": "veo3.1/text-to-video", "prompt": "p"},
                None,
            )
        assert "model_disabled" in str(exc.value)

    @pytest.mark.asyncio
    async def test_insufficient_credits_fails_immediately(self, monkeypatch) -> None:
        """403 + not_enough_credits: 코드가 아니라 벤더 콘솔에서 풀 문제다."""

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(403, json={"detail": "not_enough_credits"})

        real = httpx.AsyncClient
        monkeypatch.setattr(
            mod.httpx, "AsyncClient",
            lambda **kw: real(**kw, transport=httpx.MockTransport(handler)),
        )
        with pytest.raises(VendorRefusedError, match="크레딧"):
            await _adapter().submit(
                {"api_key": "id:secret", "model_path": "veo3.1/text-to-video", "prompt": "p"},
                None,
            )

class TestRequestBodyPerModel:
    """모델마다 받는 파라미터가 다르다. 한 벌을 고정으로 보내면 받지 않는 모델에서 400 이 난다.

    그 400 은 잡이 워커까지 간 뒤에 나므로 제출 전에 걸러 낼 방법이 없고, 화면에는 "만들기가
    취소되었습니다" 로만 보인다. 그래서 무엇을 싣는지를 여기서 못박는다.
    출처는 벤더 OpenAPI 스키마(docs.higgsfield.ai/docs/openapi.json).
    """

    @staticmethod
    def _capture(monkeypatch) -> dict:
        sent: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            import json

            sent["path"] = request.url.path
            sent["body"] = json.loads(request.content)
            return httpx.Response(200, json={"request_id": "r1"})

        real = httpx.AsyncClient
        monkeypatch.setattr(
            mod.httpx,
            "AsyncClient",
            lambda **kw: real(**kw, transport=httpx.MockTransport(handler)),
        )
        return sent

    @pytest.mark.asyncio
    async def test_kling_21_master_gets_aspect_ratio(self, monkeypatch) -> None:
        """이 모델만 aspect_ratio 를 받는다. 기본이 1:1 이라 보내지 않으면 정사각형이 온다."""
        sent = self._capture(monkeypatch)
        await _adapter().submit(
            {
                "api_key": "id:secret",
                "model_path": "kling-video/v2.1/master/text-to-video",
                "prompt": "p",
                "duration_sec": 6.0,
                "aspect_ratio": "9:16",
            },
            None,
        )
        assert sent["body"] == {"prompt": "p", "duration": 10, "aspect_ratio": "9:16"}

    @pytest.mark.asyncio
    async def test_kling_25_turbo_omits_aspect_ratio(self, monkeypatch) -> None:
        """이 모델은 aspect_ratio 를 선언하지 않는다. 보내면 400 위험이라 싣지 않는다."""
        sent = self._capture(monkeypatch)
        await _adapter().submit(
            {
                "api_key": "id:secret",
                "model_path": "kling-video/v2.5-turbo/pro/text-to-video",
                "prompt": "p",
                "duration_sec": 4.0,
                "aspect_ratio": "9:16",
            },
            None,
        )
        assert sent["body"] == {"prompt": "p", "duration": 5}

    @pytest.mark.asyncio
    async def test_unknown_model_warns(self, monkeypatch, caplog) -> None:
        """표에 없는 모델은 경고를 남긴다. 요청은 성공하지만 세로와 길이를 지정하지 못해
        결과물이 조용히 나빠진다(가로로 만들어져 캔버스 크롭으로 가운데만 남는다)."""
        self._capture(monkeypatch)
        with caplog.at_level("WARNING"):
            await _adapter().submit(
                {"api_key": "id:secret", "model_path": "some/new/model", "prompt": "p"}, None
            )
        assert "_MODEL_PARAMS" in caplog.text

    @pytest.mark.asyncio
    async def test_unknown_model_sends_prompt_only(self, monkeypatch) -> None:
        """표에 없는 모델에 추측한 파라미터를 보내지 않는다. 최소한 벤더 기본값으로는 만들어진다."""
        sent = self._capture(monkeypatch)
        await _adapter().submit(
            {
                "api_key": "id:secret",
                "model_path": "some/new/model/text-to-video",
                "prompt": "p",
                "duration_sec": 6.0,
                "aspect_ratio": "9:16",
                "resolution": "720p",
            },
            None,
        )
        assert sent["body"] == {"prompt": "p"}
