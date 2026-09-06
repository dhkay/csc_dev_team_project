# 설계: vLLM ↔ 영상 생성 GPU 스왑 + Wan 2.2 TI2V-5B (ComfyUI I2V)

> 상태: **video-model 어댑터 코드 완료(ComfyUI HTTP 클라이언트, 테스트 통과).**
> 컷오버(ComfyUI/vLLM 컨테이너 배치, 모델/워크플로 provisioning, 프론트 flag)는 **아래 런북대로 GPU 서버에서 실행, 검증**한다(라이브 미적용).
>
> **관련(이미지 엔진):** 자체 호스팅 이미지 생성(ComfyUI FLUX.1 schnell)은 [design-image-comfyui.md](design-image-comfyui.md) 참고.
> 이미지 엔진은 language-model 게이트웨이가 provider 로 라우팅(내장 comfyui / 외장 openai)하며, 호스트는 `IMAGE_COMFYUI_URL`
> 로 추상화된다(웹서버 now → 전용 image-ai-server later). GPU 최종 배치가 웹=LLM/영상서버=영상으로 만석이면
> 이미지는 전용 image-ai-server 가 정석(이 문서의 단일 GPU 1워크로드 원칙과 동일).

## 목표

두 호스트의 16GB GPU를 워크로드에 맞게 재배치.

- **영상 생성(무거움) → video-ai-server RTX 5070 Ti**(더 빠른 카드, 무상태 compute 호스트).
- **LLM 추론(가벼움, 14B) → web-server RTX 5060 Ti**(유휴).
- 영상 모델 = **Wan 2.2 TI2V-5B**(5B, 고압축 VAE → 16GB 여유). **I2V(원본 이미지→영상)** 를 지원해야 함.

## 백엔드 결정: ComfyUI (diffusers 불가)

앞서 diffusers 인프로세스를 검토했으나 **I2V 필수 제약에서 뒤집혔다**:

| 모델 | I2V | 16GB | diffusers |
|---|---|---|---|
| **Wan 2.2 TI2V-5B** | 가능(네이티브) | 가능(~8GB 여유) | 불가. diffusers I2V 미지원([diffusers #13258](https://github.com/huggingface/diffusers/issues/13258)) |
| Wan 2.1 I2V-14B | 가능 | 주의. 14B bf16≈28GB → 양자화/sequential 오프로드(느림) | 가능 |
| Wan 2.2 I2V-A14B | 가능 | 불가. 27B(2 experts) → 16GB 빠듯 | 가능 |

**결론: 깨끗한 16GB I2V = TI2V-5B 뿐이고, 그 I2V는 diffusers 가 아니라 ComfyUI(네이티브)로만 된다.**
→ 백엔드 = **ComfyUI(GPU 컨테이너)** 에 위임. video-model 워커는 **httpx 로 HTTP 호출만**(torch 미탑재 → 워커 이미지는 기존 CPU 그대로, GPU 무게는 ComfyUI 컨테이너에 격리).

## 타깃 토폴로지

```
web-server (5060 Ti 16GB)                 video-ai-server (5070 Ti 16GB)
├─ csc-ai-vllm (공유 vLLM, :8010)         ├─ comfyui (GPU, Wan 2.2 TI2V-5B I2V, :8188)
│    ↑ 로컬 호출                           ├─ video-model-worker (CPU 이미지, httpx→comfyui)
├─ api-language-model (dev/staging/prod)  └─ metrics-agent
├─ api-video-model / DB / redis / qdrant
└─ 전 web/nestjs 앱 / nginx / metrics-agent

크로스호스트(기존): video-worker(ai) → redis/file/video-model API(web)
신규 크로스호스트: language-model(web) → csc-ai-vllm(web, 로컬)  ※ vLLM 이 web 로 이동
```

GPU 배정: **web = LLM만, ai = 영상(ComfyUI)만.** 각 호스트 단일 GPU 에 한 워크로드.

---

## Part B: video-model 어댑터 (모델-불문 ComfyUI, T2V/I2V/TI2V)

라우팅: 마케팅 기획 생성이 GENERATE 잡을 `params.provider="wan2.2-ti2v-5b"` 로 제출 → 워커가 ComfyUI 어댑터로 처리 → 결과 mp4 를 out_dir → file-service 업로드(기존 파이프라인 균일).

**모델-불문 설계(확장 대비):** 어댑터는 ComfyUI HTTP 프로토콜만 안다. 모델 고유 부분(워크플로)은 생성 시 **주입**한다. 새 ComfyUI 모델(LTX 등) = 그 모델의 워크플로 세트 + 레지스트리 1줄(어댑터 재사용). **서버 이동 대비**: 엔드포인트는 `COMFYUI_URL`(env) + `csc-ai` 도커 네트워크로 추상화 → 다른 호스트로 가도 env 만 변경(코드 무변경).

| 파일 | 내용 |
|---|---|
| `.../processing/comfyui_video_gen.py` | `ComfyUIVideoGenProcessing`(VideoProcessingPort, **모델-불문**). 모드 결정(t2v/i2v/ti2v) → (I2V면)`/upload/image` → 워크플로 플레이스홀더 치환 → `/prompt` → `/history` 폴링 → `/view` → out_dir. httpx 만. |
| `.../processing/wan22_workflows.py` | Wan 2.2 TI2V-5B 워크플로 세트 `{"t2v":…, "i2v":…}`(**코드 임베드**, ComfyUI Save-API-Format 플레이스홀더화). T2V=start_image 없음, I2V/TI2V=LoadImage→start_image. DRY 빌더. |
| `app/config.py` | `comfyui_url`, `comfyui_timeout_s`, `wan_provider_key`, `wan_num_frames`. 빈 url → 선택 시 명시적 에러(미배포). |
| `app/worker.py` | `s.wan_provider_key → ComfyUIVideoGenProcessing(workflows=WAN22_TI2V_5B_WORKFLOWS, …)`. |
| `tests/` | 플레이스홀더, 출력 탐색, T2V/I2V 빌드, 모드 결정, 미배포 에러 (14 passed). |

**모드(T2V/I2V/TI2V):** Wan 2.2 TI2V-5B 는 단일 모델이 세 모드를 다 한다. ComfyUI 그래프 차이는 start_image 뿐. 소스 이미지 유무(또는 명시적 `params["mode"]`)로 어댑터가 자동 선택. TI2V(텍스트+이미지)=I2V 그래프(프롬프트는 두 모드 다 사용). 플레이스홀더: `__PROMPT__`, `__NEGATIVE__`, `__FRAMES__`(int), `__SEED__`(int), `__IMAGE__`(I2V 만). T2V, I2V 모두 렌더 E2E 검증됨.

---

## 컷오버 런북 (GPU 서버에서 실행, 검증)

> 순서 중요: 먼저 vLLM 을 web 로 옮겨 **LLM 정상 확인** → video-ai-server GPU 확보 → ComfyUI 기동 → 렌더 검증 → 프론트 flag.
> staging 먼저 통과시키고 prod. (compose 변경은 이때 함께 커밋: 지금은 코드/문서만.)

### 1) vLLM → web-server 이전

- **staging/ai, prod/ai**: `vllm` 서비스 제거(→ GPU 를 ComfyUI 에 양보).
- **staging/web**: `vllm`(csc-ai-vllm) 추가: GPU(`runtime: nvidia` + device 예약), `8010:8000`, 모델/LoRA 마운트(가중치 ai→web 복사). 공유 싱글톤 유지.
- **language-model(dev/staging/prod/web)**: `INFERENCE_BASE_URL` 을 web-server 의 vLLM(`http://${VLLM_HOST:-192.168.0.26}:8010/v1`, 기본을 web-server IP 로)로 재배선. 기존 `AI_SERVER_HOST/AI_SERVER_VLLM_PORT` 네이밍은 `VLLM_HOST/VLLM_PORT` 로 정리.
- **방화벽**(`harden-firewall.sh`): video-ai-server `ai) PEER_PORTS` 에서 8010 제거. web-server 8010 은 호스트-로컬(같은 호스트 language-model 이 호출) → LAN 미노출.
- 검증: web-server 에서 vLLM `/v1/models` = qwen3-14b, 챗봇/기획 생성 정상.
- **로컬 개발 SSH 터널 재지정(주의)**: `ssh -fN -L 9010:localhost:8010 video-ai-server` → **web-server** 로 대상 변경.

### 2) ComfyUI 기동 (video-ai-server GPU)

- **staging/ai 에 `comfyui` 서비스 추가**(공유 싱글톤: 단일 GPU): GPU 예약 + `8188` + 볼륨(모델/커스텀노드/워크플로/출력). 예시:
  ```yaml
  comfyui:
    image: ${COMFYUI_IMAGE:-ghcr.io/ai-dock/comfyui:latest}   # 또는 자체 빌드
    container_name: csc-ai-comfyui
    volumes:
      - ${COMFYUI_MODELS_DIR:-/home/csc/comfyui/models}:/opt/ComfyUI/models
      - ${COMFYUI_NODES_DIR:-/home/csc/comfyui/custom_nodes}:/opt/ComfyUI/custom_nodes
    runtime: nvidia
    deploy: { resources: { reservations: { devices: [{ driver: nvidia, count: all, capabilities: [gpu] }] } } }
    ports: ["8188:8188"]
    restart: unless-stopped
  ```
- **provisioning(서버 수작업, 볼륨에 배치)**: ComfyUI + Wan 2.2 지원 커스텀노드, **Wan 2.2 TI2V-5B 모델 파일**(diffusion model + VAE + UMT5 text encoder), UI 에서 **I2V 워크플로** 작성 후 플레이스홀더 심어 export.
- **video-model-worker(ai)**: CPU 이미지 유지 + env 추가: staging/ai 워커는 `COMFYUI_URL=http://comfyui:8188`(동일 compose), prod/ai 워커는 공유 comfyui 를 호스트로(`http://host.docker.internal:8188` + extra_hosts) + `COMFYUI_WORKFLOW_PATH=/workflows/wan22-i2v.json` + 워크플로 볼륨 마운트.

### 3) 렌더 검증 → 프론트 flag

- 테스트 GENERATE 잡 1건(원본 이미지 → I2V mp4). 720p OOM 이면 프레임/해상도 낮춤(워크플로에서).
- `apps/web/groupware/.../aiModelOptions.ts` 의 `wan2.2-ti2v-5b` `available: true` 로 전환 → E2E.

## 리스크
- **prod LLM 중단창**(vLLM 재기동): 오프피크.
- **ComfyUI provisioning**(모델 수십 GB, 커스텀노드, 워크플로) = 서버 수작업. 워크플로 그래프가 실제 산출물.
- **공유 comfyui**(staging 소유, prod 공유): 단일 GPU 제약상 vLLM 과 동일한 asymmetry. GPU 증설 후 분리.
- 첫 I2V 렌더 파라미터(프레임/해상도/스텝) 튜닝은 서버에서.
