"""Wan 2.2 TI2V-5B ComfyUI 워크플로 템플릿(API 포맷): T2V / I2V(=TI2V) 세트.

Wan 2.2 TI2V-5B 는 단일 모델이 세 모드를 다 한다. ComfyUI 그래프상 차이는 시작 이미지뿐:
- T2V(텍스트→영상): `Wan22ImageToVideoLatent` 를 start_image 없이 → 순수 노이즈 + 텍스트 조건.
- I2V/TI2V(이미지[+텍스트]→영상): `LoadImage` → `Wan22ImageToVideoLatent.start_image` 연결.
  (TI2V = 프롬프트 + 이미지 = I2V 그래프. 프롬프트는 두 모드 다 사용.)
둘 다 video-ai-server GPU 에서 검증됨(1280x704 h264, ComfyUI 오프로딩으로 16GB 여유).

플레이스홀더(어댑터가 잡마다 치환): __PROMPT__, __NEGATIVE__, __FRAMES__(int), __SEED__(int) , 
  __WIDTH__/__HEIGHT__(int, 기본 1280x704 가로: 세로 쇼츠는 704x1280 등으로 주입), __IMAGE__(I2V 만, LoadImage.image).

이 모듈은 모델별 워크플로 세트의 표준 형태다({"t2v": {...}, "i2v": {...}}). 새 ComfyUI 모델
(예: LTX)을 추가할 땐 같은 형태의 세트를 만들어 worker 레지스트리에 provider key 로 등록하면
어댑터(ComfyUIVideoGenProcessing)는 그대로 재사용된다.

코드에 임베드(파이썬 dict) → 워커 이미지에 확실히 포함(데이터파일 패키징 불확실성 회피).
"""

from __future__ import annotations

from typing import Any


def _unet_loader(unet_name: str) -> dict[str, Any]:
    """unet 파일명으로 로더를 고른다. `*.gguf` 면 GGUF 로더, 그 외는 코어 UNETLoader.

    GPU 공유 때문에 양자화가 기본이다: 이 GPU 는 이미지(FLUX)와 함께 쓰고, 원본 정밀도로는 둘의
    합이 VRAM 을 넘어 번갈아 올 때마다 전체 교체가 일어난다. 되돌리려면 env(WAN_UNET_NAME)에
    `*.safetensors` 를 주면 이 함수가 코어 로더를 쓴다. 측정값/근거는 런북:
    infra/docker/design-image-comfyui.md (공유 GPU 운영 정책).
    """
    if unet_name.lower().endswith(".gguf"):
        return {"class_type": "UnetLoaderGGUF", "inputs": {"unet_name": unet_name}}
    return {"class_type": "UNETLoader", "inputs": {"unet_name": unet_name, "weight_dtype": "default"}}


def _wan22_ti2v_5b(*, with_image: bool, unet_name: str) -> dict[str, Any]:
    """Wan 2.2 TI2V-5B 워크플로 1개 생성. with_image=False → T2V, True → I2V/TI2V."""
    wf: dict[str, Any] = {
        "37": _unet_loader(unet_name),
        # device="cpu": umt5(6.3GB)를 GPU 에 올리면 그 피크가 상주 중인 이미지 모델을 밀어낸다.
        #   프롬프트 인코딩은 씬당 1회라 CPU 로도 부담이 작다(교체 비용보다 훨씬 싸다).
        "38": {"class_type": "CLIPLoader", "inputs": {"clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan", "device": "cpu"}},
        "39": {"class_type": "VAELoader", "inputs": {"vae_name": "wan2.2_vae.safetensors"}},
        "48": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["37", 0], "shift": 8}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": "__PROMPT__", "clip": ["38", 0]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": "__NEGATIVE__", "clip": ["38", 0]}},
        "55": {"class_type": "Wan22ImageToVideoLatent", "inputs": {"vae": ["39", 0], "width": "__WIDTH__", "height": "__HEIGHT__", "length": "__FRAMES__", "batch_size": 1}},
        "3": {"class_type": "KSampler", "inputs": {"model": ["48", 0], "seed": "__SEED__", "steps": 20, "cfg": 5, "sampler_name": "uni_pc", "scheduler": "simple", "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["55", 0], "denoise": 1}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["39", 0]}},
        "57": {"class_type": "CreateVideo", "inputs": {"images": ["8", 0], "fps": 24}},
        "58": {"class_type": "SaveVideo", "inputs": {"video": ["57", 0], "filename_prefix": "video/csc", "format": "auto", "codec": "auto"}},
    }
    if with_image:
        wf["56"] = {"class_type": "LoadImage", "inputs": {"image": "__IMAGE__"}}
        wf["55"]["inputs"]["start_image"] = ["56", 0]
    return wf


def build_wan22_workflows(unet_name: str) -> dict[str, dict[str, Any]]:
    """모델별 워크플로 세트: 어댑터가 모드로 골라 쓴다(mode "ti2v" 는 "i2v" 로 정규화)."""
    return {
        "t2v": _wan22_ti2v_5b(with_image=False, unet_name=unet_name),
        "i2v": _wan22_ti2v_5b(with_image=True, unet_name=unet_name),
    }
