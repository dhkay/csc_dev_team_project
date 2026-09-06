// 영상 생성 진행상태의 뷰모델. 화면(GenerationProgressView)은 이 타입 하나만 받는다.
//
// 이 파일이 이음새다. 지금 이 값을 만드는 곳은 둘이다: 실제 '영상 생성' 클릭(아는 만큼만 채운다)
// 과 dev 목(generationProgress.mock). 백엔드가 단계와 세그먼트별 상태를 실어 보내기 시작하면
// 화면은 그대로 두고 만드는 쪽만 바꾼다. 그래서 여기에는 화면 표현이 아니라 규칙만 둔다.
// (versionProfile / planComposeOptions 와 같은 자리인 이유)

/**
 * 생성이 밟는 단계. 사용자 화면에는 이 키가 아니라 label 을 쓴다.
 *
 * 업로드 단계가 없는 이유: 렌더는 이어붙이기부터 업로드까지를 한 흐름으로 처리하고 그 사이를
 * 알리지 않는다. 관측되지 않는 구간을 그리면 화면이 실제와 무관하게 진행하는 척하게 된다.
 * 그 구간의 가중치는 '영상 병합' 이 함께 든다.
 */
export type GenerationStage =
  | 'SPLITTING'
  | 'PREPARING'
  | 'SEGMENT_GENERATING'
  | 'MERGING'
  | 'COMPLETED';

/**
 * 단계 카탈로그: 순서 + 라벨 + 진행률 가중치
 *
 * 합이 100 이라는 것이 이 표의 계약이다. 어긋나면 진행률이 100 에 닿지 못하거나 넘어서,
 * 다 만들어진 화면이 87% 에서 멈춘 것처럼 보인다. 단위 테스트가 그 합을 잠근다.
 *
 * 가중치는 실제 소요 시간의 비율을 어림한 값이다. 세그먼트 생성이 압도적으로 길어(모델 호출이
 * 세그먼트 수만큼) 나머지 넷을 합친 것보다 크다. 값이 정확할 필요는 없고, 사용자가 "지금 어디쯤"
 * 을 가늠할 수 있으면 된다.
 */
export const GENERATION_STAGES: readonly {
  key: GenerationStage;
  label: string;
  weight: number;
  // 세그먼트 칸이 아직 없을 때 격자 자리에 적는 말. 칸 수가 정해지기 전의 단계에만 있다.
  //   칸 수는 서버가 입력을 나눈 뒤 프로젝트가 나른다. 그 전에 화면이 어림한 수로 칸을 그리면
  //   틀린 수를 확신하듯 보여주므로, 대신 무엇을 기다리는지를 그 단계의 말로 적는다.
  awaitingSegments?: string;
}[] = [
  // 이 표는 v1.5 만 보여주므로(profile.hasGenerationProgress) 이름도 그 버전의 파이프라인 이름이어야
  //   한다. v1.0 의 산출물 이름을 적으면 영상을 만들라고 누른 사람에게 기획안을 쓰는 중이라고 말한다.
  //
  //   실제로 일어나는 일: LLM 이 입력을 씬 N개로 나누고(SPLITTING), 그것으로 렌더 잡을 만든 뒤
  //   (PREPARING), 씬마다 영상을 만들고, 이어붙인다.
  {
    key: 'SPLITTING',
    label: '세그먼트 나누기',
    weight: 10,
    awaitingSegments:
      '세그먼트를 계산하는 중입니다. 적은 내용을 정리해 동영상 단위로 나누고 있고, 나뉘면 세그먼트 칸이 한 번에 나타납니다.',
  },
  {
    key: 'PREPARING',
    label: '영상 준비',
    weight: 15,
    awaitingSegments: '나뉜 세그먼트로 영상을 준비하는 중입니다. 잠시 뒤 세그먼트 칸이 나타납니다.',
  },
  { key: 'SEGMENT_GENERATING', label: '세그먼트 생성', weight: 65 },
  // 이어붙이기부터 저장까지. 렌더가 그 사이를 알리지 않아 한 구간으로 든다(위 타입 주석 참고)
  { key: 'MERGING', label: '영상 병합', weight: 10 },
  // 종료 상태. 가중치 0 이라 앞의 넷이 그대로 100 이 된다.
  //   끝났다는 것을 값으로 받는다. "마지막 단계이고 세그먼트가 다 완료" 로 역추론하면 병합만
  //   남은 순간과 진짜 완료가 구분되지 않고, 화면이 결과로 넘어갈 시점을 스스로 지어내게 된다.
  { key: 'COMPLETED', label: '완료', weight: 0 },
];

/**
 * 세그먼트(동영상) 하나의 상태. 셋뿐이고 실패가 없다.
 *
 * 렌더는 씬 하나가 실패하면 잡 전체를 실패시킨다(씬이 빠진 영상을 만들지 않으려는 것이다). 그래서
 * "다른 칸은 멀쩡한데 이 칸만 실패" 라는 상태가 관측되지 않는다. 값 공간의 주인도 렌더이고
 * (`VideoProjectSegment.status`) 거기도 셋이다. 넷째 값을 두면 화면에 도달할 수 없는 분기가 생기고,
 * 그 분기의 테스트는 통과하면서 아무것도 지키지 못한다.
 */
export type SegmentStatus = 'done' | 'running' | 'waiting';

export interface SegmentProgress {
  // 1-base. 나뉜 세그먼트의 순번이고, 아래 격자의 칸 번호와 같다.
  order: number;
  status: SegmentStatus;
  // done: 만들어진 길이(초). 카드에 00:08 로 적는다.
  durationSec?: number;
  // done: 만들어진 세그먼트 영상의 주소. 있으면 카드가 그 영상을 그대로 보여주고 눌러 재생한다.
  //
  // 없으면 만들어졌다는 표시만 남는다. 세그먼트가 무엇이 되었는지 보려면 결과 영상을 끝까지 봐야
  // 하는데, 그러면 어느 칸을 다시 만들지 고를 수가 없다(그 판단을 하라고 이 격자가 있다)
  previewUrl?: string;
  // running: 남은 시간 어림(초)
  etaSec?: number;
  // 이 세그먼트를 만든 프롬프트. 재생성 창이 이것을 고쳐 쓴다.
  //
  // 고칠 수 없으면 재생성은 같은 입력으로 같은 일을 다시 시키는 것이라 대개 같은 결과가 나온다.
  // 무엇을 바꿔 다시 만들지 정하는 것이 그 버튼의 쓸모다.
  prompt?: string;
}

export interface GenerationProgress {
  stage: GenerationStage;
  // epoch ms. 경과 시간의 기준
  startedAt: number;
  segments: SegmentProgress[];
}

/** 세그먼트 단계의 진척(0~1). 완료=1, 생성 중=0.5 가중 */
function segmentRatio(segments: readonly SegmentProgress[]): number {
  if (segments.length === 0) return 0;
  const done = segments.filter((s) => s.status === 'done').length;
  const running = segments.filter((s) => s.status === 'running').length;
  return (done + 0.5 * running) / segments.length;
}

/**
 * 전체 진행률(0~100): 끝난 단계의 가중치 합 + 현재 단계 가중치 × 그 단계의 진척
 *
 * 세그먼트 단계의 진척은 백엔드 `_compose_progress` 와 같은 규칙(완료 1, 렌더 중 0.5)을 쓴다.
 * 나중에 그 값을 받아 쓰기 시작할 때 화면의 수가 튀지 않아야 하기 때문이다.
 * 세그먼트 단계가 아닌 구간은 진척을 알 수 없으므로 0 으로 둔다(그 단계에 들어선 것만으로 앞 단계의
 * 가중치는 이미 더해져 있어, 바가 뒤로 가지 않는다)
 */
export function overallPercent(p: GenerationProgress): number {
  let acc = 0;
  for (const stage of GENERATION_STAGES) {
    if (stage.key === p.stage) {
      const ratio = stage.key === 'SEGMENT_GENERATING' ? segmentRatio(p.segments) : 0;
      acc += stage.weight * ratio;
      break;
    }
    acc += stage.weight;
  }
  return Math.max(0, Math.min(100, Math.round(acc)));
}

/** 완료된 세그먼트 수. 'd / N 완료' 의 d. */
export function doneCount(p: GenerationProgress): number {
  return p.segments.filter((s) => s.status === 'done').length;
}

/** 경과 시간 'HH:MM:SS'. 시작보다 이른 now 는 0 으로 본다(시계가 뒤로 가도 음수를 보이지 않게) */
export function elapsedLabel(startedAt: number, now: number): string {
  const total = Math.max(0, Math.floor((now - startedAt) / 1000));
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  return [hh, mm, ss].map((n) => String(n).padStart(2, '0')).join(':');
}

/** 단계 라벨. 모르는 키면 빈 문자열(화면이 배지를 비운다) */
export function stageLabel(stage: GenerationStage): string {
  return GENERATION_STAGES.find((s) => s.key === stage)?.label ?? '';
}

/**
 * 세그먼트 칸 수를 아직 모르는가. 서버가 입력을 나눠 프로젝트를 만들기 전까지 참이다.
 * 끝난 생성은 아니다. 완료인데 칸이 없는 것은 기다리는 상태가 아니라 받은 것이 없는 것이다.
 */
export function awaitsSegments(p: GenerationProgress): boolean {
  return p.segments.length === 0 && !isComplete(p);
}

// 칸 수를 정하기 전의 단계가 아닌데 칸이 없을 때. 서버가 세그먼트를 아직 싣지 않은 경우다.
const AWAITING_SEGMENTS_FALLBACK = '세그먼트 정보를 아직 받지 못했습니다.';

/** 칸이 아직 없을 때 격자 자리에 적는 말. 그 단계에 정해 둔 말이 없으면 공통 문장 */
export function awaitingSegmentsNotice(stage: GenerationStage): string {
  return (
    GENERATION_STAGES.find((s) => s.key === stage)?.awaitingSegments ?? AWAITING_SEGMENTS_FALLBACK
  );
}

/** 끝났는가. 이 값이 참이 되면 창이 결과 화면으로 넘어간다. */
export function isComplete(p: GenerationProgress): boolean {
  return p.stage === 'COMPLETED';
}
