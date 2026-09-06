"""FLUX.1 schnell txt2img ComfyUI 워크플로(API 포맷, 플레이스홀더 임베드).

모델 고유 그래프를 코드에 임베드하고 잡마다 치환할 값만 플레이스홀더로 남긴다. 어댑터는
ComfyUI HTTP 만 알고 이 그래프를 주입받는다(video-model 의 wan22_workflows.py 와 같은 모양).

플레이스홀더: __PROMPT__, __NEGATIVE__, __WIDTH__(int), __HEIGHT__(int), __SEED__(int), __STEPS__(int).

분리 로딩(unet + 인코더 + VAE)인 것은 영상과 GPU 를 공유하기 때문이다. 올인원 체크포인트는
그것만으로 VRAM 대부분을 점유해 영상 모델과 번갈아 올 때마다 전체 교체를 유발했다. 그래서 unet 은
양자화(GGUF)로 줄이고 텍스트 인코더는 CPU 에 둬(`device="cpu"`) VRAM 피크를 없앤다.

`build_flux_schnell_workflow(unet_name)` 가 확장자로 로더를 고른다.
  - `*.gguf`        → `UnetLoaderGGUF` + 분리 인코더/VAE
  - `*.safetensors` → `CheckpointLoaderSimple` (올인원 체크포인트 = 이전 동작으로 롤백)

기본값은 config(IMAGE_FLUX_UNET_NAME)가 소유한다. 여기 두면 두 곳이 어긋난다.
측정값과 양자화 선택 근거와 롤백 절차는 런북에 있다: infra/docker/design-image-comfyui.md
"""

from __future__ import annotations

from typing import Any

# 분리 로딩에 쓰는 보조 파일: unet 과 달리 크기/품질 선택지가 없어 상수로 둔다.
#   (ai 호스트 ~/comfyui/models/{text_encoders,vae}/ 에 배치)
_T5_NAME = "t5xxl_fp8_e4m3fn.safetensors"
_CLIP_L_NAME = "clip_l.safetensors"
_VAE_NAME = "flux_ae.safetensors"


def _sampler_tail(model_ref: list[Any], clip_ref: list[Any], vae_ref: list[Any]) -> dict[str, Any]:
    """조건 인코딩 → 샘플링 → 디코딩 → 저장. 로더 구성과 무관한 공통 뒷부분.

    schnell 은 distilled 라 CFG 1.0 + 4스텝 권장(steps 는 __STEPS__ 로 주입).
    """
    return {
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": "__PROMPT__", "clip": clip_ref}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": "__NEGATIVE__", "clip": clip_ref}},
        "4": {
            "class_type": "EmptySD3LatentImage",
            "inputs": {"width": "__WIDTH__", "height": "__HEIGHT__", "batch_size": 1},
        },
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "seed": "__SEED__",
                "steps": "__STEPS__",
                "cfg": 1.0,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": 1.0,
                "model": model_ref,
                "positive": ["2", 0],
                "negative": ["3", 0],
                "latent_image": ["4", 0],
            },
        },
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": vae_ref}},
        "7": {
            "class_type": "SaveImage",
            "inputs": {"filename_prefix": "plan_scene", "images": ["6", 0]},
        },
    }


def build_flux_schnell_workflow(unet_name: str) -> dict[str, Any]:
    """unet 파일명으로 그래프를 만든다(확장자가 로더를 결정: 위 모듈 docstring 참고)."""
    if unet_name.lower().endswith(".gguf"):
        loaders: dict[str, Any] = {
            "1": {"class_type": "UnetLoaderGGUF", "inputs": {"unet_name": unet_name}},
            # device="cpu": 인코딩을 CPU 에서 해 VRAM 피크를 없앤다(상주 유지의 핵심).
            "10": {
                "class_type": "DualCLIPLoader",
                "inputs": {
                    "clip_name1": _T5_NAME,
                    "clip_name2": _CLIP_L_NAME,
                    "type": "flux",
                    "device": "cpu",
                },
            },
            "11": {"class_type": "VAELoader", "inputs": {"vae_name": _VAE_NAME}},
        }
        return {**loaders, **_sampler_tail(["1", 0], ["10", 0], ["11", 0])}

    # 올인원 체크포인트: 로더 하나가 model/clip/vae 를 모두 제공(이전 동작, 롤백 경로).
    loaders = {"1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": unet_name}}}
    return {**loaders, **_sampler_tail(["1", 0], ["1", 1], ["1", 2])}
