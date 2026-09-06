import { RenderStatus } from '../../../domain';
import type { FinalOverlays } from '../../../../../../shared/domain/overlay';

/**
 * 최종 합성 잡에 넘길 스펙: video-model FINALIZE 잡 params 로 매핑된다.
 * 원천 영상(source) 위에 프레임 배경 + fit/중앙 overlay + 아웃트로 concat + 제목/자막 번인을 video-model 이 수행한다.
 */
export interface FinalRenderSpec {
  // 원천 영상 file-upload uploadId(원천 프로젝트의 완성 결과물): 합성 소스
  sourceUploadId: string;
  // 배경프레임 file-upload uploadId: 없으면 원천 그대로(배경 없음)
  frameUploadId: string | null;
  // 아웃트로 file-upload uploadId: 없으면 뒤에 붙이지 않음
  outroUploadId: string | null;
  // 원천 화면비 스냅샷(실제 캔버스는 프레임 비율로 결정)
  aspectRatio: string;
  // 시간동기 자막 트랙(JSON) file-upload id: 원천에서 온다. 없으면 자막 없이 렌더(제목만)
  captionsUploadId: string | null;
  // 제목(상단)/자막(하단) 오버레이 스펙: 스튜디오 편집 대상. video-model 이 ASS 로 번인
  overlays: FinalOverlays;
}

/** 렌더 잡 상태 조회 결과: video-model 잡 상태를 우리 RenderStatus 로 매핑한 값 */
export interface RenderJobStatus {
  status: RenderStatus;
  resultUploadId: string | null;
  error: string | null;
  // 렌더 진행률(0~100). 비영속: 조회 응답에만 실린다(FINALIZE 는 대개 null)
  progress: number | null;
  // 소비 워커 생사: 비종료 잡일 때만 채워진다(그 외 null). false = 소비 워커 없음 → 정체(STALLED) 판정 근거
  workerAlive: boolean | null;
}

/**
 * 최종 합성 아웃바운드 포트: video-model 에 FINALIZE 잡을 등록/조회한다(서비스토큰 HTTP)
 * DB 레코드가 아니라 원격 호출이라 Record 접미사를 쓰지 않는다.
 */
export interface FinalRenderPort {
  /** FINALIZE 잡을 등록하고 잡 id 를 돌려준다. */
  /**
   * 합성 잡을 등록하고 잡 id 를 반환
   * idempotencyKey 는 재실행에도 같은 값이어야 하며 근거는 VideoRenderPort 와 동일
   */
  createJob(spec: FinalRenderSpec, idempotencyKey?: string): Promise<string>;
  /** 잡 상태(+결과물 uploadId)를 조회한다. */
  getJobStatus(jobId: string): Promise<RenderJobStatus>;

  /**
   * 진행 중 합성을 취소한다(멱등): 최종영상 삭제 시 호출한다.
   * 원천영상 취소와 같은 이유다: 사라진 항목을 위해 GPU/ffmpeg 를 계속 돌릴 이유가 없다.
   */
  cancelJob(jobId: string): Promise<void>;
}

export const FINAL_RENDER_PORT = Symbol('FINAL_RENDER_PORT');
