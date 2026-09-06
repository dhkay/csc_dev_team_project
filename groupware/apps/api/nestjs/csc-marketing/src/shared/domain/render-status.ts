// 렌더 상태 공유 커널: 원천 영상과 최종 영상이 같은 video-model 잡 상태를 폴링하므로 어휘를 한 곳에 정의
// PENDING(등록 직후) → RENDERING → COMPLETED/CANCELLED
// STALLED = 비종료지만 소비 워커가 없어 정체(워커 복귀 시 다음 폴링에서 자동 정정되므로 종료 상태 아님)
// CANCELLED = 영구 실패 시 작업 전체 되돌림(일시 지연은 여기 오지 않고 video-model 이 재시도로 흡수)
// FAILED = 레거시 값. 새로 만들어지지 않지만 과거 행이 있어 유지하고 CANCELLED 와 같게 취급

export type RenderStatus =
  | 'PENDING'
  | 'RENDERING'
  | 'STALLED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED';

// 되돌려진(보여줄 산출물이 없는) 상태. 카드로 렌더하지 않고 사유를 한 번 알린 뒤 걷어냄
export const ROLLED_BACK_RENDER_STATUSES: readonly RenderStatus[] = ['CANCELLED', 'FAILED'];

// 상태 추가 시 컴파일이 못 잡는 곳(프론트에 복제된 어휘):
//   web features/marketing-channels/types 의 RenderStatus 미러와 판정 헬퍼
//   web features/marketing-activity-logs/types 의 액션 라벨 맵(누락 시 액션 코드가 화면에 노출)

// 렌더가 아직 안 끝난 상태(폴링과 재조정 대상). STALLED 포함이라 워커 복귀 시 자가복구
export const NON_TERMINAL_RENDER_STATUSES: readonly RenderStatus[] = [
  'PENDING',
  'RENDERING',
  'STALLED',
];

// 비종료 렌더를 STALLED 로 보기까지의 유예(ms). createdAt 기준이라 STALLED 저장 후에도 흔들리지 않음
export const RENDER_STALLED_AFTER_MS = 120_000;

/** 렌더 잡 폴링 스냅샷의 상태 판정 입력. 포트의 RenderJobStatus 가 구조적으로 만족 */
export interface RenderJobSnapshot {
  status: RenderStatus;
  workerAlive: boolean | null;
}

/**
 * 표시 상태 도출 SSOT: video-project 와 video-final reconcile 이 공유하는 단일 규칙
 * 잡의 FAILED 는 여기서 CANCELLED 로 번역(호출부에 두면 poller 마다 복제되고 누락이 조용함)
 */
export function deriveRenderStatus(
  snapshot: RenderJobSnapshot,
  createdAt: Date,
  now: number = Date.now(),
): RenderStatus {
  const stalled =
    snapshot.status === 'RENDERING' &&
    snapshot.workerAlive === false &&
    now - createdAt.getTime() > RENDER_STALLED_AFTER_MS;
  if (stalled) return 'STALLED';
  return snapshot.status === 'FAILED' ? 'CANCELLED' : snapshot.status;
}
