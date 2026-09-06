# ComfyUI (GPU): 자체 영상 생성(Wan 2.2 TI2V-5B I2V) 백엔드. video-ai-server RTX 5070 Ti.
#   video-model 워커가 HTTP(:8188)로 워크플로를 제출한다(worker 는 torch 미탑재, 이 컨테이너가 GPU 담당).
#   ComfyUI 코어가 Wan 2.2 를 네이티브 지원 → 커스텀노드 불필요.
#   모델/커스텀노드/워크플로/입출력은 호스트 볼륨 마운트(이미지에 미포함) → 이미지 재빌드 없이 모델 교체.
#   Blackwell(sm_120)이라 torch cu128 필수(cu124 미지원).
#
# 빌드: docker build -t csc/comfyui:staging -f infra/docker/comfyui/Dockerfile infra/docker/comfyui
FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# ComfyUI 소스(최신: Wan 2.2 네이티브 지원). 재현성 필요 시 특정 커밋으로 핀.
WORKDIR /opt
RUN git clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git
WORKDIR /opt/ComfyUI

# torch/torchvision/torchaudio 를 cu128(Blackwell)에서 함께 설치: 셋 다 같은 빌드여야 ABI 일치.
#   (torchaudio 를 빼면 requirements.txt 가 PyPI CPU torchaudio 를 끌어와 torch cu128 과 불일치 → import 실패.)
RUN pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128 \
 && pip install --no-cache-dir -r requirements.txt

# GGUF 양자화 모델 지원(ComfyUI-GGUF 커스텀 노드의 런타임 의존성).
#   왜 필요한가: 이 GPU 한 장을 영상(Wan)과 이미지(FLUX)가 공유한다. 원본 정밀도로는 합이 VRAM 을
#   넘어 번갈아 올 때마다 전체 교체가 일어난다(실측: FLUX 올인원 혼자 14.6GB). 양자화로 둘 다 상주시킨다.
#   노드 자체는 호스트 볼륨(custom_nodes/)에 두지만, 파이썬 패키지는 이미지에 있어야 재빌드 후에도 산다.
RUN pip install --no-cache-dir "gguf>=0.13.0"

# 모델/출력/워크플로는 호스트 볼륨(compose 에서 마운트): models/ custom_nodes/ output/ input/ user/
#   custom_nodes/ComfyUI-GGUF 는 호스트에 clone 해 둔다(런북: infra/docker/design-image-comfyui.md).
EXPOSE 8188
# --listen 0.0.0.0: 컨테이너 외부(같은 호스트 워커)에서 접근. 오프로딩은 ComfyUI 자동(16GB 여유).
CMD ["python", "main.py", "--listen", "0.0.0.0", "--port", "8188"]
