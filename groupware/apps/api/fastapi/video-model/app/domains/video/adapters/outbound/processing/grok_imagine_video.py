"""외부 영상 생성(xAI Grok Imagine) ResumableVisualPort 어댑터.

씬 비주얼(이미지→영상)을 xAI 영상 API 에 위임한다: 제출 → request_id → 폴링 → 완료 시 임시 URL 다운로드.
제출/폴링 2단계라 워커가 죽어도 request_id 로 재폴링해 재개한다(GPU/쿼터 재작업 0): ComfyUI 어댑터와 동형.

조직 API 키: xAI 는 조직마다 다른 키를 쓴다. 이 어댑터는 stateless 싱글톤이라 키를 보관하지 않고,
호출마다 `params["api_key"]`(compose 가 잡 params 의 암호문을 복호화해 넣어 준다)로 Bearer 를 만든다.
키가 없으면 명시적 에러(csc-marketing 이 키 있는 조직만 이 provider 로 라우팅하므로, 없으면 배선 오류).

xAI 계약(docs.x.ai):
  POST {base}/videos/generations  {model, prompt, duration(1~15s), aspect_ratio, resolution, image?:{url}} -> {request_id}
    image 는 중첩 객체 {"url": <공개 URL | data URI>}: 내부 이미지는 base64 data URI 로 넣는다(실측 허용).
  GET  {base}/videos/{request_id} -> {status: pending|done|failed|expired, video:{url}, error:{message}}
  video.url = 임시 URL. status=done 이라도 CDN 에 mp4 가 아직 완전히 안 올라올 수 있어(초기 GET 이 작은
    poster 를 반환), 유효 비디오가 될 때까지 재다운로드한다(_download).
"""

from __future__ import annotations

import asyncio
import base64
import logging
import mimetypes
import os
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

from ....core.domain.errors import DeadVisualHandleError, PermanentRenderError
from ....core.domain.render_failure import RenderFailure
from .vendor_http import raise_for_vendor_status

logger = logging.getLogger(__name__)

# 우리 화면비 → xAI 지원 aspect_ratio. xAI 미지원(4:5 등)은 가장 가까운 값으로 근사. 기본 9:16(쇼츠).
_ASPECT_MAP = {"9:16": "9:16", "16:9": "16:9", "1:1": "1:1", "4:5": "3:4"}
_DEFAULT_ASPECT = "9:16"
# xAI duration 범위(초, 정수).
_MIN_DUR, _MAX_DUR = 1, 15
_POLL_INTERVAL_S = 3.0
# 다운로드 유효성: xAI 는 status=done 직후에도 CDN 에 mp4 가 아직 완전히 안 올라와, 초기 GET 이
#   작은 poster(mjpeg 등, 무오디오)를 돌려줄 수 있다(실측: 5s 720p 클립은 수백 KB~1MB, 전환기 poster 는 ~18KB).
#   유효 비디오(video/* content-type + 최소 크기)가 될 때까지 재다운로드한다 → 깨진/무오디오 클립이
#   이어붙이기(concat) 필터그래프를 터뜨리는 것(99% 멈춤)을 원천 차단.
_MIN_VIDEO_BYTES = 100_000
_DOWNLOAD_TRIES = 8


class GrokImagineVideoProcessing:
    """ResumableVisualPort 구현: xAI Grok Imagine 영상 생성(조직 키는 params 로 주입)."""

    def __init__(
        self,
        *,
        base_url: str,
        model: str,
        default_resolution: str,
        timeout: float,
        poll_interval: float = _POLL_INTERVAL_S,
        # 폴링 대기의 sleep. 주입은 테스트용. 한도(간격, 429)는 이 어댑터가 모른다(ThrottledVisual 이 감싼다).
        sleep: Callable[[float], Awaitable[None]] | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._model = model
        # 잡이 화질을 지정하지 않을 때만 쓰는 폴백: 실제 값은 COMPOSE 잡의 params.resolution 이 정한다.
        self._default_resolution = default_resolution
        self._timeout = timeout
        self._poll_interval = poll_interval
        self._sleep = sleep

    # ---- ResumableVisualPort ----
    def billable_seconds(self, params: dict[str, Any]) -> int:
        """이 씬이 xAI 에 청구할 초: submit 이 보내는 값과 같은 식이다.

        같은 함수(_clamp_duration)를 쓰는 것이 핵심이다: 별도로 계산하면 언젠가 둘이 어긋나
        청구서와 우리 기록이 조용히 달라진다. xAI 는 해상도 구분 없이 초당 정액이라 길이만이 변수다.
        """
        return _clamp_duration(params.get("duration_sec"))

    async def submit(self, params: dict[str, Any], source_path: str | None) -> str:
        """xAI 에 영상 생성을 제출하고 request_id 반환(즉시 체크포인트 → 재시작에도 재폴링 가능)."""
        api_key = self._require_key(params)
        body: dict[str, Any] = {
            "model": self._model,
            "prompt": str(params.get("prompt") or ""),
            "duration": _clamp_duration(params.get("duration_sec")),
            "aspect_ratio": _ASPECT_MAP.get(str(params.get("aspect_ratio") or ""), _DEFAULT_ASPECT),
            # 잡별 화질(COMPOSE 가 visual_extra 로 주입) 우선, 없으면 설정 기본값.
            "resolution": str(params.get("resolution") or self._default_resolution),
        }
        # 이미지→영상(i2v): 씬 소스 이미지를 첨부. xAI image 필드는 중첩 객체 {"url": ...} 이며,
        #   url 에 공개 URL 대신 base64 data URI 를 넣어도 허용된다(내부 이미지라 공개 URL 불가 → data URI). 실측 확인.
        if source_path:
            body["image"] = {"url": _image_data_uri(source_path)}
        async with httpx.AsyncClient(base_url=self._base_url, timeout=self._timeout) as client:
            resp = await client.post("/videos/generations", json=body, headers=_auth(api_key))
            raise_for_vendor_status(resp, vendor="xAI")
            request_id = resp.json().get("request_id")
        if not request_id:
            raise RuntimeError("xAI 영상 제출 응답에 request_id 가 없습니다")
        return str(request_id)

    async def poll_to_file(
        self, handle: str, out_dir: str, params: dict[str, Any] | None = None
    ) -> str:
        """request_id 완료까지 폴링(멱등) 후 결과 영상을 out_dir 로 받아 경로 반환. 재폴링에도 안전."""
        api_key = self._require_key(params or {})
        out_path = os.path.join(out_dir, "result.mp4")
        async with httpx.AsyncClient(base_url=self._base_url, timeout=self._timeout) as client:
            video_url = await self._await_done(client, handle, api_key)
            await self._download(video_url, out_path, api_key)
        return out_path

    # ---- 내부 ----
    async def _wait(self, seconds: float) -> None:
        # 주입된 sleep 이 없으면 asyncio 의 것을 호출 시점에 찾는다(생성 시점에 묶으면 monkeypatch 가 닿지 않는다).
        await (self._sleep or asyncio.sleep)(seconds)

    def _require_key(self, params: dict[str, Any]) -> str:
        key = str(params.get("api_key") or "").strip()
        if not key:
            # csc-marketing 이 키 있는 조직만 이 provider 로 라우팅 → 여기서 비면 배선/복호화 오류.
            #   재시도로 배선은 고쳐지지 않으므로 형제 어댑터와 같이 즉시 확정한다.
            raise PermanentRenderError(
                "Grok Imagine: 조직 xAI API 키가 없습니다(라우팅/복호화 확인)",
                failure=RenderFailure.CREDENTIAL_MISSING,
            )
        return key

    async def _await_done(self, client: httpx.AsyncClient, request_id: str, api_key: str) -> str:
        """status 가 done 이 될 때까지 폴링 → video.url 반환. failed/expired 는 예외, timeout 초과도 예외."""
        waited = 0.0
        while True:
            resp = await client.get(f"/videos/{request_id}", headers=_auth(api_key))
            raise_for_vendor_status(resp, vendor="xAI")
            data = resp.json()
            status = data.get("status")
            if status == "done":
                url = (data.get("video") or {}).get("url")
                if not url:
                    raise RuntimeError(f"xAI 영상 완료 응답에 video.url 이 없습니다: {request_id}")
                return str(url)
            if status in ("failed", "expired"):
                msg = (data.get("error") or {}).get("message") or status
                # 벤더가 이 요청을 확정 실패로 못박았다. 같은 request_id 를 다시 폴링해도
                #   영원히 같은 응답이다. 전용 예외로 알려 호출부가 handle 을 버리고
                #   다음 시도에 새로 제출하게 한다(재폴링 무한 루프 차단).
                raise DeadVisualHandleError(f"xAI 영상 생성 실패({status}): {msg}")
            await self._wait(self._poll_interval)
            waited += self._poll_interval
            if waited >= self._timeout:
                raise TimeoutError(f"xAI 영상 생성 타임아웃({self._timeout}s): {request_id}")

    async def _download(self, video_url: str, out_path: str, api_key: str) -> None:
        # 임시 URL 은 대개 서명돼 인증 불필요하나, 동일 오리진이면 Bearer 를 붙여도 무해하다.
        headers = _auth(api_key) if video_url.startswith(self._base_url) else None
        last = ""
        for attempt in range(1, _DOWNLOAD_TRIES + 1):
            async with httpx.AsyncClient(
                timeout=self._timeout, follow_redirects=True
            ) as client:
                resp = await client.get(video_url, headers=headers)
                resp.raise_for_status()
                data = resp.content
                ctype = resp.headers.get("content-type", "")
            # 유효 비디오면 저장하고 끝. 아니면(전환기 poster/부분 파일) 잠깐 뒤 재다운로드: CDN 에
            #   full mp4 가 올라오면 수 초 내 수렴한다. 끝내 유효하지 않으면 예외(씬 재렌더로 폴백, 깨진 클립 미저장).
            if "video" in ctype.lower() and len(data) >= _MIN_VIDEO_BYTES:
                with open(out_path, "wb") as f:
                    f.write(data)
                return
            last = f"content-type={ctype!r} bytes={len(data)}"
            logger.warning(
                "xAI 영상이 아직 준비 안 됨(재시도 %d/%d): %s", attempt, _DOWNLOAD_TRIES, last
            )
            if attempt < _DOWNLOAD_TRIES:
                await self._wait(self._poll_interval)
        raise RuntimeError(f"xAI 영상 다운로드가 유효한 비디오가 아닙니다({last}): {video_url}")


def _auth(api_key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {api_key}"}


def _clamp_duration(value: Any) -> int:
    try:
        d = round(float(value))
    except (TypeError, ValueError):
        d = _MIN_DUR
    return max(_MIN_DUR, min(_MAX_DUR, d))


def _image_data_uri(path: str) -> str:
    mime = mimetypes.guess_type(path)[0] or "image/png"
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    return f"data:{mime};base64,{b64}"
