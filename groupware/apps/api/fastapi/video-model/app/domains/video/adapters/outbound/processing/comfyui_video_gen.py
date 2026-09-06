"""자체 영상 생성(ComfyUI 백엔드) VideoProcessingPort 어댑터: 모델-불문.

GENERATE 잡을 ComfyUI 서버(GPU, video-ai-server)에 위임한다.

이 어댑터는 ComfyUI HTTP 프로토콜만 안다. 모델 고유 부분(워크플로)은 생성 시 `workflows`
(모드→그래프 세트)로 주입받으므로, 새 ComfyUI 모델(LTX 등)은 워크플로 세트만 만들어 worker
레지스트리에 provider key 로 등록하면 이 어댑터를 그대로 재사용한다.

모드는 소스 이미지 유무와 명시적 `params["mode"]` 로 고른다. `workflows` = {"t2v": ..., "i2v": ...}
이고 TI2V(텍스트+이미지)는 I2V 그래프를 쓴다(프롬프트는 두 모드 다 사용).

ComfyUI 를 쓰는 이유는 Wan 2.2 TI2V-5B I2V 가 diffusers 미지원(issue #13258)이고 ComfyUI 는
네이티브라서다. 무거운 GPU 는 그 컨테이너에 격리되고 이 워커는 torch 없이 httpx 만 쓴다.

플레이스홀더(워크플로에 심어 두면 잡마다 치환): __PROMPT__, __NEGATIVE__, __FRAMES__(int),
  __SEED__(int), __IMAGE__(I2V 만). 없으면 해당 치환은 무시된다.

결과는 반드시 out_dir 안 파일로 써서 ProcessedResult(path=...) 를 반환한다. URL 이나 바이트를
돌려주면 안 된다. worker 가 그 경로를 FileGatewayPort.store_result 로 업로드한다.
"""

from __future__ import annotations

import asyncio
import copy
import logging
import os
import random
from typing import Any

import httpx

from ....core.domain.types import ProcessedResult, VideoJobType

logger = logging.getLogger(__name__)

_UNWIRED = (
    "Wan(ComfyUI) 영상 생성이 아직 배포되지 않았습니다(comfyui_url 미설정). "
    "video-ai-server 에 ComfyUI(GPU)를 띄우고 COMFYUI_URL 을 설정하세요."
)

_VIDEO_EXTS = (".mp4", ".webm", ".mov", ".gif")
_POLL_INTERVAL_S = 2.0


def _replace_placeholders(node: Any, mapping: dict[str, Any]) -> Any:
    """워크플로 JSON 을 재귀 순회하며 플레이스홀더 값(정확히 일치)을 매핑 값으로 치환(타입 보존)."""
    if isinstance(node, dict):
        return {k: _replace_placeholders(v, mapping) for k, v in node.items()}
    if isinstance(node, list):
        return [_replace_placeholders(v, mapping) for v in node]
    if isinstance(node, str) and node in mapping:
        return mapping[node]
    return node


class ComfyUIVideoGenProcessing:
    """VideoProcessingPort(Protocol) 구현: ComfyUI 백엔드 영상 생성(모델은 workflows 로 주입)."""

    def __init__(
        self,
        *,
        base_url: str,
        workflows: dict[str, dict[str, Any]],
        num_frames: int,
        timeout: float,
        busy_timeout: float,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        # 모델별 워크플로 세트: {"t2v": {...}, "i2v": {...}}. 어댑터는 모드로 골라 쓴다.
        self._workflows = workflows
        self._num_frames = num_frames
        self._timeout = timeout
        self._busy_timeout = busy_timeout

    async def process(
        self,
        type: VideoJobType,
        params: dict[str, Any],
        source_path: str | None,
        out_dir: str,
    ) -> ProcessedResult:
        # 원샷 경로(직접 GENERATE 잡): 제출+폴링을 이어서 한다. COMPOSE 는 submit/poll 을 나눠 재개한다.
        if type != VideoJobType.GENERATE:
            raise ValueError("Wan(ComfyUI) 어댑터는 GENERATE 잡만 처리합니다")
        handle = await self.submit(params, source_path)
        out_path = await self.poll_to_file(handle, out_dir)
        file_name = params.get("file_name", "generated.mp4")
        return ProcessedResult(path=out_path, file_name=file_name, mime_type="video/mp4")

    # ---- ResumableVisualPort(재개 가능) ----
    async def submit(self, params: dict[str, Any], source_path: str | None) -> str:
        """렌더를 ComfyUI 에 제출하고 prompt_id 를 반환한다. 이 값을 영속해 두면 재시작해도 재폴링 가능."""
        if not self._base_url:
            raise NotImplementedError(_UNWIRED)
        mode = self._resolve_mode(params, source_path)
        async with httpx.AsyncClient(base_url=self._base_url, timeout=self._timeout) as client:
            image_name = (
                await self._upload_image(client, source_path)
                if mode == "i2v" and source_path
                else ""
            )
            workflow = self._build_workflow(mode, params, image_name)
            return await self._submit(client, workflow)

    async def poll_to_file(
        self, handle: str, out_dir: str, params: dict[str, Any] | None = None
    ) -> str:
        """prompt_id 의 완료를 기다려(멱등: ComfyUI history 폴링) 결과 영상을 받아 경로를 반환.

        재시작 후 같은 prompt_id 로 다시 불러도 안전하다: ComfyUI 는 렌더를 계속하거나 이미 저장해 뒀다.
        params 는 내부(ComfyUI) 어댑터엔 불필요. 계약 호환용으로 받되 무시한다.
        """
        if not self._base_url:
            raise NotImplementedError(_UNWIRED)
        out_path = os.path.join(out_dir, "result.mp4")
        async with httpx.AsyncClient(base_url=self._base_url, timeout=self._timeout) as client:
            output_ref = await self._await_output(client, handle)
            await self._download(client, output_ref, out_path)
        return out_path

    # ---- 내부 ----

    def _resolve_mode(self, params: dict[str, Any], source_path: str | None) -> str:
        """생성 모드 결정: 명시적 params["mode"](t2v|i2v|ti2v) 우선, 없으면 소스 이미지 유무로 자동.

        TI2V(텍스트+이미지)는 I2V 그래프로 정규화한다(TI2V-5B 는 같은 그래프에 프롬프트가 붙는 것).
        """
        req = str(params.get("mode") or "").strip().lower()
        if req == "t2v":
            return "t2v"
        if req in ("i2v", "ti2v"):
            if not source_path:
                raise ValueError("i2v/ti2v 모드는 소스 이미지가 필요합니다")
            return "i2v"
        # 자동: 소스 이미지가 있으면 I2V(=TI2V), 없으면 T2V.
        return "i2v" if source_path else "t2v"

    def _build_workflow(
        self, mode: str, params: dict[str, Any], image_name: str
    ) -> dict[str, Any]:
        base = copy.deepcopy(self._workflows[mode])
        mapping: dict[str, Any] = {
            "__IMAGE__": image_name,
            "__PROMPT__": params.get("prompt", ""),
            "__NEGATIVE__": params.get("negative_prompt", ""),
            "__FRAMES__": int(params.get("num_frames", self._num_frames)),
            "__SEED__": int(params.get("seed", random.randint(0, 2**32 - 1))),
            # 해상도: 기본 1280x704(검증된 가로). 세로 쇼츠는 compose 가 width/height 를 주입(예: 704x1280).
            "__WIDTH__": int(params.get("width", 1280)),
            "__HEIGHT__": int(params.get("height", 704)),
        }
        return _replace_placeholders(base, mapping)

    async def _upload_image(self, client: httpx.AsyncClient, source_path: str) -> str:
        with open(source_path, "rb") as f:
            data = f.read()
        resp = await client.post(
            "/upload/image",
            files={"image": (os.path.basename(source_path), data, "application/octet-stream")},
            data={"overwrite": "true"},
        )
        resp.raise_for_status()
        body = resp.json()
        # ComfyUI 는 subfolder 가 있으면 "sub/name" 형태로 LoadImage 가 참조한다.
        name = body["name"]
        subfolder = body.get("subfolder") or ""
        return f"{subfolder}/{name}" if subfolder else name

    async def _submit(self, client: httpx.AsyncClient, workflow: dict[str, Any]) -> str:
        resp = await client.post("/prompt", json={"prompt": workflow})
        resp.raise_for_status()
        return resp.json()["prompt_id"]

    async def _await_output(
        self, client: httpx.AsyncClient, prompt_id: str
    ) -> dict[str, str]:
        """완료까지 폴링 후 첫 영상 출력 참조({filename, subfolder, type})를 반환.

        공유 엔진을 전제한 대기다. ComfyUI(csc-ai-comfyui)는 staging/prod 가 함께 쓰는 GPU 1장이고
        잡을 FIFO 로 직렬 처리한다. 내 잡이 남의 렌더 뒤에서 기다리는 건 정상이다. 그래서 시계를 둘로
        나눈다: 큐 대기(_busy_timeout) vs 내 잡의 실제 실행(_timeout).

        하나의 총 시간으로 재면 남의 렌더가 길어질 때마다 멀쩡한 잡을 포기한다. 엔진은 뒤늦게 완성하므로
        GPU 는 이미 쓰였고 결과물만 버려진다. 영상은 렌더가 수 분이라 이 창이 이미지보다 훨씬 넓다.
        (이미지 경로 comfyui_image._await_output 과 같은 모델.)
        """
        queued = 0.0
        running = 0.0
        while True:
            resp = await client.get(f"/history/{prompt_id}")
            resp.raise_for_status()
            history = resp.json()
            entry = history.get(prompt_id)
            if entry:
                status = entry.get("status", {})
                if status.get("status_str") == "error":
                    raise RuntimeError(f"ComfyUI 잡 실패: {status}")
                ref = self._find_video_output(entry.get("outputs", {}))
                if ref:
                    return ref
            waiting_turn = await self._is_waiting_turn(client, prompt_id)
            await asyncio.sleep(_POLL_INTERVAL_S)
            if waiting_turn:
                queued += _POLL_INTERVAL_S
                if queued >= self._busy_timeout:
                    raise TimeoutError(
                        f"ComfyUI 큐 대기 초과({self._busy_timeout}s, 다른 작업이 밀려 있음): {prompt_id}"
                    )
            else:
                # 실행 중이거나 과도기(제출 직후, 완료 직전). 후자를 우리 시간으로 세는 건 의도적이다
                # 잡이 조용히 사라진 경우가 여기서 걸린다.
                running += _POLL_INTERVAL_S
                if running >= self._timeout:
                    raise TimeoutError(f"ComfyUI 잡 타임아웃({self._timeout}s): {prompt_id}")

    async def _is_waiting_turn(self, client: httpx.AsyncClient, prompt_id: str) -> bool:
        """내 잡이 큐에서 차례를 기다리는 중인가(= 남의 잡이 앞에 있다).

        큐 조회 실패는 '대기 아님'으로 본다. 조회가 안 된다고 인내심을 무한정 늘리면 잡이 사라져도
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
    def _find_video_output(outputs: dict[str, Any]) -> dict[str, str] | None:
        """node 출력들에서 첫 영상 파일 참조를 찾는다(VHS 'gifs' / SaveVideo 'videos' / 'images')."""
        for node_out in outputs.values():
            for items in node_out.values():
                if not isinstance(items, list):
                    continue
                for item in items:
                    fn = isinstance(item, dict) and item.get("filename")
                    if fn and fn.lower().endswith(_VIDEO_EXTS):
                        return item
        return None

    async def _download(
        self, client: httpx.AsyncClient, ref: dict[str, str], out_path: str
    ) -> None:
        resp = await client.get(
            "/view",
            params={
                "filename": ref["filename"],
                "subfolder": ref.get("subfolder", ""),
                "type": ref.get("type", "output"),
            },
        )
        resp.raise_for_status()
        with open(out_path, "wb") as f:
            f.write(resp.content)
