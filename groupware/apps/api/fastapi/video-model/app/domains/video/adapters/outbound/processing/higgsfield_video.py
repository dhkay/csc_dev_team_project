"""외부 영상 생성(Higgsfield 플랫폼) ResumableVisualPort 어댑터.

Higgsfield 는 여러 회사의 영상 모델(Kling, Seedance, Veo 등)을 자기 API 하나로 중계한다. 그래서
이 어댑터는 하나뿐이고 어느 모델을 부를지는 호출마다 `params["model_path"]` 로 온다. 모델이
늘어도 이 파일도 워커 레지스트리도 바뀌지 않고 웹 카탈로그 한 줄만 늘어난다.

텍스트→영상이다. 씬 이미지를 입력으로 받지 않고 화면은 `params["prompt"]` 에서 만들어진다.
그래서 씬마다 다른 프롬프트가 반드시 필요하다. 같은 프롬프트를 주면 모든 씬이 같은 영상이 된다
(이미지→영상 어댑터는 씬 이미지가 그 구분을 해 줬다).

제출/폴링 2단계라 워커가 죽어도 request_id 로 재폴링해 재개한다(재작업 0).
조직마다 키가 다르고 stateless 싱글톤이라 키를 보관하지 않는다. 호출마다 `params["api_key"]` 로
헤더를 만들며, 값은 csc-marketing 이 `{키id}:{시크릿}` 으로 합쳐 보낸다(그쪽이 자격증명 필드를 안다).

Higgsfield 계약(docs.higgsfield.ai, 2026-08-26 확인):
  Authorization: Key {api_key_id}:{api_key_secret}
  POST {base}/{model_path}  {prompt, duration?, aspect_ratio?} -> {request_id, status, ...}
  GET  {base}/requests/{request_id}/status -> {status, video:{url}, error}
    status: queued | in_progress | completed | failed | nsfw | canceled
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

import logging
import os
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

from ....core.domain.errors import DeadVisualHandleError, PermanentRenderError
from ....core.domain.render_failure import RenderFailure
from .vendor_http import raise_for_vendor_status

logger = logging.getLogger(__name__)

# 우리 화면비 → Higgsfield 지원 aspect_ratio. 미지원 값은 가장 가까운 것으로 근사. 기본 9:16(쇼츠).
_ASPECT_MAP = {"9:16": "9:16", "16:9": "16:9", "1:1": "1:1", "4:5": "9:16"}
_DEFAULT_ASPECT = "9:16"
# duration 은 열거값이다(초). 대부분의 모델이 5 또는 10 만 받는다(모델별 표는 아래).
_ALLOWED_DURATIONS = (5, 10)


@dataclass(frozen=True)
class _ModelParams:
    """이 모델이 받는 요청 파라미터.

    모델마다 다르다. 한 벌을 고정으로 보내면 받지 않는 모델에서 400 이 난다. 실제로 갈린다:
    Kling 2.1 만 aspect_ratio 를 받고, MiniMax 는 duration 열거가 (6, 10) 이며, Wan 은 resolution 을
    받는다. 출처는 벤더 OpenAPI 스키마(https://docs.higgsfield.ai/docs/openapi.json).
    """

    #: 받는 duration 열거값(초). 비어 있으면 그 모델은 길이를 받지 않는다(벤더 기본 길이로 만든다).
    durations: tuple[int, ...] = ()
    #: aspect_ratio 를 받는가. 받지 않으면 세로 영상을 지정할 수 없다(렌더가 가운데를 잘라 맞춘다).
    aspect_ratio: bool = False
    #: resolution 을 받는가(480p/720p).
    resolution: bool = False


# 모델 경로(카탈로그 key 에서 'higgsfield/' 를 뗀 값) → 그 모델이 받는 파라미터.
#
# 라이브 API 로 확인한 값이다(2026-09-01). 확인 절차는 열거값 밖의 길이를 보내는 것이다. 400 이
# 그 모델의 열거값을 알려 주고(`duration: 7 is not one of [5, 10]`), 다른 필드에 불만이 없으면 그
# 필드는 그 모델이 받는 것이다. 잡이 만들어지지 않아 과금이 없다.
#
# 그 400 을 '이 모델로 만들 수 있다' 로 읽지 말 것. 검증이 크레딧보다 먼저라, 유효한 본문을
# 보내야 비로소 크레딧 게이트(403 not_enough_credits)에 닿는다. 확인되는 것은 파라미터의 모양뿐이다.
#
# 여기 없는 모델은 프롬프트만 보내고, 대가가 있다. 세로(9:16)와 길이를 지정하지 못해 벤더
# 기본값(대개 가로)으로 만들어지고 렌더가 캔버스로 cover 크롭해 가운데만 남는다. 그래서 그 경로는
# 경고를 남긴다(_params_for). 조용한 화질 손실보다 흔적이 낫다.
#
# 대사 립싱크 셋(Kling 3.0 / Seedance 2.0 / Veo 3.1)이 없는 것은 확인할 수 없어서다. 벤더가
# 503(꺼짐)이나 403(크레딧)으로 막아 검증 응답 자체를 받을 수 없다(경로는 인식된다. 없는 모델은
# 404 다). 추측해 넣으면 첫 호출이 400 이거나, 더 나쁘게는 엉뚱한 값이 통과한다.
#
# 카탈로그에 없는 모델은 두지 않는다(닿지 않는 행이 된다). 확인해 둔 값만 남긴다.
#     minimax/hailuo-2.3/standard/text-to-video   durations=(6, 10)
#     wan-25-preview/text-to-video                durations=(5, 10), resolution=True
#   벤더 문서가 대사 생성을 말하지 않아 싣지 않았다. 다시 실을 때 재확인은 필요 없다.
_MODEL_PARAMS: dict[str, _ModelParams] = {
    "kling-video/v2.1/master/text-to-video": _ModelParams(durations=(5, 10), aspect_ratio=True),
    "kling-video/v2.5-turbo/pro/text-to-video": _ModelParams(durations=(5, 10)),
}
_PROMPT_ONLY = _ModelParams()
# 프롬프트 상한(벤더 스키마 maxLength). 넘기면 400 이라 우리가 먼저 자른다.
_MAX_PROMPT = 2500
# 씬 화면 묘사가 비었을 때의 폴백. 비워 보내면 벤더가 422 로 거절한다(prompt 는 required).
_FALLBACK_PROMPT = "A cinematic product marketing shot, smooth camera motion, high quality"
_POLL_INTERVAL_S = 5.0
# 벤더가 확정 실패로 못박는 상태. 같은 request_id 를 다시 폴링해도 영원히 같은 응답이라
#   전용 예외로 알려 호출부가 handle 을 버리고 다음 시도에 새로 제출하게 한다.
_DEAD_STATUSES = {"failed", "nsfw", "canceled"}
_MIN_VIDEO_BYTES = 100_000
_DOWNLOAD_TRIES = 8


class HiggsfieldVideoProcessing:
    """ResumableVisualPort 구현: Higgsfield 중계 텍스트→영상(조직 키/모델 경로는 params 로 주입)."""

    def __init__(
        self,
        *,
        base_url: str,
        timeout: float,
        poll_interval: float = _POLL_INTERVAL_S,
        # 폴링 대기의 sleep. 주입은 테스트용. 한도(간격, 429)는 이 어댑터가 모른다(ThrottledVisual 이 감싼다).
        sleep: Callable[[float], Awaitable[None]] | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._poll_interval = poll_interval
        self._sleep = sleep

    # ---- ResumableVisualPort ----
    def billable_seconds(self, params: dict[str, Any]) -> int | None:
        """이 씬이 벤더에 청구할 초: submit 이 보내는 값과 같은 식이다.

        같은 함수(_pick_duration)에 같은 모델 표를 넘기는 것이 핵심이다. 따로 계산하면 언젠가 둘이
        어긋나 청구서와 우리 기록이 조용히 달라진다.

        길이를 받지 않는 모델은 우리가 보낼 값이 없어 None 을 돌려준다(0 이 아니다: 0 은 '쟀는데
        0' 으로 읽힌다). 호출부가 그런 씬을 청구 초 합계에서 뺀다.
        """
        allowed = _params_for(params).durations
        return _pick_duration(params.get("duration_sec"), allowed) if allowed else None

    async def submit(self, params: dict[str, Any], source_path: str | None) -> str:
        """영상 생성을 제출하고 request_id 반환(즉시 체크포인트 → 재시작에도 재폴링 가능).

        `source_path`(씬 이미지)는 쓰지 않는다. 텍스트→영상 경로라 입력이 프롬프트뿐이다.
        호출부는 이 provider 에 이미지를 받으러 가지도 않는다(compose 가 그 fetch 를 건너뛴다).
        """
        api_key = self._require_key(params)
        model_path = self._require_model_path(params)
        # 그 모델이 받는 것만 싣는다. 받지 않는 파라미터를 보내면 400 이고, 그 실패는 잡이
        #   워커까지 간 뒤에야 드러난다(제출 전에 걸러 낼 방법이 없다).
        spec = _params_for(params)
        body: dict[str, Any] = {"prompt": _prompt_of(params)}
        if spec.durations:
            body["duration"] = _pick_duration(params.get("duration_sec"), spec.durations)
        if spec.aspect_ratio:
            body["aspect_ratio"] = _ASPECT_MAP.get(
                str(params.get("aspect_ratio") or ""), _DEFAULT_ASPECT
            )
        if spec.resolution:
            body["resolution"] = _resolution_of(params)
        async with httpx.AsyncClient(base_url=self._base_url, timeout=self._timeout) as client:
            resp = await client.post(model_path, json=body, headers=_auth(api_key))
            raise_for_vendor_status(resp, vendor="Higgsfield")
            data = resp.json()
        request_id = data.get("request_id")
        if not request_id:
            raise RuntimeError("Higgsfield 제출 응답에 request_id 가 없습니다")
        return str(request_id)

    async def poll_to_file(
        self, handle: str, out_dir: str, params: dict[str, Any] | None = None
    ) -> str:
        """request_id 완료까지 폴링(멱등) 후 결과 영상을 out_dir 로 받아 경로 반환. 재폴링에도 안전."""
        api_key = self._require_key(params or {})
        out_path = os.path.join(out_dir, "result.mp4")
        async with httpx.AsyncClient(base_url=self._base_url, timeout=self._timeout) as client:
            video_url = await self._await_done(client, handle, api_key)
            await self._download(video_url, out_path)
        return out_path

    # ---- 내부 ----
    async def _wait(self, seconds: float) -> None:
        # 주입된 sleep 이 없으면 asyncio 의 것을 호출 시점에 찾는다(생성 시점에 묶으면 monkeypatch 가 닿지 않는다).
        await (self._sleep or asyncio.sleep)(seconds)

    def _require_key(self, params: dict[str, Any]) -> str:
        key = str(params.get("api_key") or "").strip()
        if not key:
            # csc-marketing 이 키 있는 조직만 이 provider 로 라우팅 → 여기서 비면 배선/복호화 오류.
            # 영구 실패로 던진다. 배선은 재시도로 고쳐지지 않는데, 일반 실패로 두면 스위퍼가
            #   10번(간격 300초) 재큐잉해 화면이 50분 동안 '만드는 중' 이고 원인은 마지막에
            #   타임아웃 문구로 덮인다. 그 문구는 무엇을 고쳐야 하는지 말해 주지 않는다.
            raise PermanentRenderError(
                "Higgsfield: 조직 API 키가 없습니다(라우팅/복호화 확인)",
                failure=RenderFailure.CREDENTIAL_MISSING,
            )
        return key

    def _require_model_path(self, params: dict[str, Any]) -> str:
        """부를 모델 경로. 없으면 명시적으로 실패한다(임의 기본 모델로 대신 만들지 않는다).

        기본값을 두면 배선이 끊긴 날 사용자가 고르지 않은 모델로 영상이 만들어지고, 청구서가
        나오기 전까지 아무도 모른다. 고른 것과 다른 것을 조용히 만드는 것보다 실패가 낫다.
        """
        path = str(params.get("model_path") or "").strip()
        if not path:
            raise PermanentRenderError("Higgsfield: 모델 경로(model_path)가 없습니다(라우팅 확인)")
        return "/" + path.lstrip("/")

    async def _await_done(self, client: httpx.AsyncClient, request_id: str, api_key: str) -> str:
        """status 가 completed 가 될 때까지 폴링 → video.url 반환."""
        waited = 0.0
        while True:
            resp = await client.get(f"/requests/{request_id}/status", headers=_auth(api_key))
            raise_for_vendor_status(resp, vendor="Higgsfield")
            data = resp.json()
            status = str(data.get("status") or "")
            if status == "completed":
                url = (data.get("video") or {}).get("url")
                if not url:
                    raise RuntimeError(
                        f"Higgsfield 완료 응답에 video.url 이 없습니다: {request_id}"
                    )
                return str(url)
            if status in _DEAD_STATUSES:
                raise DeadVisualHandleError(
                    f"Higgsfield 영상 생성 실패({status}): {data.get('error') or status}"
                )
            await self._wait(self._poll_interval)
            waited += self._poll_interval
            if waited >= self._timeout:
                raise TimeoutError(f"Higgsfield 영상 생성 타임아웃({self._timeout}s): {request_id}")

    async def _download(self, video_url: str, out_path: str) -> None:
        """결과 영상을 받는다. 서명 URL 이라 인증 헤더를 붙이지 않는다.

        완료 직후에도 CDN 에 mp4 가 아직 다 올라오지 않아 작은 조각이 오는 일이 있다(Grok 에서 실측).
        유효 비디오가 될 때까지 재시도해, 깨진 클립이 이어붙이기 필터그래프를 터뜨리는 것을 막는다.
        """
        last = ""
        for attempt in range(1, _DOWNLOAD_TRIES + 1):
            async with httpx.AsyncClient(timeout=self._timeout, follow_redirects=True) as client:
                resp = await client.get(video_url)
                resp.raise_for_status()
                data = resp.content
                ctype = resp.headers.get("content-type", "")
            if "video" in ctype.lower() and len(data) >= _MIN_VIDEO_BYTES:
                with open(out_path, "wb") as f:
                    f.write(data)
                return
            last = f"content-type={ctype!r} bytes={len(data)}"
            logger.warning(
                "Higgsfield 영상이 아직 준비 안 됨(재시도 %d/%d): %s", attempt, _DOWNLOAD_TRIES, last
            )
            if attempt < _DOWNLOAD_TRIES:
                await self._wait(self._poll_interval)
        raise RuntimeError(f"Higgsfield 영상 다운로드가 유효한 비디오가 아닙니다({last}): {video_url}")


def _auth(api_key: str) -> dict[str, str]:
    """`Authorization: Key {id}:{secret}`. 값은 이미 합쳐진 채로 온다(합치는 곳은 csc-marketing)."""
    return {"Authorization": f"Key {api_key}"}


def _prompt_of(params: dict[str, Any]) -> str:
    """씬 화면 묘사 → 벤더 프롬프트. 비면 폴백, 길면 자른다(벤더 상한 초과는 400)."""
    prompt = str(params.get("prompt") or "").strip() or _FALLBACK_PROMPT
    return prompt[:_MAX_PROMPT]


def _params_for(params: dict[str, Any]) -> _ModelParams:
    """이 요청이 부를 모델이 받는 파라미터. 표에 없으면 프롬프트만 보낸다(경고를 남긴다).

    경고를 남기는 이유: 프롬프트만 보내면 요청은 성공하지만 세로와 길이를 지정하지 못한다.
    결과물은 대개 가로로 만들어져 캔버스 크롭으로 가운데만 남고, 그 손실은 영상을 봐야 드러난다.
    표에 한 줄을 더하라는 신호가 로그에 남아야 그 상태가 오래가지 않는다.
    """
    path = str(params.get("model_path") or "").strip().lstrip("/")
    spec = _MODEL_PARAMS.get(path)
    if spec is None:
        logger.warning(
            "Higgsfield 모델별 파라미터 표에 없는 모델입니다(프롬프트만 보냅니다): %s."
            " 세로(9:16)와 길이가 지정되지 않아 벤더 기본값으로 만들어집니다."
            " 벤더 스키마를 확인해 _MODEL_PARAMS 에 한 줄 추가하세요.",
            path or "(경로 없음)",
        )
        return _PROMPT_ONLY
    return spec


def _resolution_of(params: dict[str, Any]) -> str:
    """벤더에 요청할 화질. 잡의 화질을 그대로 쓰고, 모르는 값이면 기본(720p).

    낮은 화질로 만들어 우리가 키우지 않는 이유: 캔버스가 그 값으로 잡히므로 처음부터 목표 화질로
    받는 편이 생성 시간과 전송량에서 이득이다(요금은 대개 길이에만 비례한다).
    """
    value = str(params.get("resolution") or "").strip()
    return value if value in ("480p", "720p") else "720p"


def _pick_duration(value: Any, allowed: tuple[int, ...] = _ALLOWED_DURATIONS) -> int:
    """그 모델이 받는 열거값 중 요청 길이를 담을 수 있는 가장 짧은 값.

    반올림이 아니라 올림인 이유: 6초 나레이션에 5초 영상을 받으면 마지막 1초가 정지 프레임이 된다
    (fit_to_duration 이 마지막 프레임을 고정해 채운다). 길게 받아 잘라내는 편이 결과가 낫다.

    열거값이 모델마다 다르다(Kling 5/10, MiniMax 6/10). 그래서 인자로 받는다.
    """
    try:
        want = float(value)
    except (TypeError, ValueError):
        want = float(allowed[0])
    for value_ in allowed:
        if want <= value_:
            return value_
    return allowed[-1]
