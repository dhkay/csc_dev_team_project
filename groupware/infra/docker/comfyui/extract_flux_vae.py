"""FLUX 올인원 체크포인트에서 VAE 만 추출해 표준 레이아웃으로 저장.

추출하는 이유. 분리 로딩(GGUF unet + 인코더 + VAE)에는 독립 VAE 파일이 필요한데, 공식
`black-forest-labs/FLUX.1-schnell/ae.safetensors` 는 게이트되어 있다(토큰 없이 401). 우리는 이미 올인원
`flux1-schnell-fp8.safetensors`(T5/CLIP/VAE 포함)를 갖고 있으므로, 거기서 같은 가중치를 꺼낸다
출처가 확실하고 다운로드가 없다.

`vae.` 접두사를 떼어 공식 ae.safetensors 와 같은 bare 키(`encoder.` / `decoder.`)로 만든다.
safetensors 만 쓰며 GPU 도 torch 연산도 필요 없다. ComfyUI 컨테이너 안에서 실행한다.

사용법 (video-ai-server):
    cp infra/docker/comfyui/extract_flux_vae.py "${COMFYUI_DIR:-$HOME/comfyui}/user/"
    docker exec csc-ai-comfyui python /opt/ComfyUI/user/extract_flux_vae.py \
        /opt/ComfyUI/models/checkpoints/flux1-schnell-fp8.safetensors \
        /opt/ComfyUI/models/vae/flux_ae.safetensors

런북: infra/docker/design-image-comfyui.md
"""

from __future__ import annotations

import sys

from safetensors import safe_open
from safetensors.torch import save_file

_PREFIX = "vae."


def main(src: str, dst: str) -> None:
    tensors = {}
    with safe_open(src, framework="pt", device="cpu") as f:
        for key in f.keys():
            if key.startswith(_PREFIX):
                tensors[key[len(_PREFIX):]] = f.get_tensor(key)

    if not tensors:
        raise SystemExit(
            f"{src} 에서 '{_PREFIX}' 접두사 텐서를 찾지 못했습니다 "
            "(올인원 체크포인트가 아닐 수 있습니다)"
        )

    save_file(tensors, dst)
    total = sum(t.numel() * t.element_size() for t in tensors.values())
    print(f"저장 {dst}: {len(tensors)} tensors, {total / 2**30:.2f}GiB")
    print("키 예시:", sorted(tensors)[:3])


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(f"사용법: {sys.argv[0]} <올인원.safetensors> <출력_vae.safetensors>")
    main(sys.argv[1], sys.argv[2])
