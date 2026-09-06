"""ComfyUI 영상 생성 어댑터의 순수 로직 테스트(네트워크 없음).

- _replace_placeholders: 워크플로 JSON 플레이스홀더 치환(타입 보존, 누락 무시).
- _find_video_output: node 출력에서 첫 영상 파일 참조 탐색(VHS gifs / SaveVideo videos).
"""

from __future__ import annotations

import json

import httpx
import pytest

from app.domains.video.adapters.outbound.processing.comfyui_video_gen import (
    ComfyUIVideoGenProcessing,
    _replace_placeholders,
)
from app.domains.video.adapters.outbound.processing.wan22_workflows import (
    build_wan22_workflows,
)

# 테스트가 쓰는 unet: 실배포 기본값은 config(WAN_UNET_NAME)가 소유하므로 여기선 명시한다.
_GGUF_UNET = "Wan2.2-TI2V-5B-Q6_K.gguf"
_WORKFLOWS = build_wan22_workflows(_GGUF_UNET)


def test_replace_placeholders_preserves_types_and_ignores_missing() -> None:
    wf = {
        "3": {"inputs": {"text": "__PROMPT__", "seed": "__SEED__"}},
        "5": {"inputs": {"image": "__IMAGE__", "keep": "as-is", "frames": "__FRAMES__"}},
    }
    out = _replace_placeholders(
        wf,
        {"__PROMPT__": "고양이", "__SEED__": 42, "__IMAGE__": "in.png", "__FRAMES__": 121},
    )
    assert out["3"]["inputs"]["text"] == "고양이"
    assert out["3"]["inputs"]["seed"] == 42          # int 보존
    assert out["5"]["inputs"]["image"] == "in.png"
    assert out["5"]["inputs"]["frames"] == 121        # int 보존
    assert out["5"]["inputs"]["keep"] == "as-is"      # 비플레이스홀더 불변


def test_find_video_output_scans_vhs_and_savevideo() -> None:
    find = ComfyUIVideoGenProcessing._find_video_output
    vhs = {"9": {"gifs": [{"filename": "out_001.mp4", "subfolder": "", "type": "output"}]}}
    assert find(vhs)["filename"] == "out_001.mp4"

    save = {"12": {"videos": [{"filename": "clip.webm", "subfolder": "sub", "type": "output"}]}}
    ref = find(save)
    assert ref["filename"] == "clip.webm" and ref["subfolder"] == "sub"


def test_find_video_output_none_when_only_images() -> None:
    find = ComfyUIVideoGenProcessing._find_video_output
    only_png = {"7": {"images": [{"filename": "preview.png", "subfolder": "", "type": "output"}]}}
    assert find(only_png) is None


def _proc() -> ComfyUIVideoGenProcessing:
    return ComfyUIVideoGenProcessing(
        base_url="http://comfyui:8188",
        workflows=_WORKFLOWS,
        num_frames=121,
        timeout=10,
        busy_timeout=60,
    )


def test_build_i2v_workflow_injects_image() -> None:
    wf = _proc()._build_workflow(
        "i2v", {"prompt": "바다", "negative_prompt": "흐림", "num_frames": 49, "seed": 7}, "in.png"
    )
    assert wf["56"]["inputs"]["image"] == "in.png"          # LoadImage 존재
    assert wf["55"]["inputs"]["start_image"] == ["56", 0]   # I2V = start_image 연결
    assert wf["6"]["inputs"]["text"] == "바다"
    assert wf["55"]["inputs"]["length"] == 49               # int 보존
    assert wf["3"]["inputs"]["seed"] == 7
    assert "__" not in json.dumps(wf)
    # 원본 세트 불변(deepcopy)
    assert _WORKFLOWS["i2v"]["56"]["inputs"]["image"] == "__IMAGE__"


def test_build_t2v_workflow_has_no_image_node() -> None:
    wf = _proc()._build_workflow("t2v", {"prompt": "노을", "num_frames": 25, "seed": 3}, "")
    assert "56" not in wf                                    # LoadImage 없음
    assert "start_image" not in wf["55"]["inputs"]          # T2V = start_image 없음
    assert wf["6"]["inputs"]["text"] == "노을"
    assert wf["55"]["inputs"]["length"] == 25
    assert "__" not in json.dumps(wf)


def test_resolve_mode_auto_and_explicit() -> None:
    p = _proc()
    # 자동: 소스 이미지 유무
    assert p._resolve_mode({}, "img.png") == "i2v"
    assert p._resolve_mode({}, None) == "t2v"
    # 명시적: ti2v→i2v 정규화, t2v 강제
    assert p._resolve_mode({"mode": "ti2v"}, "img.png") == "i2v"
    assert p._resolve_mode({"mode": "t2v"}, "img.png") == "t2v"   # 이미지 있어도 T2V 강제
    # i2v 인데 이미지 없으면 에러
    with pytest.raises(ValueError):
        p._resolve_mode({"mode": "i2v"}, None)


# 공유 엔진 대기(ComfyUI 는 staging/prod 가 함께 쓰는 GPU 1장, 잡을 FIFO 직렬 처리)
#
# 남의 렌더 뒤에서 기다리는 건 정상이다. 이 대기를 '실행 인내심'으로 재면 남의 렌더가 길어질 때마다
# 멀쩡한 잡을 포기하게 된다. GPU 는 이미 쓰였는데 결과물만 버려진다.
# 영상은 렌더가 수 분이라 그 창이 훨씬 넓다. 아래가 두 시계의 분리를 고정한다.


def _mocked(handler, *, timeout: float, busy_timeout: float):
    proc = ComfyUIVideoGenProcessing(
        base_url="http://comfyui:8188",
        workflows=_WORKFLOWS,
        num_frames=121,
        timeout=timeout,
        busy_timeout=busy_timeout,
    )
    return proc, httpx.MockTransport(handler)


async def test_queue_wait_does_not_burn_render_patience(monkeypatch) -> None:
    # 큐에서 오래 대기하다 결국 완성되는 잡. 대기 20폴링 = 40s 로 실행 인내심(6s)을 한참 넘기므로,
    # 총 시간으로 쟀다면 TimeoutError 였다. 참조를 돌려받아야 분리가 지켜진 것이다.
    # (실행 예산은 폴링 간격 2s 의 배수로 잡는다. 1회 폴링에 소진되면 무엇을 쟀는지 흐려진다.)
    polls = {"n": 0}
    QUEUED = 20

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/queue":
            queued = polls["n"] < QUEUED
            return httpx.Response(
                200,
                json={
                    "queue_running": [[1, "other-env-render", {}, {}, []]],
                    "queue_pending": [[2, "pid-v", {}, {}, []]] if queued else [],
                },
            )
        if path == "/history/pid-v":
            polls["n"] += 1
            if polls["n"] <= QUEUED:
                return httpx.Response(200, json={})
            return httpx.Response(
                200,
                json={
                    "pid-v": {
                        "status": {"status_str": "success"},
                        "outputs": {"9": {"gifs": [{"filename": "o.mp4", "subfolder": "", "type": "output"}]}},
                    }
                },
            )
        raise AssertionError(f"unexpected path {path}")

    async def _no_sleep(_s: float) -> None:
        return None

    import app.domains.video.adapters.outbound.processing.comfyui_video_gen as mod

    monkeypatch.setattr(mod.asyncio, "sleep", _no_sleep)
    proc, transport = _mocked(handler, timeout=6.0, busy_timeout=300.0)
    async with httpx.AsyncClient(base_url="http://comfyui:8188", transport=transport) as client:
        ref = await proc._await_output(client, "pid-v")

    assert ref["filename"] == "o.mp4"
    assert polls["n"] > QUEUED  # 실제로 오래 대기했다


async def test_queue_wait_beyond_busy_cap_reports_congestion(monkeypatch) -> None:
    # 차례가 영영 오지 않으면 실패하되, 문구가 '내 잡이 느리다'가 아니라 '밀려 있다'여야 한다.
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/queue":
            return httpx.Response(
                200, json={"queue_running": [], "queue_pending": [[9, "pid-v", {}, {}, []]]}
            )
        if request.url.path == "/history/pid-v":
            return httpx.Response(200, json={})
        raise AssertionError("unexpected")

    async def _no_sleep(_s: float) -> None:
        return None

    import app.domains.video.adapters.outbound.processing.comfyui_video_gen as mod

    monkeypatch.setattr(mod.asyncio, "sleep", _no_sleep)
    proc, transport = _mocked(handler, timeout=900.0, busy_timeout=6.0)
    async with httpx.AsyncClient(base_url="http://comfyui:8188", transport=transport) as client:
        with pytest.raises(TimeoutError) as exc:
            await proc._await_output(client, "pid-v")

    assert "큐 대기 초과" in str(exc.value)


# ---- unet 로더 선택 (GPU 공유 대응) ----
#
# 이 GPU 는 이미지(FLUX)와 공유하므로 기본은 양자화 GGUF 다(근거는 런북). fp16 롤백 경로도 살아 있어야
# 한다. 그 분기는 파일 확장자 하나로 갈리므로, 실수로 뒤바뀌면 여기서 잡는다.


def test_gguf_unet_uses_gguf_loader() -> None:
    for mode in ("t2v", "i2v"):
        node = _WORKFLOWS[mode]["37"]
        assert node["class_type"] == "UnetLoaderGGUF"
        assert node["inputs"] == {"unet_name": _GGUF_UNET}


def test_safetensors_unet_falls_back_to_core_loader() -> None:
    wf = build_wan22_workflows("wan2.2_ti2v_5B_fp16.safetensors")
    node = wf["t2v"]["37"]
    assert node["class_type"] == "UNETLoader"
    assert node["inputs"]["weight_dtype"] == "default"


def test_text_encoder_stays_on_cpu() -> None:
    # umt5 를 GPU 에 올리면 그 피크가 상주 중인 이미지 모델을 밀어낸다 → 교체 재발.
    assert _WORKFLOWS["t2v"]["38"]["inputs"]["device"] == "cpu"
