"""자체 호스팅 이미지 생성(ComfyUI 백엔드) ImageGenerationPort 어댑터: 모델-불문.

video-model 의 ComfyUIVideoGenProcessing 과 동형: 워크플로 제출 → 완료 폴링 → 결과 이미지 다운로드.
반환만 파일 경로가 아니라 base64(휘발 data URL 파이프라인). 무거운 GPU 는 ComfyUI 컨테이너에 격리되고
이 어댑터는 httpx 로 HTTP 만 호출한다(torch 미탑재).

모델-불문 설계: 이 어댑터는 ComfyUI HTTP 프로토콜만 안다. 모델 고유 부분(워크플로)은 생성자
`workflow`(FLUX schnell txt2img 그래프)로 주입받는다. 새 모델(SDXL 등) = 워크플로 세트만 바꾸면 재사용.
서버 이동 대비: 엔드포인트는 `base_url`(IMAGE_COMFYUI_URL env): image-ai-server 로 가도 env 만 변경.

공유 `ServiceHttpClient`(csc_net_utils)를 쓰지 않는다: 그 클라이언트는 X-Service-Token 을 주입하고
JSON 만 다루는데, ComfyUI 는 우리 서비스가 아니고(토큰 불필요) `/view` 가 바이너리를 준다. 대신
연결 재시도는 벤더 공용 클라이언트(`app.shared.adapters.outbound.http.client`)에서 얻는다.

플레이스홀더(워크플로에 심어 두면 잡마다 치환): __PROMPT__, __NEGATIVE__, __WIDTH__(int) , 
  __HEIGHT__(int), __SEED__(int), __STEPS__(int). 없으면 해당 치환은 무시된다.
"""

from __future__ import annotations

import asyncio
import base64
import copy
import random
from typing import Any

import httpx

from app.shared.adapters.outbound.http.client import create_http_client

from ....core.domain.image_failure import ImageFailure, ImageGenerationFailedError
from ....core.domain.types import (
    ImageEngineLoadRecord,
    ImageGenerationRequestRecord,
    ImageGenerationResultRecord,
    ImageResultRecord,
)

_UNWIRED = (
    "자체 이미지 생성(ComfyUI)이 아직 배포되지 않았습니다(IMAGE_COMFYUI_URL 미설정). "
    "GPU 호스트에 ComfyUI(FLUX)를 띄우고 IMAGE_COMFYUI_URL 을 설정하세요."
)

_IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp")
_POLL_INTERVAL_S = 1.5
# 부하 조회 타임아웃: 화면 표시용 보조 정보라 짧게 끊는다(느리면 없는 셈 치는 게 낫다).
_LOAD_TIMEOUT_S = 3.0


def _replace_placeholders(node: Any, mapping: dict[str, Any]) -> Any:
    """워크플로 JSON 을 재귀 순회하며 플레이스홀더 값(정확히 일치)을 매핑 값으로 치환(타입 보존)."""
    if isinstance(node, dict):
        return {k: _replace_placeholders(v, mapping) for k, v in node.items()}
    if isinstance(node, list):
        return [_replace_placeholders(v, mapping) for v in node]
    if isinstance(node, str) and node in mapping:
        return mapping[node]
    return node


def _parse_size(size: str, fallback: str) -> tuple[int, int]:
    """'1024x1536' → (1024, 1536). 파싱 실패 시 fallback."""
    for candidate in (size, fallback):
        parts = str(candidate or "").lower().split("x")
        if len(parts) == 2 and parts[0].strip().isdigit() and parts[1].strip().isdigit():
            return int(parts[0]), int(parts[1])
    return 1024, 1024


class ComfyUIImageGeneration:
    """ImageGenerationPort 구현: ComfyUI 백엔드(모델은 workflow 로 주입)."""

    def __init__(
        self,
        *,
        base_url: str,
        workflow: dict[str, Any],
        timeout: float,
        busy_timeout: float,
        default_size: str,
        default_steps: int,
        queue_front: bool = True,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._workflow = workflow
        self._timeout = timeout
        self._busy_timeout = busy_timeout
        self._default_size = default_size
        self._default_steps = default_steps
        self._queue_front = queue_front

    async def generate(
        self, req: ImageGenerationRequestRecord
    ) -> ImageGenerationResultRecord:
        if not self._base_url:
            raise ImageGenerationFailedError(ImageFailure.ENGINE_UNREACHABLE, _UNWIRED)
        width, height = _parse_size(req.size, self._default_size)
        seed = req.seed if req.seed is not None else random.randint(0, 2**32 - 1)
        workflow = _replace_placeholders(
            copy.deepcopy(self._workflow),
            {
                "__PROMPT__": req.prompt,
                "__NEGATIVE__": "",
                "__WIDTH__": width,
                "__HEIGHT__": height,
                "__SEED__": int(seed),
                "__STEPS__": self._default_steps,
            },
        )
        try:
            # 재시도는 제출뿐 아니라 /history 폴링과 /view 다운로드까지 모든 요청의 연결
            # 단계에 걸린다(손으로 감싸면 제출만 보호된다). 서버가 응답을 준 뒤의 실패는
            # 재시도 대상이 아니다. 그건 잡 상태로 판단해야 한다.
            async with create_http_client(
                base_url=self._base_url, timeout=self._timeout
            ) as client:
                prompt_id = await self._submit(client, workflow)
                ref = await self._await_output(client, prompt_id)
                data = await self._download(client, ref)
        except httpx.RequestError as exc:  # 연결/타임아웃 = 엔진 미기동/네트워크
            raise ImageGenerationFailedError(
                ImageFailure.ENGINE_UNREACHABLE, f"ComfyUI {self._base_url}: {exc}"
            ) from exc
        b64 = base64.b64encode(data).decode("ascii")
        return ImageGenerationResultRecord(images=[ImageResultRecord(b64=b64, mime="image/png")])

    async def load(self, provider: str | None = None) -> ImageEngineLoadRecord | None:
        """공유 큐 현황: 이 엔진은 GPU 1장으로 잡을 직렬 처리하므로 pending 이 곧 대기 줄이다.

        미배포(base_url 없음)/조회 실패는 None(=표시 안 함). 부하 표시는 보조 정보라 실패해도
        조용히 접는다. 이걸로 생성 흐름을 막거나 에러를 띄우면 배보다 배꼽이 커진다.
        """
        if not self._base_url:
            return None
        try:
            # retries=0: 부하 표시는 실패하면 접는 보조 정보다. 죽은 엔진을 한 번 더 두드려
            # 화면을 그만큼 더 기다리게 만들 이유가 없다(짧은 타임아웃과 같은 의도).
            async with create_http_client(
                base_url=self._base_url, timeout=_LOAD_TIMEOUT_S, retries=0
            ) as client:
                resp = await client.get("/queue")
                resp.raise_for_status()
                data = resp.json()
        except (httpx.HTTPError, ValueError):
            return None
        return ImageEngineLoadRecord(
            running=len(data.get("queue_running") or []),
            pending=len(data.get("queue_pending") or []),
        )

    # ---- 내부 ----

    async def _submit(self, client: httpx.AsyncClient, workflow: dict[str, Any]) -> str:
        """워크플로 제출: 대화형 잡은 큐 앞으로(front) 넣는다.

        이 엔진은 영상 렌더와 큐를 공유하고, 영상 씬 하나가 5분 넘게 걸린다. 이미지는 작업자가
        위저드에서 기다리는 중인 대화형 작업이라, 배치 렌더 뒤에 줄을 서면 혼잡 상한을 넘겨
        실패한다. 앞으로 보내면 이미지들이 한 덩어리로 처리되어 모델 교체도 줄어든다(상주 유지).
        실행 중인 잡은 끊지 못하므로 영상은 최대 한 씬만큼 밀린다(영상 대기 예산은 더 넉넉하다).

        같은 엔진을 dev/staging/prod 가 공유하므로 이 우선순위는 env 로 끌 수 있다(`queue_front`)
        dev 작업이 prod 렌더를 앞지르는 걸 막아야 할 때가 있다. 배경은 런북(공유 GPU 운영 정책).
        """
        payload: dict[str, Any] = {"prompt": workflow}
        if self._queue_front:
            payload["front"] = True
        resp = await client.post("/prompt", json=payload)
        if resp.status_code >= 400:
            raise ImageGenerationFailedError(
                ImageFailure.ENGINE_FAILED, f"/prompt {resp.status_code}: {resp.text[:200]}"
            )
        return resp.json()["prompt_id"]

    async def _await_output(
        self, client: httpx.AsyncClient, prompt_id: str
    ) -> dict[str, str]:
        """완료까지 폴링 후 첫 이미지 출력 참조({filename, subfolder, type})를 반환.

        공유 엔진을 전제한 대기다. ComfyUI 는 dev/staging/prod 가 함께 쓰는 GPU 1장이라 잡을 직렬
        처리한다. 내 잡이 남의 잡 뒤에서 기다리는 건 정상이다. 그래서 시계를 둘로 나눈다:

          - 큐에서 차례를 기다리는 시간 → `_busy_timeout` (혼잡). 실행 인내심을 소모하지 않는다.
          - 내 잡이 실제 실행되는 시간   → `_timeout`      (진짜 이상).

        하나의 총 시간으로 재면 큐가 깊어질 때마다 멀쩡한 잡을 포기하게 된다(엔진은 뒤늦게 완성해
        '성공'으로 기록 → 엔진 로그는 정상인데 화면만 실패). 환경을 분리하면 큐 대기가 짧아질 뿐,
        이 구조는 그대로 유효하다.
        """
        queued = 0.0
        running = 0.0
        while True:
            resp = await client.get(f"/history/{prompt_id}")
            resp.raise_for_status()
            entry = resp.json().get(prompt_id)
            if entry:
                status = entry.get("status", {})
                if status.get("status_str") == "error":
                    raise ImageGenerationFailedError(
                        ImageFailure.ENGINE_FAILED, f"잡 실패: {status}"
                    )
                ref = self._find_image_output(entry.get("outputs", {}))
                if ref:
                    return ref
            waiting_turn = await self._is_waiting_turn(client, prompt_id)
            await asyncio.sleep(_POLL_INTERVAL_S)
            if waiting_turn:
                queued += _POLL_INTERVAL_S
                if queued >= self._busy_timeout:
                    raise ImageGenerationFailedError(
                        ImageFailure.ENGINE_BUSY,
                        f"ComfyUI 큐 대기 {self._busy_timeout}s: {prompt_id}",
                    )
            else:
                # 실행 중이거나, 큐/히스토리 어디에도 없는 과도기(제출 직후, 완료 직전). 후자를 우리
                # 시간으로 세는 건 의도적이다. 잡이 조용히 사라진 경우가 여기서 걸린다.
                running += _POLL_INTERVAL_S
                if running >= self._timeout:
                    raise ImageGenerationFailedError(
                        ImageFailure.ENGINE_TIMEOUT, f"ComfyUI {self._timeout}s: {prompt_id}"
                    )

    async def _is_waiting_turn(self, client: httpx.AsyncClient, prompt_id: str) -> bool:
        """내 잡이 큐에서 차례를 기다리는 중인가(= 남의 잡이 앞에 있다).

        큐 조회 실패는 '대기 아님'으로 본다. 조회가 안 된다고 인내심을 무한정 늘리면, 잡이 사라져도
        영원히 기다리게 된다(실행 시계가 도는 편이 안전하다).
        """
        try:
            resp = await client.get("/queue")
            resp.raise_for_status()
            pending = resp.json().get("queue_pending", [])
        except (httpx.HTTPError, ValueError):
            return False
        # 큐 항목 = [번호, prompt_id, 워크플로, 부가정보, 출력노드]: prompt_id 는 [1](실물 확인).
        return any(
            isinstance(item, list) and len(item) > 1 and item[1] == prompt_id
            for item in pending
        )

    @staticmethod
    def _find_image_output(outputs: dict[str, Any]) -> dict[str, str] | None:
        for node_out in outputs.values():
            for items in node_out.values():
                if not isinstance(items, list):
                    continue
                for item in items:
                    fn = isinstance(item, dict) and item.get("filename")
                    if fn and fn.lower().endswith(_IMAGE_EXTS):
                        return item
        return None

    async def _download(self, client: httpx.AsyncClient, ref: dict[str, str]) -> bytes:
        resp = await client.get(
            "/view",
            params={
                "filename": ref["filename"],
                "subfolder": ref.get("subfolder", ""),
                "type": ref.get("type", "output"),
            },
        )
        resp.raise_for_status()
        return resp.content

    async def aclose(self) -> None:
        return None
