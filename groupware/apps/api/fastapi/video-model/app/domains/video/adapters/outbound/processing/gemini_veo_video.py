"""외부 영상 생성(Google Gemini API 의 Veo) ResumableVisualPort 어댑터.

운영사 직접 경로다. 플랫폼(Higgsfield)이 중계하는 것과 같은 모델이라도 이쪽은 조직의 Google
키로 Google 을 직접 부르고 요금도 그 계정에 붙는다. 같은 Veo 가 두 경로로 존재하며 어느 쪽인지는
카탈로그 key 의 라우트가 정한다(csc-marketing `VIDEO_ROUTES`).

어느 Veo 모델을 부를지는 호출마다 `params["model_path"]` 로 온다. 그래서 이 어댑터는 하나뿐이고
모델이 늘어도 이 파일도 워커 레지스트리도 바뀌지 않는다.

텍스트→영상이다. 씬 이미지를 입력으로 받지 않는다. 화면과 오디오(대사, 효과음, 배경음)가 모두
`params["prompt"]` 에서 만들어진다(Veo 3.1 은 오디오를 끌 수 없다).

제출/폴링 2단계라 워커가 죽어도 operation 이름으로 재폴링해 재개한다(재과금 0).
조직마다 키가 다르고 stateless 싱글톤이라 키를 보관하지 않는다. 호출마다 `params["api_key"]`.

한도(분당 제출 수, 429)는 이 어댑터가 모른다. 레지스트리가 `ThrottledVisual` 로 감싸 밖에서 붙인다
(vendor_http.py). 여기서는 429 도 다른 실패와 같이 raise_for_vendor_status 로 번역만 한다.

Gemini API 계약(2026-09-02, 실제 호출로 확인):
  x-goog-api-key: {키}
  POST {base}/v1beta/models/{model}:predictLongRunning
       {instances:[{prompt}], parameters:{aspectRatio, resolution, durationSeconds,
                                          personGeneration}}
    -> {name: "models/.../operations/..."}
  GET  {base}/v1beta/{operation_name}
    -> {done: true, response:{generateVideoResponse:{generatedSamples:[{video:{uri}}]}}}
  GET  {uri}  (alt=media 가 이미 붙어 있다. 헤더 인증 필요, 리다이렉트 따라가야 한다)

위 표와 아래 넷은 벤더 문서가 아니라 실제 응답을 따른다. 2와 3은 문서가 다르게 적는다.
  1. `parameters` 는 `instances` 의 형제다. 안에 넣으면 400.
  2. `durationSeconds` 는 숫자다. 문자열로 보내면 400.
  3. 개수 필드(`numberOfVideos`)를 보내지 않는다. 한 요청이 영상 하나인 것이 고정이다.
  4. `negativePrompt` 는 이 API 계약에 없다(공용 SDK 설정에만 있다). 보내면 400.
"""

from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

from ....core.domain.errors import DeadVisualHandleError, PermanentRenderError
from ....core.domain.render_failure import RenderFailure
from .vendor_http import raise_for_vendor_status

logger = logging.getLogger(__name__)

# 우리 화면비 → Veo 가 받는 aspectRatio. 둘뿐이다(16:9, 9:16). 그 밖의 값은 세로로 근사한다:
#   이 도구의 산출물이 세로 쇼츠이고, 렌더 캔버스도 세로다(가로로 만들면 좌우가 잘린다).
_ASPECT_MAP = {"9:16": "9:16", "16:9": "16:9", "1:1": "9:16", "4:5": "9:16"}
_DEFAULT_ASPECT = "9:16"

# durationSeconds 열거값(초). 숫자로 보낸다(문자열은 400: 위 2번).
_ALLOWED_DURATIONS = (4, 6, 8)

# 우리 화질 등급 → Veo resolution. 1080p 와 4k 는 `durationSeconds="8"` 을 강제하고 렌더 캔버스
#   등급(ffmpeg_ops._DIMS)에도 없어 쓰지 않는다. 캔버스가 720p 인데 1080p 를 받으면 축소만 하고
#   요금은 더 낸다.
_RESOLUTION_MAP = {"480p": "720p", "720p": "720p"}
_DEFAULT_RESOLUTION = "720p"

# 텍스트→영상에서 personGeneration 은 이 값만 받는다(이미지 입력이 있으면 'allow_adult' 만 받는다).
#   보내지 않으면 벤더 기본을 따르지만, 명시해 두면 그 기본이 바뀌어도 우리 결과가 바뀌지 않는다.
_PERSON_GENERATION = "allow_all"

# 프롬프트 상한은 토큰(1,024)이라 글자 수로는 정확히 알 수 없다. 한국어는 토큰이 무거워
#   글자당 1토큰을 넘기기도 하므로 보수적으로 자른다. 넘겨서 400 을 받는 것보다 낫다.
_MAX_PROMPT = 1500
# 씬 화면 묘사가 비었을 때의 폴백. prompt 는 required 라 비워 보내면 거절된다.
_FALLBACK_PROMPT = "A cinematic product marketing shot, smooth camera motion, high quality"

# 문서 권고 폴링 간격. 생성 지연은 최소 11초, 피크에는 6분까지 간다.
_POLL_INTERVAL_S = 10.0
_MIN_VIDEO_BYTES = 100_000
_DOWNLOAD_TRIES = 8


class GeminiVeoVideoProcessing:
    """ResumableVisualPort 구현: Gemini API 의 Veo 텍스트→영상(조직 키/모델은 params 로 주입)."""

    def __init__(
        self,
        *,
        base_url: str,
        timeout: float,
        poll_interval: float = _POLL_INTERVAL_S,
        # 폴링 대기의 sleep. 주입은 테스트용(실제 대기 없이 폴링 루프를 돌린다).
        sleep: Callable[[float], Awaitable[None]] | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._poll_interval = poll_interval
        self._sleep = sleep

    # ---- ResumableVisualPort ----
    def billable_seconds(self, params: dict[str, Any]) -> int | None:
        """이 씬이 벤더에 청구할 초: submit 이 보내는 값과 같은 식이다.

        Veo 는 초당 정액이고 길이를 우리가 정하므로 보낸 값이 곧 청구 근거다. 같은 함수를 쓰는 것이
        핵심이다: 따로 계산하면 언젠가 둘이 어긋나 청구서와 우리 기록이 조용히 달라진다.
        """
        return _pick_duration(params.get("duration_sec"))

    async def submit(self, params: dict[str, Any], source_path: str | None) -> str:
        """영상 생성을 제출하고 operation 이름 반환(즉시 체크포인트 → 재시작에도 재폴링 가능).

        `source_path`(씬 이미지)는 쓰지 않는다. 텍스트→영상 경로라 입력이 프롬프트뿐이다.
        호출부는 이 provider 에 이미지를 받으러 가지도 않는다(compose 가 그 fetch 를 건너뛴다).
        """
        api_key = self._require_key(params)
        model = self._require_model(params)
        body = {
            "instances": [{"prompt": _prompt_of(params)}],
            # parameters 는 instances 의 형제다(안에 넣으면 400).
            "parameters": {
                "aspectRatio": _ASPECT_MAP.get(
                    str(params.get("aspect_ratio") or ""), _DEFAULT_ASPECT
                ),
                "resolution": _RESOLUTION_MAP.get(
                    str(params.get("resolution") or ""), _DEFAULT_RESOLUTION
                ),
                "durationSeconds": _pick_duration(params.get("duration_sec")),
                "personGeneration": _PERSON_GENERATION,
            },
        }
        async with httpx.AsyncClient(base_url=self._base_url, timeout=self._timeout) as client:
            resp = await client.post(
                f"/v1beta/models/{model}:predictLongRunning", json=body, headers=_auth(api_key)
            )
            raise_for_vendor_status(resp, vendor="Gemini")
            data = resp.json()
        name = data.get("name")
        if not name:
            raise RuntimeError("Gemini 제출 응답에 operation 이름(name)이 없습니다")
        return str(name)

    async def poll_to_file(
        self, handle: str, out_dir: str, params: dict[str, Any] | None = None
    ) -> str:
        """operation 완료까지 폴링(멱등) 후 결과 영상을 out_dir 로 받아 경로 반환. 재폴링에도 안전."""
        api_key = self._require_key(params or {})
        out_path = os.path.join(out_dir, "result.mp4")
        async with httpx.AsyncClient(base_url=self._base_url, timeout=self._timeout) as client:
            video_uri = await self._await_done(client, handle, api_key)
            await self._download(video_uri, out_path, api_key)
        return out_path

    # ---- 내부 ----
    async def _wait(self, seconds: float) -> None:
        # 주입된 sleep 이 없으면 asyncio 의 것을 호출 시점에 찾는다(생성 시점에 묶으면 monkeypatch 가 닿지 않는다).
        await (self._sleep or asyncio.sleep)(seconds)

    def _require_key(self, params: dict[str, Any]) -> str:
        key = str(params.get("api_key") or "").strip()
        if not key:
            # csc-marketing 이 키 있는 조직만 이 provider 로 라우팅 → 여기서 비면 배선/복호화 오류.
            #   영구 실패로 던지는 이유는 형제 어댑터와 같다(재시도로 배선은 고쳐지지 않는다).
            raise PermanentRenderError(
                "Gemini: 조직 API 키가 없습니다(라우팅/복호화 확인)",
                failure=RenderFailure.CREDENTIAL_MISSING,
            )
        return key

    def _require_model(self, params: dict[str, Any]) -> str:
        """부를 모델 id. 없으면 명시적으로 실패한다(임의 기본 모델로 대신 만들지 않는다).

        기본값을 두면 배선이 끊긴 날 사용자가 고르지 않은 모델로 영상이 만들어지고, 등급에 따라
        초당 요금이 네 배까지 차이 나므로 청구서가 나오기 전까지 아무도 모른다.
        """
        model = str(params.get("model_path") or "").strip()
        if not model:
            raise PermanentRenderError("Gemini: 모델(model_path)이 없습니다(라우팅 확인)")
        return model.strip("/")

    async def _await_done(self, client: httpx.AsyncClient, name: str, api_key: str) -> str:
        """operation 이 done 이 될 때까지 폴링 → 결과 영상 uri 반환."""
        waited = 0.0
        while True:
            # operation 이름에 'models/...' 가 이미 들어 있어 접두사를 다시 붙이지 않는다.
            resp = await client.get(f"/v1beta/{name.lstrip('/')}", headers=_auth(api_key))
            raise_for_vendor_status(resp, vendor="Gemini")
            data = resp.json()
            # 진행 중에는 done 이 아예 없을 수 있다(false 로 오지 않는다).
            if data.get("done"):
                return _video_uri_of(data, name)
            await self._wait(self._poll_interval)
            waited += self._poll_interval
            if waited >= self._timeout:
                raise TimeoutError(f"Gemini 영상 생성 타임아웃({self._timeout}s): {name}")

    async def _download(self, video_uri: str, out_path: str, api_key: str) -> None:
        """결과 영상을 받는다. 서명 URL 이 아니라 헤더 인증이 필요하다(형제 어댑터와 다른 점).

        리다이렉트를 따라가지 않으면 빈 본문을 받는다. 완료 직후 조각이 오는 경우를 대비해 유효
        비디오가 될 때까지 재시도한다(깨진 클립이 이어붙이기 필터그래프를 터뜨리는 것을 막는다).
        """
        last = ""
        for attempt in range(1, _DOWNLOAD_TRIES + 1):
            async with httpx.AsyncClient(timeout=self._timeout, follow_redirects=True) as client:
                resp = await client.get(video_uri, headers=_auth(api_key))
                raise_for_vendor_status(resp, vendor="Gemini")
                data = resp.content
                ctype = resp.headers.get("content-type", "")
            if "video" in ctype.lower() and len(data) >= _MIN_VIDEO_BYTES:
                with open(out_path, "wb") as f:
                    f.write(data)
                return
            last = f"content-type={ctype!r} bytes={len(data)}"
            logger.warning(
                "Gemini 영상이 아직 준비 안 됨(재시도 %d/%d): %s", attempt, _DOWNLOAD_TRIES, last
            )
            if attempt < _DOWNLOAD_TRIES:
                await self._wait(self._poll_interval)
        raise RuntimeError(f"Gemini 영상 다운로드가 유효한 비디오가 아닙니다({last}): {video_uri}")


def _auth(api_key: str) -> dict[str, str]:
    """`x-goog-api-key`. API 키에는 Bearer 를 쓰지 않는다(그건 OAuth 토큰용이다)."""
    return {"x-goog-api-key": api_key}


def _video_uri_of(data: dict[str, Any], name: str) -> str:
    """완료된 operation 에서 영상 uri 를 꺼낸다.

    done 인데 영상이 없는 경우를 반드시 다룬다. 안전 필터 차단은 제출 호출의 4xx 가 아니라
    완료된 operation 안에서 드러난다(그때 과금도 되지 않는다). 그것을 일반 실패로 던지면 스위퍼가
    같은 handle 을 열 번 재폴링하며 50분을 쓰고, 답은 영원히 같다. 그래서 handle 을 버리라고
    알린다(DeadVisualHandleError): 호출부가 다음 시도에 새로 제출한다.
    """
    error = data.get("error")
    if isinstance(error, dict) and error:
        raise DeadVisualHandleError(
            f"Gemini 영상 생성 실패: {error.get('message') or error.get('code') or error}"
        )
    samples = (
        ((data.get("response") or {}).get("generateVideoResponse") or {}).get("generatedSamples")
        or []
    )
    uri = (samples[0].get("video") or {}).get("uri") if samples else None
    if not uri:
        # 결과가 없는 완료는 대개 안전 필터 차단이다. 벤더가 사유를 따로 주지 않아 그 사실을 적는다.
        raise DeadVisualHandleError(
            f"Gemini 가 결과 없이 완료했습니다(안전 필터 차단으로 보입니다): {name}",
            failure=RenderFailure.CONTENT_REJECTED,
        )
    return str(uri)


def _prompt_of(params: dict[str, Any]) -> str:
    """씬 화면 묘사 → 벤더 프롬프트. 비면 폴백, 길면 자른다(상한 초과는 400)."""
    prompt = str(params.get("prompt") or "").strip() or _FALLBACK_PROMPT
    return prompt[:_MAX_PROMPT]


def _pick_duration(value: Any) -> int:
    """씬 길이(초) → Veo 가 받는 열거값. 열거값이 아니면 올려서 맞춘다.

    올리는 이유는 형제 어댑터와 같다. 내리면 나레이션이 잘린 클립이 되고, 렌더가 부족한 길이를
    프레임 홀드로 늘려 끝이 정지화면처럼 보인다. 올리면 남는 부분을 잘라 내기만 하면 된다.
    """
    try:
        wanted = float(value)
    except (TypeError, ValueError):
        wanted = float(_ALLOWED_DURATIONS[0])
    for allowed in _ALLOWED_DURATIONS:
        if wanted <= allowed:
            return allowed
    return _ALLOWED_DURATIONS[-1]
