import { RenderStatus } from '../../../domain';

/**
 * 렌더 잡에 넘길 조합 스펙. video-model COMPOSE 잡 params 로 매핑
 * 씬 비주얼 provider 와 TTS 설정을 담아 video-model 이 씬마다 클립을 만들어 이어붙임
 */
export interface VideoRenderSpec {
  // 소유 조직. 산출물이 file-upload 소유 인덱스에 귀속(조직 삭제와 아카이브 대상)
  organizationId: number;
  aspectRatio: string;
  // 원천 영상 화질('480p'|'720p'). video-model 이 화질 x 화면비를 캔버스 픽셀로 해석
  resolution: string;
  // 씬 비주얼 provider: 'slideshow'(GPU 불필요) | 'wan2.2-ti2v-5b'(AI 모션) | 'grok-imagine-video'(외부)
  videoProvider: string;
  // 외부 provider 의 조직 API 키(평문, 이 프로세스 메모리 내에서만). 어댑터가 AES-GCM 암호문으로 변환
  sceneVisualApiKey?: string | null;
  // 그 키의 분당 제출 상한. 조직이 키와 함께 등록한 값이고 없으면 워커 기본값을 쓴다.
  //   벤더가 한도를 재는 단위가 키의 프로젝트라 키를 따라다닌다(전역 설정이면 티어가 다른 조직이 같은 값으로 돈다).
  sceneVisualSubmitsPerMinute?: number | null;
  // 플랫폼 경유 provider 가 그 플랫폼 안에서 부를 모델 경로(예: 'veo3.1/text-to-video')
  // videoProvider 는 어느 어댑터가 처리할지만 정하므로 중계 모델은 이 값이 필요
  // 모델마다 provider key 를 늘리면 워커 레지스트리까지 바뀌어, 이 값이 있으면 카탈로그 한 줄로 끝남
  videoModelPath?: string | null;
  // 세그먼트(씬) 연결 방식: 동시 생성인지 순차 생성인지
  // 값 공간은 렌더가 소유(여기서 좁히면 방식 추가 때 계약과 DB 를 함께 고쳐야 함). 비면 렌더 기본
  segmentMode?: string | null;
  // 렌더가 소리를 합성하는가
  // true 면 렌더가 TTS 로 음성을 얹고 클립 오디오를 버림, false 면 영상 모델이 소리까지 만듦
  // 둘 다 넣으면 목소리가 겹치므로 갈림이지 믹스 비율이 아님. 이 값이 버전을 대신함
  synthesizeSpeech?: boolean;
  // TTS 설정. provider 는 video-model 의 TTS 어댑터 key(= 모델 id)
  // voice 는 provider 마다 뜻이 다름(edge-tts 는 음성 이름, ElevenLabs 는 경로에 들어가는 음성 id)
  tts: { provider: string; voice: string; pitch: string };
  // 외부 TTS provider 의 조직 API 키(평문). 씬 비주얼과 같은 규칙으로 어댑터가 암호문으로 변환
  ttsApiKey?: string | null;
  // 전체 BGM(필수). video-model 이 fileId 로 파일을 받아 루프와 감쇠로 전체에 깜
  bgm: { fileId: string } | null;
  scenes: {
    order: number;
    imageUploadId: string;
    narration: string;
    subtitle: string;
    // 텍스트→영상 provider 에 보낼 이 씬의 화면 묘사(영어). 기획안의 씬 이미지 프롬프트와 같은 값
    // 이미지→영상에는 불필요. 텍스트→영상은 이 문장에서 화면을 만들어 비면 모든 씬이 같은 영상이 됨
    visualPrompt?: string;
    // 이 씬에서 화면 속 인물이 말하는 문장. 화면 밖에서 읽는 문장은 narration(배타 아님)
    // 렌더는 narration 보다 이쪽을 먼저 쓰고, 그 우선순위가 버전 조건이 아니라 값 우선순위
    dialogue?: string;
    durationSec?: number;
    // 이 씬 효과음 목록(0..N). 각 항목을 씬 시작 기준 offsetSec 에 오버레이
    sfx?: { fileId: string; offsetSec: number }[];
  }[];
}

/**
 * 렌더가 지금 밟는 구간. 'SCENES' 는 미완성 씬 존재, 'FINALIZING' 은 이어붙이는 중
 * 값 공간은 렌더가 소유(구간 추가 때 이 계약을 함께 고치지 않게)
 */
export type RenderStage = string;

/** 렌더 잡의 씬 하나. 진행 중이면 체크포인트, 끝난 잡이면 렌더가 저장한 씬 결과 */
export interface RenderJobScene {
  order: number;
  // 'waiting' | 'running' | 'done'. RenderStage 와 같은 이유로 좁히지 않음
  status: string;
  // 이 씬 클립의 file-upload uploadId. 만들어졌을 때만 존재(접근 URL 은 BFF 가 재구성)
  clipUploadId: string | null;
  durationSec: number | null;
  // 이 씬을 만든 화면 묘사. 다시 만들기 전에 고칠 대상이라 함께 옴
  prompt: string | null;
}

/** 렌더 잡 상태 조회 결과. video-model 잡 상태를 우리 RenderStatus 로 매핑한 값 */
export interface RenderJobStatus {
  status: RenderStatus;
  resultUploadId: string | null;
  error: string | null;
  // 실패 사유 코드. 값 공간은 렌더가 소유(rate_limited, quota_exceeded, credit_exhausted 등)하고
  // 여기서는 통과만 시킨다. 화면이 이 값으로 알림을 가르고 문장(error)은 그대로 보인다.
  // 분류되지 않은 실패와 성공, 구 버전 렌더는 null
  errorCode: string | null;
  // 렌더 진행률(0~100). COMPOSE 진행 중일 때만 채워지고 비영속
  progress: number | null;
  // 소비 워커 생사. 비종료 잡일 때만 채워지며 false 가 STALLED 판정 근거
  workerAlive: boolean | null;
  // 시간동기 자막 트랙(JSON) file-upload id. COMPOSE 완료 시에만, 최종이 fetch 해 번인
  captionsUploadId: string | null;
  // 렌더의 청구 단위. 외부 유료 provider 만이고 사내 provider 는 null 이 곧 '무료'(0 이 아님)
  usage: RenderJobUsage | null;
  // 렌더 구간. 렌더 중일 때만 채워지고 비영속
  renderStage: RenderStage | null;
  // 씬별 상태(다중 씬 조합 렌더만, 그 외 null)
  // 끝난 뒤의 값이 세그먼트 격자와 '이 칸만 다시 만들기'의 근거
  scenes: RenderJobScene[] | null;
}

/** video-model 이 보고한 청구 단위. 결과물을 다시 재지 않음(벤더에 보낸 값이 진실) */
export interface RenderJobUsage {
  // 유효 씬 비주얼 provider(요청값이 아니라 실제로 돈 쪽)
  provider: string;
  sceneCount: number;
  outputVideoSeconds: number;
  inputImageCount: number;
  sceneSeconds: number[];
}

/**
 * 영상 렌더 아웃바운드 포트: video-model 에 COMPOSE 잡 등록과 조회(서비스토큰 HTTP)
 * DB 레코드가 아니라 원격 호출이라 Record 접미사를 쓰지 않음
 */
export interface VideoRenderPort {
  /**
   * 렌더 잡을 등록하고 잡 id 를 반환
   * idempotencyKey 는 재실행에도 같은 값이어야 함(사가가 단계 메타로 제공). 유료 잡 중복 생성 방지
   */
  createJob(spec: VideoRenderSpec, idempotencyKey?: string): Promise<string>;
  /** 잡 상태와 결과물 uploadId 조회 */
  getJobStatus(jobId: string): Promise<RenderJobStatus>;

  /**
   * 진행 중 렌더 취소(멱등). 프로젝트 삭제 시 호출
   * 취소하지 않으면 사라진 프로젝트의 렌더가 끝까지 돌아 벤더 요금만 나가고 원장에도 남지 않음
   */
  cancelJob(jobId: string): Promise<void>;

  /**
   * 이 잡의 씬 하나만 다시 만든다. 나머지 씬은 렌더가 이미 만든 결과를 사용
   * visualPrompt 를 주면 화면 묘사를 바꿔 재생성. 호출 전에 행을 RENDERING 으로 예약해야 함
   * 멱등하지 않음(두 번 부르면 두 번 만들고 비용은 그 씬 하나에만 발생)
   */
  rerenderScene(jobId: string, order: number, visualPrompt?: string | null): Promise<void>;
}

export const VIDEO_RENDER_PORT = Symbol('VIDEO_RENDER_PORT');
