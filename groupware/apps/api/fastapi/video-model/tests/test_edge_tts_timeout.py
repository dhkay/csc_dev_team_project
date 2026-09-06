"""edge-tts 타임아웃: 스트림 hang 을 TimeoutError 로 끊는다(예외 없는 무한 대기 방지).

hang 은 예외 없이 job_timeout(3시간)까지 대기해 무한 RENDERING 을 만든다. timeout_s 로 한 호출을
감싸 TimeoutError 를 던지면, worker_service 가 이를 재시도로 돌려(체크포인트 재개) 자가복구된다.
"""

from __future__ import annotations

import asyncio

import pytest

from app.domains.video.adapters.outbound.tts import edge_tts_adapter
from app.domains.video.adapters.outbound.tts.edge_tts_adapter import EdgeTtsAdapter


class _HangingCommunicate:
    def __init__(self, *args, **kwargs) -> None:
        pass

    async def save(self, out_path: str) -> None:
        await asyncio.sleep(10)  # 스트림 stall 흉내: 절대 반환하지 않음


class _FastCommunicate:
    def __init__(self, *args, **kwargs) -> None:
        pass

    async def save(self, out_path: str) -> None:
        with open(out_path, "wb") as f:
            f.write(b"audio")


async def test_synthesize_times_out_when_stream_hangs(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    monkeypatch.setattr(edge_tts_adapter.edge_tts, "Communicate", _HangingCommunicate)
    adapter = EdgeTtsAdapter(timeout_s=0.05)
    with pytest.raises(TimeoutError):
        await adapter.synthesize("안녕하세요", "ko-KR-SunHiNeural", "+0Hz", str(tmp_path / "a.mp3"))


async def test_synthesize_completes_within_timeout(monkeypatch, tmp_path) -> None:  # noqa: ANN001
    monkeypatch.setattr(edge_tts_adapter.edge_tts, "Communicate", _FastCommunicate)
    out = tmp_path / "a.mp3"
    await EdgeTtsAdapter(timeout_s=5.0).synthesize("안녕", "v", "+0Hz", str(out))
    assert out.exists()
