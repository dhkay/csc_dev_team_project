import { Injectable } from '@nestjs/common';
import { VideoModelApiClientService } from '../../../../../../shared/adapters/outbound/video-model-api';
import { JobCredentialCipher } from '../../../../../../shared/crypto';
import { RenderStatus } from '../../../../core/domain';
import {
  RenderJobScene,
  RenderJobStatus,
  RenderJobUsage,
  VideoRenderPort,
  VideoRenderSpec,
} from '../../../../core/application/ports/outbound';

/** video-model 잡 응답(필요 필드만). status 는 PENDING/PROCESSING/COMPLETED/FAILED */
interface VideoJobResponse {
  id: string;
  status: string;
  result_file_id: string | null;
  error: string | null;
  // 실패 사유 코드. 구 버전 서버는 없음
  error_code?: string | null;
  progress: number | null;
  worker_alive: boolean | null;
  captions_file_id: string | null;
  // 청구 단위(snake_case 는 video-model 스키마). 사내 provider 와 구 버전 서버는 없음
  usage?: {
    provider?: unknown;
    scene_count?: unknown;
    output_video_seconds?: unknown;
    input_image_count?: unknown;
    scene_seconds?: unknown;
  } | null;
  // 렌더 구간. 렌더 중일 때만
  render_stage?: string | null;
  // 씬별 상태(다중 씬 조합 렌더만). 구 버전 서버는 없음
  scenes?:
    | {
        order?: unknown;
        status?: unknown;
        clip_file_id?: unknown;
        duration_sec?: unknown;
        prompt?: unknown;
      }[]
    | null;
}

/**
 * 응답 scenes 를 도메인으로 변환. 형태가 어긋난 항목은 폐기(0 으로 접지 않음)
 * 순번을 못 읽은 칸을 0번으로 접으면 두 칸이 같은 자리를 가리켜 엉뚱한 씬이 만들어짐
 */
function toRenderScenes(raw: VideoJobResponse['scenes']): RenderJobScene[] | null {
  if (!Array.isArray(raw)) return null;
  const out: RenderJobScene[] = [];
  for (const s of raw) {
    const order = Number(s?.order);
    if (!Number.isFinite(order)) continue;
    const duration = Number(s?.duration_sec);
    out.push({
      order,
      status: typeof s.status === 'string' ? s.status : 'waiting',
      clipUploadId: typeof s.clip_file_id === 'string' ? s.clip_file_id : null,
      durationSec: Number.isFinite(duration) ? duration : null,
      prompt: typeof s.prompt === 'string' ? s.prompt : null,
    });
  }
  return out;
}

/** 응답 usage 를 도메인으로 변환. 숫자가 아니면 0 으로 접음(NaN 이 금액 계산으로 흘러가지 않게) */
function toRenderUsage(raw: VideoJobResponse['usage']): RenderJobUsage | null {
  if (!raw) return null;
  const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const seconds = Array.isArray(raw.scene_seconds) ? raw.scene_seconds.map(num) : [];
  return {
    provider: typeof raw.provider === 'string' ? raw.provider : '',
    sceneCount: num(raw.scene_count),
    outputVideoSeconds: num(raw.output_video_seconds),
    inputImageCount: num(raw.input_image_count),
    sceneSeconds: seconds,
  };
}

/** video-model VideoJobStatus 를 우리 RenderStatus 로 매핑. PENDING/PROCESSING 은 아직 렌더 중 */
function toRenderStatus(status: string): RenderStatus {
  switch (status) {
    case 'COMPLETED':
      return 'COMPLETED';
    case 'FAILED':
      return 'FAILED';
    default:
      return 'RENDERING';
  }
}

/**
 * VideoRenderPort 구현: video-model 의 COMPOSE 잡 등록과 상태 조회
 * provider='compose' 가 조립 어댑터로 디스패치되고 params.scene_visual_provider 로 씬 비주얼이 정해짐
 */
@Injectable()
export class VideoRenderAdapter implements VideoRenderPort {
  constructor(
    private readonly client: VideoModelApiClientService,
    private readonly cipher: JobCredentialCipher,
  ) {}

  async createJob(spec: VideoRenderSpec, idempotencyKey?: string): Promise<string> {
    const res = await this.client.post<VideoJobResponse>('/video-jobs', {
      // 우리 이름을 접두사로 붙임. 키의 유일성 범위가 video-model 전체라 다른 호출자와 겹칠 수 있음
      client_request_id: idempotencyKey ? `csc-marketing:${idempotencyKey}` : null,
      type: 'COMPOSE',
      provider: 'compose',
      source_file_id: null,
      params: {
        // 소유 귀속. 워커가 산출물 저장 시 file-upload 로 X-Organization-Id 전달
        organization_id: spec.organizationId,
        aspect_ratio: spec.aspectRatio,
        // 원천 영상 화질. 씬 클립부터 concat 까지 전 구간 캔버스를 정함
        resolution: spec.resolution,
        scene_visual_provider: spec.videoProvider,
        // 외부 씬 비주얼 조직 키. 평문 대신 암호문으로 실어 워커가 사용 직전 복호화
        ...(spec.sceneVisualApiKey
          ? { scene_visual_credential: this.cipher.encrypt(spec.sceneVisualApiKey) }
          : {}),
        // 그 키의 분당 제출 상한(조직 등록값). 없으면 워커가 자기 기본값으로 간격을 벌린다
        ...(spec.sceneVisualSubmitsPerMinute
          ? { scene_visual_submits_per_minute: spec.sceneVisualSubmitsPerMinute }
          : {}),
        // 플랫폼 경유 provider 가 그 안에서 부를 모델 경로(provider 는 어느 어댑터인지만 정함)
        ...(spec.videoModelPath ? { scene_visual_model: spec.videoModelPath } : {}),
        // 세그먼트 연결 방식. 비었으면 보내지 않고 렌더 기본을 사용
        ...(spec.segmentMode ? { segment_mode: spec.segmentMode } : {}),
        // 나레이션 사용 여부. 미지정이면 렌더 기본(사용)
        ...(spec.synthesizeSpeech !== undefined ? { synthesize_speech: spec.synthesizeSpeech } : {}),
        tts: {
          provider: spec.tts.provider,
          voice: spec.tts.voice,
          pitch: spec.tts.pitch,
        },
        // 외부 나레이션 조직 키. 씬 비주얼과 같은 규칙으로 암호문 전송
        ...(spec.ttsApiKey ? { tts_credential: this.cipher.encrypt(spec.ttsApiKey) } : {}),
        // 전체 BGM. video-model 이 file_id 로 받아 전체에 깔고 없으면 null
        bgm: spec.bgm ? { file_id: spec.bgm.fileId } : null,
        scenes: spec.scenes.map((s) => ({
          order: s.order,
          // 텍스트→영상 버전은 씬 이미지가 없어 빈 문자열 대신 null 로 명시
          image_file_id: s.imageUploadId || null,
          narration: s.narration,
          subtitle: s.subtitle,
          // 화면 묘사는 텍스트→영상 provider 의 프롬프트(이미지→영상에는 미사용)
          visual_prompt: s.visualPrompt ?? null,
          // 화면 속 인물이 말하는 문장. 화면 밖 문장은 narration 으로 따로 감
          dialogue: s.dialogue ?? null,
          duration_sec: s.durationSec ?? null,
          // 씬 효과음 목록(0..N). 각 항목을 씬 시작 기준 offset_sec 에 오버레이
          sfx: (s.sfx ?? []).map((x) => ({ file_id: x.fileId, offset_sec: x.offsetSec })),
        })),
      },
    });
    return res.id;
  }

  async getJobStatus(jobId: string): Promise<RenderJobStatus> {
    const res = await this.client.get<VideoJobResponse>(
      `/video-jobs/${encodeURIComponent(jobId)}`,
    );
    return {
      status: toRenderStatus(res.status),
      resultUploadId: res.result_file_id ?? null,
      error: res.error ?? null,
      errorCode: typeof res.error_code === 'string' ? res.error_code : null,
      progress: res.progress ?? null,
      workerAlive: res.worker_alive ?? null,
      captionsUploadId: res.captions_file_id ?? null,
      usage: toRenderUsage(res.usage),
      renderStage: res.render_stage ?? null,
      scenes: toRenderScenes(res.scenes),
    };
  }

  async cancelJob(jobId: string): Promise<void> {
    // 응답 본문 미사용. 취소는 멱등이고 상태는 다음 조회에서 봄
    await this.client.post<VideoJobResponse>(
      `/video-jobs/${encodeURIComponent(jobId)}/cancel`,
    );
  }

  async rerenderScene(
    jobId: string,
    order: number,
    visualPrompt?: string | null,
  ): Promise<void> {
    // 응답 본문 미사용. 잡은 다시 진행 중이 되고 그 상태는 다음 폴링이 봄
    await this.client.post<VideoJobResponse>(
      `/video-jobs/${encodeURIComponent(jobId)}/scenes/${order}/render`,
      { visual_prompt: visualPrompt ?? null },
    );
  }
}
