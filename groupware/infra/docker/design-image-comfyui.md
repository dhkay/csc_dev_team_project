# 설계/런북: 자체 호스팅 이미지 생성 (ComfyUI FLUX.1 schnell)

> 상태: **코드 + compose 배선 + GPU 호스트 모델 배치 완료.** 엔진에서 실제 생성까지 검증했다
> (FLUX 1024x1024 상주 5s / 콜드 20s, Wan 1280x704x121 311s).
> LAN 창구(ai 호스트 socat 8189, web-server 만 허용)도 열려 검증됐다. prod language-model 컨테이너에서
> `/system_stats` 200 확인. 남은 것은 **compose 변경분 배포**뿐이다(그 전까지 컨테이너에 `IMAGE_ENGINE` 이
> 없어 stub = 회색 placeholder 가 나온다).
>
> 공유 GPU 를 전제로 한 끊김 방지 정책은 아래 [공유 GPU 운영 정책](#공유-gpu-운영-정책--끊김-방지) 절 참고.

기획서 씬 이미지가 지금 외장 OpenAI(gpt-image) 하나뿐인데 조직 키가 billing hard limit 에 걸린다.
무료/무제한을 위해 **자체 호스팅(내장) 이미지 모델(FLUX.1 schnell)** 을 ComfyUI 백엔드로 추가한다.
영상(Wan/ComfyUI)과 동일 패턴: language-model 게이트웨이가 provider 로 라우팅하고, 무거운 GPU 는
ComfyUI 컨테이너에 격리, language-model 은 httpx 로 HTTP 만 호출한다.

## 배경 결정: ComfyUI (영상과 동형)

- 영상 자체 생성이 이미 ComfyUI 로 되어 있다(`video-model` 의 `ComfyUIVideoGenProcessing`). 이미지도 같은
  엔진/프로토콜을 쓰면 인프라/운영이 일관된다(`/prompt`→`/history` 폴링→`/view`).
- **모델 = FLUX.1 schnell**: Apache-2.0(상업 OK), 1~4스텝으로 빠름, 16GB 에 fp8/GGUF 로 적합.
- **내장/외장 구분**: LLM 이 자체 Qwen + 외장 Claude 로 나뉜 것과 동형. 이미지 = 내장 FLUX(comfyui) + 외장 OpenAI.

## GPU 배치 (갱신: GPU 스왑 이후)

위 문단은 스왑 **이전** 기준이었다. [design-gpu-swap-video.md](design-gpu-swap-video.md) 의 컷오버가 적용되어
현재 라이브는 **웹서버 5060Ti = vLLM(`csc-ai-vllm`, `--gpu-memory-utilization 0.90`)**,
**video-ai-server 5070Ti = ComfyUI(영상 Wan, `csc-ai-comfyui`)** 다.
→ **웹서버에는 이미지 엔진을 올릴 자리가 없다.** 별도 `comfyui-image` 컨테이너를 새로 띄우지 않고,
**video-ai-server 의 그 ComfyUI 를 이미지 엔진으로 겸용**한다(ComfyUI 는 워크플로마다 모델을 로드/언로드한다).

- **지금(now)**: 공유 `csc-ai-comfyui` 겸용: 컨테이너 추가 없이 모델 파일만 넣으면 된다.
  dev(`language-model/.env`)가 이미 같은 주소(`192.168.0.28:8188`)를 가리키고 있어 환경 간 모델이 일치한다.
- **동시 상주를 예산으로 만든다**: 양자화(FLUX Q4_K_S 약 6.3GB + Wan Q6_K 약 4.3GB) + 텍스트 인코더 CPU
  배치로 합을 약 12GB 에 맞춘다(아래 1번). 이게 없으면 이미지와 영상이 번갈아 올 때마다 전체 교체가
  일어난다. 느려지는 주된 원인이었다.
- **남는 트레이드오프**: 큐는 여전히 하나이므로 영상 렌더 중 이미지는 그 잡이 끝날 때까지 기다린다
  (영상은 씬 단위 잡이라 대기는 씬 하나 수준). 양자화만큼의 품질 손실도 감수한다.
- **정석(later)**: **전용 image-ai-server** 로 이전 → `IMAGE_COMFYUI_URL` **한 줄만** 그 호스트로 변경(코드 무변경, 영상의 `COMFYUI_URL` 과 동형).

## 코드 (완료: language-model)

| 파일 | 역할 |
|------|------|
| `.../adapters/outbound/image/routing.py` | `RoutingImageGeneration`: provider(openai/comfyui/stub)로 디스패치, 미등록은 default 폴백(텍스트 `RoutingInference` 동형). |
| `.../adapters/outbound/image/comfyui_image.py` | `ComfyUIImageGeneration`(ImageGenerationPort, **모델-불문**). 워크플로 주입 → `/prompt`→`/history` 폴링→`/view` → **base64** 반환. httpx 만. |
| `.../adapters/outbound/image/flux_schnell_workflow.py` | FLUX.1 schnell txt2img 워크플로 빌더. unet 파일명 확장자로 로더 선택(GGUF 분리 로딩 / 올인원 체크포인트). 배포 엔진에서 생성 검증 완료. |
| `.../adapters/outbound/image/stub.py` | `StubImageGeneration`: placeholder PNG(GPU 없이 dev/테스트 E2E). |
| `.../adapters/outbound/image/openai_image.py` | (기존) 외장 OpenAI. |
| `core/application/model_catalog.py` | image spec: `gpt-image`(openai) + `flux-schnell`(comfyui). `resolve_image_by_ref` 로 프론트 저장 id 흡수. |
| `module.py` | `build_image_generation` = `_build_image_adapters`(engine 로 comfyui/stub 선택) + `RoutingImageGeneration`. |
| `config.py` | `image_engine`(stub/comfyui), `image_comfyui_url`, `image_comfyui_timeout_s`(300), `image_default_steps`, `image_flux_unet_name`, `image_external_fallback`. |

일관성: `ImageGenerationRequestRecord.seed`: csc-marketing 이 **기획안 제목 기반 결정적 seed**(같은 기획안 씬끼리 동일)를
넘겨 FLUX 이미지의 씬 간 일관성을 높인다(외장 OpenAI 는 seed 미지원 → 무시). 프롬프트는 공유 스타일 앵커(브랜드/컨셉).

## 런북: 엔진 기동 (웹서버 5060Ti, 나중에 image-ai-server)

### 1) 모델 배치: 양자화로 영상과 동시 상주 (컨테이너 추가 없음)

video-ai-server 의 `csc-ai-comfyui` 를 그대로 쓴다. 모델 디렉터리는 호스트 볼륨(`${COMFYUI_DIR}`)이라
**파일만 넣으면 되고 컨테이너 재빌드도 필요 없다**(ComfyUI 는 제출 시점에 파일 목록을 스캔한다).

**핵심은 VRAM 예산이다.** 이 GPU 한 장을 영상과 이미지가 공유하므로, 원본 정밀도로는 둘이 동시에
못 있는다. 그러면 번갈아 올 때마다 전체 언로드/리로드가 일어나 "느리고 자주 실패하는" 상태가 된다.

| | 파일 | VRAM | 동시 상주 |
|---|---|---|---|
| 이전 (이미지) | `flux1-schnell-fp8.safetensors` 올인원 17GB | **14.6GB 실측** | 불가 (합 24GB) |
| 이전 (영상) | `wan2.2_ti2v_5B_fp16.safetensors` 9.4GB | 약 9.4GB | |
| **현재 (이미지)** | `unet/flux1-schnell-Q4_K_S.gguf` | 약 6.3GB | **가능 (합 약 12GB / 16.3GB)** |
| **현재 (영상)** | `unet/Wan2.2-TI2V-5B-Q6_K.gguf` | 약 4.3GB | |

여기에 **텍스트 인코더를 CPU 에 둔다**(`device="cpu"`). T5(4.6GB)와 umt5(6.3GB)를 GPU 에 올리면 그
순간의 피크가 상주 중인 다른 모델을 밀어내 교체가 다시 시작된다. 인코딩은 잡당 1회라 CPU 로도 싸다.

```bash
# video-ai-server 에서 (COMFYUI_DIR 기본 /home/escoa1/comfyui). 기존 파일은 지우지 않는다. 롤백 경로.
cd "${COMFYUI_DIR:-/home/escoa1/comfyui}"
mkdir -p models/unet models/text_encoders

# 양자화 unet 2개
curl -fL -C - -o models/unet/flux1-schnell-Q4_K_S.gguf \
  https://huggingface.co/city96/FLUX.1-schnell-gguf/resolve/main/flux1-schnell-Q4_K_S.gguf
curl -fL -C - -o models/unet/Wan2.2-TI2V-5B-Q6_K.gguf \
  https://huggingface.co/QuantStack/Wan2.2-TI2V-5B-GGUF/resolve/main/Wan2.2-TI2V-5B-Q6_K.gguf

# FLUX 분리 인코더(공식). Wan 인코더(umt5)는 이미 있다.
curl -fL -C - -o models/text_encoders/t5xxl_fp8_e4m3fn.safetensors \
  https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn.safetensors
curl -fL -C - -o models/text_encoders/clip_l.safetensors \
  https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors

# FLUX VAE: 공식 ae.safetensors 는 게이트(401)라, 올인원 체크포인트에서 추출한다(같은 가중치).
#   user/ 가 컨테이너에 마운트되므로 리포 스크립트를 거기 두고 컨테이너 안에서 실행한다.
cp <repo>/infra/docker/comfyui/extract_flux_vae.py user/
docker exec csc-ai-comfyui python /opt/ComfyUI/user/extract_flux_vae.py \
  /opt/ComfyUI/models/checkpoints/flux1-schnell-fp8.safetensors \
  /opt/ComfyUI/models/vae/flux_ae.safetensors

# GGUF 로더 노드(호스트 볼륨이라 영속). 파이썬 패키지는 이미지에 있다(comfyui/Dockerfile).
git clone --depth 1 https://github.com/city96/ComfyUI-GGUF.git custom_nodes/ComfyUI-GGUF
docker restart csc-ai-comfyui   # 커스텀 노드 로드
```

**롤백은 env 한 줄이다**: 워크플로가 unet 파일명의 확장자로 로더를 고른다:
`IMAGE_FLUX_UNET_NAME=flux1-schnell-fp8.safetensors`(올인원 그래프),
`WAN_UNET_NAME=wan2.2_ti2v_5B_fp16.safetensors`(코어 로더). 품질을 올리려면 더 큰 양자화(Q5_K_S/Q6_K)로.

### 2) 워크플로 (확정: 배포 엔진에서 검증됨)
`flux_schnell_workflow.build_flux_schnell_workflow()` 의 그래프를 실엔진에 그대로 제출해 생성까지 확인했다
(1024x1024, 4스텝). 코어 노드 + ComfyUI-GGUF 조합이라 별도 export 가 필요하지 않다.

- 로더: `UnetLoaderGGUF` → `DualCLIPLoader`(t5xxl + clip_l, type=flux, device=cpu) → `VAELoader`
- 본체: `CLIPTextEncode` x2 → `EmptySD3LatentImage` → `KSampler`(cfg 1.0, euler/simple) → `VAEDecode` → `SaveImage`
- 플레이스홀더(어댑터가 치환): `__PROMPT__`, `__NEGATIVE__`, `__WIDTH__`/`__HEIGHT__`, `__SEED__`, `__STEPS__`
- 출력은 `SaveImage`(png): 어댑터가 `/history` 출력에서 첫 이미지(.png)를 집어 `/view` 로 받는다.
- 모델/노드를 바꾸면 `/object_info/<노드>` 로 입력 스키마를 확인하고 그래프를 맞춘다.

### 3) language-model 배선 (완료: compose 에 들어있음)
staging/prod `web/docker-compose.yml` 의 `api-language-model` 이 이미 다음을 갖는다(오버라이드만 env 로):

```yaml
IMAGE_ENGINE: ${IMAGE_ENGINE:-comfyui}
IMAGE_COMFYUI_URL: ${IMAGE_COMFYUI_URL:-http://${AI_SERVER_HOST:-192.168.0.28}:8189}
IMAGE_COMFYUI_TIMEOUT_S: ${IMAGE_COMFYUI_TIMEOUT_S:-300}
```

- **방화벽/네트워크(완료)**: 호스트가 달라 도커 네트워크로는 못 닿는다 → ai 호스트의 socat 유닛
  `comfyui-web-forward.service`(8189, web-server 만 허용)가 창구다. 도커 publish 를 쓰지 않는 이유와
  새 소비자 추가 절차는 [README.md 보안 절](README.md#반대-방향--comfyui-web-server--video-ai-server) 참고.
- dev 컨테이너(`dev/web`)는 배선하지 않았다. 호스트 `pnpm dev` 가 `language-model/.env` 로 같은 엔진을 직접 가리킨다.
- **주의:** dev 에서 실엔진을 쓰려면 그 8188 이 개발 PC 에서도 닿아야 한다(현재 socat LAN 포워더 + ufw).

### 4) 검증
프론트 `aiModelOptions.ts` 의 `flux-schnell` 은 이미 `available: true` 다(플립 불필요).

```bash
# 1) ai 호스트에서 ComfyUI 가 살아있나
curl -s http://127.0.0.1:8188/system_stats | head -c 200   # ai 호스트 로컬
# 2) web-server 컨테이너에서 그 주소가 닿나 (방화벽/바인딩 확인: 여기서 막히면 위 3번)
docker exec csc-prod-api-language-model \
  python -c "import httpx;print(httpx.get('http://192.168.0.28:8189/system_stats',timeout=5).status_code)"
# 3) 실제 생성 (서비스토큰 필요)
curl -s -X POST http://127.0.0.1:4004/inference/images \
  -H "X-Service-Token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"organizationId":1,"model":"flux-schnell","prompt":"a bowl of strawberries on a wooden table"}' | head -c 300
```

- 그 다음 채널 환경설정 → 이미지 모델 = "자체 이미지 생성(FLUX.1 schnell)" → 기획서 STEP3 씬 이미지가 무료로 생성.
- 실패 시 사유가 화면에 그대로 뜬다: 연결 불가(엔진 미기동/방화벽), 생성 실패(체크포인트/노드 불일치), 혼잡(영상 렌더 중), 타임아웃.

## 공유 GPU 운영 정책: 끊김 방지

GPU 한 장(16.3GB)을 영상과 이미지가 공유한다. **동시 상주는 물리적으로 불가능하다**: 아래 실측이 이유다.

| 측정 | 값 |
|---|---|
| FLUX Q4_K_S 상주 | 7,138 MiB |
| Wan Q6_K 샘플링 / 피크 | 9,476 / **13,064** MiB (VAE 디코드) |
| Wan fp16 샘플링 / 피크 | 11,288 / **14,790** MiB (렌더 시간은 fp16 306s vs Q6_K 311s = 동일) |
| FLUX 생성 | 상주 5s, 콜드 20s (1024x1024, 4스텝) |
| Wan 렌더 | 311s (1280x704, 121프레임, 20스텝) |

영상 피크 13GB + FLUX 7.1GB = 20GB 이므로, 영상이 돌면 ComfyUI 가 이미지 모델을 내보낸다(정상 동작).
따라서 목표를 "교체 없애기" 가 아니라 **"교체가 있어도 끊기지 않기"** 로 잡고 다음을 적용했다.

1. **양자화로 예산 축소**: 이미지 14.6GB → 7.1GB, 영상 fp16 → Q6_K(피크 여유 9% → 20%).
   교체 후 재로드가 싸지고, 페이지 캐시 압박도 준다(모델 파일 17GB+9.4GB → 6.4GB+4.0GB).
2. **대화형 우선(`front: true`, env `IMAGE_COMFYUI_QUEUE_FRONT`)**: 이미지는 작업자가 화면에서
   기다리는 작업이라 큐 앞으로 넣는다. 같은 엔진을 세 환경이 공유하므로 dev 가 prod 렌더를 앞지르면
   안 될 때는 그 환경에서 false 로 끈다.
   실엔진 확인: 영상 잡 2건 뒤에 제출한 이미지가 두 번째 영상보다 앞에 섰다(실행 중인 영상은 유지).
   부수 효과로 이미지들이 한 덩어리로 처리되어 모델 교체 횟수가 줄어든다.
3. **실행 인내심 300s**: 모델 로드가 이 시계에 포함되므로(콜드 20s), 교체가 잦은 구간에서 멀쩡한
   잡을 포기하지 않게 한다. 큐 대기는 별도 시계(900s)가 맡는다.
4. **제출 재시도 1회**: 컨테이너 재기동 같은 순간 장애를 화면에 띄우지 않는다.
5. **외부 강등**: 혼잡/도달불가/타임아웃이면 조직 키로 외부 모델에 그린다(`IMAGE_EXTERNAL_FALLBACK`,
   기본 on). 과금이 따르므로 끌 수 있고, 끄면 그 구간은 실패로 남는다. 그래프/콘텐츠 문제는 강등하지 않는다.
6. **영상은 재개로 버틴다**: 이미지가 앞서면 영상이 밀리지만, COMPOSE 는 씬 체크포인트로 최대 10회
   재큐잉된다(`_MAX_RESUME_ATTEMPTS`). 밀림이 실패로 굳지 않는다.

의도적으로 **하지 않은 것**: 영상 `VAEDecodeTiled`(피크는 낮추지만 이 호스트의 GPU 소비자가 ComfyUI
하나뿐이라 13GB 피크가 실제로 실패를 만들지 않는다. 영상 품질 위험만 새로 생긴다),
FLUX Q3 이하(상주는 가능해지지만 이미지 품질 저하가 눈에 보인다).

근본 해결은 **전용 image-ai-server** 다(`IMAGE_COMFYUI_URL` 한 줄). 위 정책은 GPU 1장 제약 안에서
낭비를 줄이는 것이다.

## 롤백/폴백
- **회색 이미지가 보이면 `IMAGE_ENGINE` 이 stub 이라는 뜻이다**: 그 폴백은 dev 전용이다(1x1 회색 PNG).
  staging/prod compose 는 `comfyui` 를 기본값으로 명시하므로, 회색이 나오면 env 오버라이드를 먼저 확인한다.
- 엔진을 끄고 싶으면 `IMAGE_ENGINE=stub`(placeholder) 또는 채널 이미지 모델을 외장 OpenAI 로 변경. 외장은 GPU 무관하게 항상 독립 동작한다.
- `IMAGE_COMFYUI_URL` 빈 값이면 명시적 502(미배포): 조용히 넘어가지 않는다.

## 확장
- **새 이미지 벤더/엔진** = 어댑터 1개 + `_build_image_adapters` 레지스트리 한 줄 + 카탈로그 image spec.
- **모델 교체(SDXL 등)** = ComfyUI 워크플로 세트만 교체(어댑터 재사용).
- **image-ai-server 분리** = `IMAGE_COMFYUI_URL` 만 그 호스트로.
