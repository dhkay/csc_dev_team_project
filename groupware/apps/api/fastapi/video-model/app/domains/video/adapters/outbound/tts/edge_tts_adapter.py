"""TtsPort 구현: edge-tts(Microsoft Edge 온라인 TTS).

무료/키 불필요, 다국어(한국어 포함) 자연스러운 음성. provider 교체 가능(포트 뒤).
네트워크 필요(MS 엔드포인트 호출): 폐쇄망 배포 시 다른 TTS provider 로 교체.
"""

from __future__ import annotations

import asyncio

import edge_tts

# 기본 음성/피치: 채널 선택이 비었을 때 상위(csc-marketing)가 기본을 넣지만, 어댑터도 방어적으로 폴백.
_DEFAULT_VOICE = "ko-KR-SunHiNeural"
_DEFAULT_PITCH = "+0Hz"
# 타임아웃 폴백(초): 주입 없이 생성돼도 무한 대기하지 않게 하는 방어값.
_DEFAULT_TIMEOUT_S = 60.0


class EdgeTtsAdapter:
    """TtsPort(Protocol) 구현. 나레이션 텍스트를 mp3 로 합성해 out_path 에 쓴다.

    edge-tts 는 MS 엔드포인트로 스트리밍하는데, 스트림이 중간에 멈추면 예외 없이 무한 대기한다.
    timeout_s 로 한 호출을 감싸(초과 시 TimeoutError) 그 hang 을 끊는다. worker_service 가 이를
    재시도로 돌리고(COMPOSE 는 체크포인트로 완료 씬 건너뜀) 일시적 정체는 자가복구된다.
    """

    def __init__(self, timeout_s: float = _DEFAULT_TIMEOUT_S) -> None:
        self._timeout_s = timeout_s

    async def synthesize(
        self,
        text: str,
        voice: str,
        pitch: str,
        out_path: str,
        *,
        provider: str = "",
        api_key: str = "",
    ) -> None:
        # provider/api_key 는 포트 계약이라 받되 쓰지 않는다: 무료라 키가 없고, 어느 어댑터인지는
        #   라우터가 이미 정했다.
        del provider, api_key
        communicate = edge_tts.Communicate(
            text=text,
            voice=voice or _DEFAULT_VOICE,
            pitch=pitch or _DEFAULT_PITCH,
        )
        # 초과 시 asyncio.TimeoutError → 상위(worker_service)가 재시도로 처리(비최종 시도면 FAILED 아님).
        await asyncio.wait_for(communicate.save(out_path), timeout=self._timeout_s)
