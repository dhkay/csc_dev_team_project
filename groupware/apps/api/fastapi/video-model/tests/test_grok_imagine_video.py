"""Grok Imagine 영상 어댑터 단위: 순수 매핑 + httpx MockTransport 로 submit/poll(네트워크 없음)."""

from __future__ import annotations

import json

import httpx
import pytest

import app.domains.video.adapters.outbound.processing.grok_imagine_video as mod
from app.domains.video.adapters.outbound.processing.grok_imagine_video import (
    GrokImagineVideoProcessing,
    _MIN_VIDEO_BYTES,
    _clamp_duration,
    _image_data_uri,
)


def _proc(timeout: float = 10.0, **over) -> GrokImagineVideoProcessing:  # noqa: ANN003
    # 대기가 필요한 테스트는 sleep 을 주입한다(어댑터의 모든 대기가 주입된 sleep 을 지난다).
    return GrokImagineVideoProcessing(
        base_url="https://api.x.ai/v1",
        model="grok-imagine-video",
        default_resolution="720p",
        timeout=timeout,
        poll_interval=2.0,
        **over,
    )


def test_clamp_duration() -> None:
    assert _clamp_duration(5.4) == 5
    assert _clamp_duration(0.2) == 1     # 하한 1
    assert _clamp_duration(30) == 15     # 상한 15
    assert _clamp_duration(None) == 1    # 폴백
    assert _clamp_duration("bad") == 1


def test_image_data_uri(tmp_path) -> None:
    p = tmp_path / "img.png"
    p.write_bytes(b"\x89PNG\r\n")
    uri = _image_data_uri(str(p))
    assert uri.startswith("data:image/png;base64,")


async def test_submit_builds_request_and_returns_id(tmp_path, monkeypatch) -> None:
    img = tmp_path / "scene.png"
    img.write_bytes(b"\x89PNG\r\n")
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/videos/generations")
        assert request.headers["authorization"] == "Bearer org-xai-key"
        captured.update(json.loads(request.content))
        return httpx.Response(200, json={"request_id": "req-123"})

    real = httpx.AsyncClient
    monkeypatch.setattr(
        mod.httpx, "AsyncClient",
        lambda **kw: real(**kw, transport=httpx.MockTransport(handler)),
    )
    rid = await _proc().submit(
        {"api_key": "org-xai-key", "prompt": "p", "duration_sec": 40, "aspect_ratio": "4:5"},
        str(img),
    )
    assert rid == "req-123"
    assert captured["model"] == "grok-imagine-video"
    assert captured["duration"] == 15                # 40 → 상한 15
    assert captured["aspect_ratio"] == "3:4"          # 4:5 → xAI 근사 3:4
    assert captured["resolution"] == "720p"
    # i2v: xAI image 필드는 중첩 객체 {"url": data URI}.
    assert captured["image"]["url"].startswith("data:image/png;base64,")


async def test_submit_uses_job_resolution_over_default(tmp_path, monkeypatch) -> None:
    """화질은 COMPOSE 잡의 params.resolution 이 설정 기본값을 이겨야 한다.

    이게 깨지면 480p 잡이 720p 소스를 만들어와 concat 단계에서 축소된다. 결과는 같은데
    초당 단가만 더 내는 조용한 낭비라 테스트로 못박는다.
    """
    img = tmp_path / "scene.png"
    img.write_bytes(b"\x89PNG\r\n")
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(json.loads(request.content))
        return httpx.Response(200, json={"request_id": "req-9"})

    real = httpx.AsyncClient
    monkeypatch.setattr(
        mod.httpx, "AsyncClient",
        lambda **kw: real(**kw, transport=httpx.MockTransport(handler)),
    )
    await _proc().submit(
        {"api_key": "k", "prompt": "p", "duration_sec": 5, "resolution": "480p"},
        str(img),
    )
    assert captured["resolution"] == "480p"


async def test_submit_without_key_raises() -> None:
    with pytest.raises(RuntimeError, match="xAI API 키"):
        await _proc().submit({"prompt": "p", "duration_sec": 5}, None)


async def test_await_done_polls_until_done(monkeypatch) -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/videos/req-1")
        calls["n"] += 1
        if calls["n"] < 3:
            return httpx.Response(200, json={"status": "pending"})
        return httpx.Response(200, json={"status": "done", "video": {"url": "https://vid/x.mp4"}})

    async def _no_sleep(_s: float) -> None:
        return None

    proc = _proc(timeout=100.0, sleep=_no_sleep)
    async with httpx.AsyncClient(
        base_url="https://api.x.ai/v1", transport=httpx.MockTransport(handler)
    ) as client:
        url = await proc._await_done(client, "req-1", "k")
    assert url == "https://vid/x.mp4" and calls["n"] == 3


async def test_await_done_failed_raises(monkeypatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"status": "failed", "error": {"message": "bad prompt"}})

    async def _no_sleep(_s: float) -> None:
        return None

    async with httpx.AsyncClient(
        base_url="https://api.x.ai/v1", transport=httpx.MockTransport(handler)
    ) as client:
        with pytest.raises(RuntimeError, match="bad prompt"):
            await _proc(sleep=_no_sleep)._await_done(client, "req-1", "k")


_FULL_MP4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * _MIN_VIDEO_BYTES  # >= 최소 크기


async def test_download_retries_until_full_video(tmp_path, monkeypatch) -> None:
    """status=done 직후 전환기 poster(작은 mjpeg)를 받으면 유효 mp4 가 올 때까지 재다운로드한다."""
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] < 3:  # 처음 2회 = 전환기 poster(작고 image content-type)
            return httpx.Response(200, content=b"\xff\xd8\xff" + b"x" * 5000,
                                  headers={"content-type": "image/jpeg"})
        return httpx.Response(200, content=_FULL_MP4, headers={"content-type": "video/mp4"})

    async def _no_sleep(_s: float) -> None:
        return None

    real = httpx.AsyncClient
    monkeypatch.setattr(
        mod.httpx, "AsyncClient",
        lambda **kw: real(**{**kw, "transport": httpx.MockTransport(handler)}),
    )
    out = tmp_path / "result.mp4"
    await _proc(sleep=_no_sleep)._download("https://vid.x.ai/x.mp4", str(out), "k")
    assert out.read_bytes() == _FULL_MP4 and calls["n"] == 3


async def test_download_raises_if_never_valid(tmp_path, monkeypatch) -> None:
    """끝내 유효 비디오가 안 오면 예외(깨진/무오디오 클립을 저장, 체크포인트하지 않음)."""
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"tiny", headers={"content-type": "image/jpeg"})

    async def _no_sleep(_s: float) -> None:
        return None

    real = httpx.AsyncClient
    monkeypatch.setattr(
        mod.httpx, "AsyncClient",
        lambda **kw: real(**{**kw, "transport": httpx.MockTransport(handler)}),
    )
    with pytest.raises(RuntimeError, match="유효한 비디오"):
        await _proc(sleep=_no_sleep)._download("https://vid.x.ai/x.mp4", str(tmp_path / "r.mp4"), "k")
@pytest.mark.parametrize("duration_sec,expected", [(1.4, 1), (7.0, 7), (18.4, 15)])
async def test_billable_seconds_equals_submitted_duration(
    tmp_path, monkeypatch, duration_sec: float, expected: int
) -> None:
    """청구 초 = 벤더에 보낸 정수 duration. 합성 결과물 길이가 아니다.

    이 테스트가 지키는 것: 청구 근거를 나레이션에 맞춰 늘린 뒤의 실측 길이(2.0~20.0 float)로
    바꾸려는 시도. 그 값으로 계산하면 긴 씬이 최대 20% 넘게 과다 청구된다. 그래서 submit 이
    실제로 보낸 body["duration"] 과 billable_seconds() 가 같아야 한다고 못박는다.
    """
    img = tmp_path / "scene.png"
    img.write_bytes(b"fake-png-bytes")
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(json.loads(request.content))
        return httpx.Response(200, json={"request_id": "req-b"})

    real = httpx.AsyncClient
    monkeypatch.setattr(
        mod.httpx, "AsyncClient",
        lambda **kw: real(**kw, transport=httpx.MockTransport(handler)),
    )
    params = {"api_key": "k", "prompt": "p", "duration_sec": duration_sec}
    proc = _proc()
    await proc.submit(params, str(img))

    assert proc.billable_seconds(params) == expected
    assert captured["duration"] == expected          # 청구 근거 == 전송값
