"""TtsPort 구현: ElevenLabs 텍스트→음성.

edge-tts 와 두 가지가 다르다.
  1. 조직 API 키가 필요하다. stateless 싱글톤이라 키를 보관하지 않고 호출마다 `api_key` 로 받는다.
  2. 음성이 요청 경로에 있다. `voice` 가 비면 URL 자체가 성립하지 않으므로 폴백하지 않고 실패한다.
     여기서 임의의 음성을 고르면 조직이 등록하지 않은 목소리로 영상이 나간다.

ElevenLabs 계약(elevenlabs.io/docs, 2026-08-26 확인):
  POST {base}/v1/text-to-speech/{voice_id}
    headers: xi-api-key
    body: {text, model_id}
    -> audio/mpeg 바이트

`voice_settings`(안정성, 유사도, 스타일, 속도)는 보내지 않는다. 벤더가 그 값들을 덮어쓰기로
정의해서, 보내지 않으면 그 음성에 저장된 설정을 쓴다. 저장된 설정은 ElevenLabs 화면에서 소리를
들어 가며 맞춘 값이고 우리 쪽에는 미리듣기가 없다. `pitch` 를 받지만 쓰지 않는 것도 같은
이유다(포트 계약이라 시그니처만 같다). ElevenLabs 에는 그 개념이 없다.
"""

from __future__ import annotations

import httpx

# 벤더 기본 모델. 우리 카탈로그가 모델을 정하지만, provider key 가 비어 오는 경로가 있으면
#   요청이 통째로 실패하는 대신 문서가 기본으로 못박은 값을 쓴다.
_DEFAULT_MODEL = "eleven_multilingual_v2"
_DEFAULT_TIMEOUT_S = 60.0
# mp3 출력을 명시한다. 벤더 기본과 같은 값이지만, 기본이 바뀌어도 ffmpeg 이 받는 형식은 그대로여야 한다.
_OUTPUT_FORMAT = "mp3_44100_128"


class ElevenLabsTtsAdapter:
    """TtsPort(Protocol) 구현. 나레이션 텍스트를 mp3 로 합성해 out_path 에 쓴다."""

    def __init__(self, base_url: str, timeout_s: float = _DEFAULT_TIMEOUT_S) -> None:
        self._base_url = base_url.rstrip("/")
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
        key = api_key.strip()
        if not key:
            # csc-marketing 이 키 있는 조직만 이 provider 로 라우팅 → 여기서 비면 배선/복호화 오류.
            raise RuntimeError("ElevenLabs: 조직 API 키가 없습니다(라우팅/복호화 확인)")
        voice_id = voice.strip()
        if not voice_id:
            raise RuntimeError("ElevenLabs: 음성 ID 가 없습니다(조직 API 등록 확인)")
        body = {"text": text, "model_id": provider.strip() or _DEFAULT_MODEL}
        async with httpx.AsyncClient(base_url=self._base_url, timeout=self._timeout_s) as client:
            resp = await client.post(
                f"/v1/text-to-speech/{voice_id}",
                params={"output_format": _OUTPUT_FORMAT},
                json=body,
                headers={"xi-api-key": key},
            )
            resp.raise_for_status()
            audio = resp.content
        if not audio:
            raise RuntimeError("ElevenLabs 응답이 비어 있습니다(음성 합성 실패)")
        with open(out_path, "wb") as f:
            f.write(audio)
