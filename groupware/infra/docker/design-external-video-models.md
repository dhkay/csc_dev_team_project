# 외부 비디오 생성 모델 추가 설계 (video-model)

> 상태: **씨앗(seam) 구현 완료**: provider 레지스트리 + `ResumableVisualPort`(제출/폴링) + 체크포인트 재개가
> 이미 있다. 새 모델(Runway/Pika/Kling/Sora류/추가 ComfyUI 워크플로)은 **어댑터 1개 + 레지스트리 한 줄 + 설정**으로 붙는다.
> 이 문서는 그 방법과 계약을 못박는다. **투기성 스텁 코드는 두지 않는다**: 실제 모델을 붙일 때 이 절차대로 추가한다.

관련: [design-gpu-swap-video.md](./design-gpu-swap-video.md)(ComfyUI GPU 위임), `.claude/rules/system-architecture.md`(워커/큐 소유권).

---

## 큰 그림: 어디에 꽂히나

video-model 은 **provider 문자열로 처리 어댑터를 라우팅**한다. 두 계층이 있다:

| 라우팅 키 | 위치 | 무엇을 고르나 |
|-----------|------|--------------|
| `params.provider` | `_build_provider_registry` → `RoutingVideoProcessing` | 잡 최상위 처리기(예: `internal`=ffmpeg, `compose`=다중 씬 조합, `finalize`=최종 합성) |
| `params.scene_visual_provider` | `_build_compose_visual_registry` (COMPOSE 내부) | 씬 비주얼(이미지→무음 클립): `slideshow`(기본), `wan2.2-ti2v-5b`(ComfyUI) |

대부분의 "외부 비디오 생성 모델"은 **씬 비주얼**(image→클립, 또는 text→클립)이므로 두 번째 계층(compose visual registry)에 꽂힌다.
독립 잡 타입(예: 순수 T2V 한 방)이 필요하면 첫 번째 계층(provider registry)에 새 provider 로 꽂는다.

미등록/미배포 provider 는 **조용히 실패하지 않고** 기본값(slideshow)으로 폴백 + 경고 로그(`_pick_visual`): dev 에 GPU 없어도 파이프라인이 안 깨진다.

---

## 두 가지 어댑터 계약 (어느 걸 구현하나)

### 1. 동기형: `VideoProcessingPort.process`
호출→대기→결과 파일. 렌더가 짧거나(수 초) 로컬/결정적일 때(slideshow, 인포그래픽). 워커가 죽으면 그냥 다시 만든다.

```python
async def process(self, type, params, source_path, out_dir) -> ProcessedResult: ...
```

### 2. 비동기형(권장, 외부 호스티드 모델): `ResumableVisualPort`
제출→핸들(provider job id)→폴링. **워커가 죽어도 재제출 없이 같은 핸들로 재폴링**해서 진행 중/완료된 렌더를 회수한다
(GPU/유료 쿼터 재작업 0). ComfyUI(Wan) 가 이 계약의 레퍼런스 구현이다.

```python
@runtime_checkable
class ResumableVisualPort(Protocol):
    async def submit(self, params, source_path) -> str: ...          # 외부 엔진에 제출 → 핸들(job id)
    async def poll_to_file(self, handle, out_dir) -> str: ...          # 완료 대기(멱등) → 결과 파일 경로
```

compose 는 씬마다 핸들을 **씬 체크포인트(`SceneCheckpointPort`)** 에 영속한다 → 워커 재시작 시 완료 씬은 건너뛰고
진행 중 씬은 핸들로 재폴링(`ComposeProcessing._render_visual`). **비싸거나 유료인 외부 생성일수록 이 계약을 써야 한다.**

---

## 새 모델 X 추가 절차

1. **어댑터 작성**: `app/domains/video/adapters/outbound/processing/x_video_gen.py`.
   외부 호스티드면 `ResumableVisualPort`(submit/poll), 짧은 로컬이면 `VideoProcessingPort`. HTTP 는 httpx, 시크릿/URL 은 생성자 인자.
2. **팩토리 + 레지스트리 등록**: `app/worker.py`:
   - 씬 비주얼이면 `_build_compose_visual_registry` 에 `visual["x"] = _build_x(s)` (설정 있을 때만 등록 → 미배포 폴백 유지).
   - 독립 provider 면 `_build_provider_registry` 에 `registry["x"] = _build_x(s)`.
   - `_build_x(s)` 는 `_build_wan` 처럼 config 에서 base_url/api_key/timeout 을 읽어 어댑터를 만든다.
3. **설정 추가**: `app/config.py` 에 `x_base_url`/`x_api_key`/`x_timeout_s` (pydantic-settings, env 주입). compose worker 서비스 env 에 대응 키.
4. **라우팅 값 배선**: 채널/요청이 `scene_visual_provider="x"`(또는 `provider="x"`)를 보내게 한다(csc-marketing 쪽 선택지). 미지 값은 폴백.
5. **끝.** 큐/재시도/reconcile/STALLED/healthcheck 는 provider 무관하게 그대로 적용된다.

---

## 신뢰성 (이미 보장되는 것. 새 모델도 공짜로 상속)

- **워커 stateless + 재개**: 상태는 DB(video_jobs, API 소유) + 씬 체크포인트(redis). 워커가 죽어도 `reconcile_stale`(스위퍼)
  가 재개 가능한 잡을 requeue, 재개 불가/한도초과는 FAILED(명확 사유). 큐가 권위(`is_alive`): 느린 렌더를 죽이지 않는다.
- **워커 생사 표출**: `worker_alive`(arq 하트비트 키) → 그룹웨어 UI STALLED("렌더 지연"). 워커 복귀 시 자동 재개.
- **컨테이너 감시**: worker 서비스 `restart: unless-stopped`(크래시) + **arq `--check` healthcheck**(hung 감지, 이 커밋 추가).
  단 비-swarm compose 는 unhealthy 를 자동 재시작하지 않으니, 운영은 **autoheal 사이드카**(willfarrell/autoheal 등) 또는
  swarm/k8s liveness 로 unhealthy→재시작을 붙인다(healthcheck 는 그 신호를 제공).
- **dev**: `pnpm dev`(→ `apps/api/fastapi/video-model/scripts/dev.mjs`)가 **API + arq 워커를 함께 상시 실행 + 크래시 자동 재기동**한다.
  API 만 따로 띄우면 워커가 없어 잡이 큐에서 무한 대기(STALLED)하니, **dev 는 반드시 `pnpm dev` 로 기동**한다.

---

## 향후(필요할 때만. 지금은 안 만든다)

- **Webhook 완료 콜백**: 외부 API 가 완료를 push(현재는 워커가 long-poll). 워커 점유/쿼터 절약. provider→video-model
  콜백 엔드포인트를 추가하되 **그 provider 를 실제 붙일 때** 만든다(투기성 엔드포인트 금지). 폴링이 기본 폴백으로 남는다.
- **capability/pre-flight 레지스트리**: 모델별 능력(T2V/I2V/TI2V, 최대 길이, 해상도) 선언 → 라우팅이 적합 모델 선택 +
  파라미터 사전검증. **외부 모델이 2개 이상**이 되어 선택이 필요해질 때 도입.
