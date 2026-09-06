// 기획서 생성 구성(개수) 옵션: 만들 기획서 개수 + 기획서당 씬 개수 선택지(프론트 SSOT)
// 씬 상한은 커널(@csc/tool-versions)에서 읽고 나머지 범위는 백엔드 plan-counts.ts 와 맞춘다(최종 방어는
// 백엔드 clamp). pill 은 배열 순서대로 그린다.

import type { AiModelSelection } from '$lib/features/marketing-channels/types';
import { MAX_SEGMENTS_PER_VIDEO, pipelineFor, segmentLimitMessage } from '@csc/tool-versions';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import { AI_CAPABILITIES, findAiModelOption, pinnedModelFor } from './aiModelOptions';
import type { AiCapabilityKey } from './aiModelOptions';
import { stepCapabilities } from './aiModelReadiness';

/** 정수 범위 [min, max] → 배열(pill 목록용) */
function range(min: number, max: number): number[] {
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

// 초기 선택값(DEFAULT_*)은 모달을 열 때 찍히는 값이라 프론트가 정한다. 백엔드의 같은 이름 상수는
// 값이 오지 않았을 때의 폴백이자 프롬프트 뷰의 예시라 역할이 다르다(달라도 어긋난 것이 아니다)
// 맞춰야 하는 것은 범위(MIN/MAX)뿐이다. 선택지를 늘릴 때는 백엔드 MIN/MAX 도 함께 넓힌다.
// (안 넓히면 고른 값이 조용히 다른 값으로 바뀐다)

/** 만들 기획서 개수: 범위 1~6(백엔드 MIN/MAX_PLAN_COUNT 와 일치). 열 때는 1로 시작한다. */
export const PROPOSAL_COUNT_OPTIONS = range(1, 6);
export const DEFAULT_PROPOSAL_COUNT = 1;

/**
 * 기획서당 씬(동영상) 개수 상한. 커널(@csc/tool-versions)의 값이라 서버의 clamp 와 같은 수다.
 * 개수를 고르지 않는 버전(v1.5)에서는 적은 만큼이 개수라 이 수를 넘게 적을 수 있고, 그때는 시작 전에
 * 막는다(유료 호출 전). 번호 없이 적어 여기서 세지 못한 입력은 서버가 같은 문장으로 거절한다.
 */
export const MAX_SCENE_COUNT = MAX_SEGMENTS_PER_VIDEO;

/** 기획서당 씬 개수: 범위 1~8(하한은 백엔드 MIN_SCENE_COUNT 와 일치). 열 때는 1로 시작한다. */
export const SCENE_COUNT_OPTIONS = range(1, MAX_SCENE_COUNT);
export const DEFAULT_SCENE_COUNT = 1;

// 상한 초과 안내. 서버의 거절과 같은 함수라 미리 막힌 사람과 뒤에 막힌 사람이 같은 말을 듣는다.
export { segmentLimitMessage };

// 자체 호스팅 모델 선택 시 분량 제한
//
// 자체(내부) 모델은 조직 전체가 함께 쓰는 사내 GPU 1장 위에서 돈다. 외부 벤더처럼 요청만큼 늘려
// 쓸 수 없어 기획서를 한 번에 여러 개 만들면 두 가지가 깨진다.
//   자체 LLM    출력 길이가 모델 창(8192 = 프롬프트+출력)에 묶여, 넘치면 JSON 이 잘려 통째로 유실
//   자체 이미지 GPU 가 잡을 직렬 처리라 30장을 밀면 뒤에 선 사람이 자기 1장을 위해 그것을 다 기다림
// 그래서 자체 모델이 끼면 기획서를 1개로 고정한다(씬 개수는 그대로: 1개 x 8씬 은 양쪽 다 안전)

/** 자체 모델이 끼었을 때 허용하는 기획서 개수 */
const INTERNAL_PROPOSAL_COUNTS = [1];

export interface PlanComposeLimit {
  // 지금 고를 수 있는 기획서 개수(제한 시 [1])
  proposalCounts: number[];
  // 제한을 유발한 자체 모델 라벨(안내 문구용). 비어 있으면 제한 없음
  internalModelLabels: string[];
  // 제한 여부: internalModelLabels.length > 0 과 동치(호출부 가독성용)
  limited: boolean;
}

/**
 * 이 역량이 이 버전에서 실제로 쓸 모델 key. 고정이면 고정값, 아니면 저장값
 * 서버의 판정(`planLlmForVersion`: 고정값 ?? 저장값)과 같은 모양이어야 한다. 갈라 두면 화면이 막는
 * 근거와 서버가 실제로 부르는 모델이 어긋난다.
 */
function modelInUse(
  capability: AiCapabilityKey,
  selection: AiModelSelection,
  version: VersionMode,
): string {
  const cap = AI_CAPABILITIES.find((c) => c.key === capability);
  return (cap ? pinnedModelFor(cap, version) : null) ?? selection[capability];
}

/**
 * 선택된 모델에 따라 고를 수 있는 기획서 개수를 정한다.
 * 선택값은 opaque key 라 내부/외부 판단은 카탈로그에 위임한다. 여기서 key 를 하드코딩하면 모델이
 * 늘 때마다 이 파일도 고쳐야 한다. 선택이 없거나 카탈로그에 없는 key 면 제한하지 않는다.
 * 어떤 역량이 기획서 생성에 관여하는지는 생성 전 점검과 같은 함수로 묻는다(stepCapabilities)
 * 갈라 두면 역량이 버전에서 빠질 때 한 화면은 막고 다른 화면은 통과시킨다. `version` 을 받는 이유다.
 * 고정 역량은 저장값이 아니라 고정 모델로 판단한다. 저장된 옛 값으로 막으면 쓰이지도 않는 모델
 * 때문에 분량이 묶인다. 고정이 아닌 역량은 저장값 그대로 본다(`effectiveAiModel` 을 쓰지 않는 이유:
 * 그쪽은 카탈로그 노출로도 거르는데 서버는 거르지 않아, 노출만 꺼 둔 자체 모델이 저장돼 있으면
 * 실제로는 그 모델이 돌면서 분량 제한만 조용히 풀린다)
 */
export function resolvePlanComposeLimit(
  selection: AiModelSelection | null | undefined,
  version: VersionMode,
): PlanComposeLimit {
  const internalModelLabels = selection
    ? stepCapabilities('plan', version)
        .map((cap) => findAiModelOption(cap, modelInUse(cap, selection, version)))
        .filter((opt) => opt?.provider === 'internal')
        .map((opt) => opt!.label)
    : [];
  const limited = internalModelLabels.length > 0;
  return {
    proposalCounts: limited ? INTERNAL_PROPOSAL_COUNTS : PROPOSAL_COUNT_OPTIONS,
    internalModelLabels,
    limited,
  };
}

// 기획서 구성을 고르지 않는 버전(v1.5)의 개수
//
// 그 버전은 영상 한 편이 목적지라 '기획안 몇 개' 라는 선택이 없고, 몇 씬으로 만들지는
// '씬 / 사용자 입력사항' 이 이미 말한다. 개수는 고르는 값이 아니라 그 입력에서 나온다.

/**
 * 이 버전이 한 번에 만드는 기획안 수. 고정하지 않는 버전은 null(작업자가 고른다)
 * 값을 여기서 정하지 않고 파이프라인 표에서 읽는다. 화면만 알고 서버가 모르면 낡은 탭이 보낸 수를
 * 서버가 그대로 써, 프롬프트는 "정확히 1개" 라는데 출력 토큰 예산이 그 배수로 잡힌다.
 */
export function pinnedProposalCount(version: VersionMode): number | null {
  return pipelineFor(version).pinnedProposalCount;
}

/**
 * 씬/사용자 입력사항에서 씬 개수를 읽는다. 세지 못하면 null
 * '동영상1:' 또는 '씬1:' 처럼 번호를 붙인 줄을 센다. 줄글로 적었으면 셀 근거가 없어 null 을 주고
 * 호출부가 기본값으로 떨어진다.
 * 화면의 어림값이다. 입력을 정제하는 버전에서는 서버가 정제본의 동영상 수로 이 값을 덮는다.
 * ("동영상1 (0-8초)" 처럼 번호 뒤에 다른 것이 붙으면 여기서는 세지 못하지만 서버는 센다)
 * 두 표기를 다 받는 이유: 결과물의 단위 이름은 '동영상' 이지만 '씬' 으로 적던 사람의 입력이 갑자기
 * 세어지지 않으면 고른 적 없는 개수로 만들어진다(예시는 결과물과 같은 이름을 쓴다)
 * 줄 수를 세지 않는 이유: 하나를 여러 줄로 적는 사람이 있어 줄 수는 개수와 다르다.
 * 같은 번호를 두 번 적어도 한 번으로 센다(고쳐 쓰다 남은 중복이 개수를 늘리지 않게)
 */
export function sceneCountFromBrief(brief: string): number | null {
  const numbers = new Set<number>();
  for (const line of brief.split('\n')) {
    const m = /^\s*(?:동영상|씬)\s*(\d+)\s*[:.)]/.exec(line);
    if (m) numbers.add(Number(m[1]));
  }
  return numbers.size > 0 ? numbers.size : null;
}

// 입력 예시(플레이스홀더)
//
// 예시가 유일한 안내다. 무엇을 어떻게 적는지는 문장으로 설명하는 것보다 적어 둔 것을 보여 주는
// 편이 짧고 정확해, 첫 줄이 그 칸이 하는 일을 말하고 나머지 줄이 형태를 보여준다.
// 예시는 산출물과 같은 모양이어야 한다. 동영상 하나는 장면 구성과 말(대화내용 또는 나레이션)로
// 이뤄지므로 한 줄짜리 예시를 두면 말을 적을 수 있다는 사실이 화면 어디에도 없게 된다.
// 둘을 보여 주고 서로 다른 쪽(대화내용/나레이션)을 쓰는 것도 안내다. 한 동영상은 둘 중 하나만 갖는다.
//
// 두 입력 방식의 예시가 다르다. 같은 칸이지만 지는 몫이 다르다.
//   컨셉입력  브랜드와 카테고리가 톤을 이미 정했다 → 무엇을 담을지만 적는다(비워도 된다)
//   프롬프트  고르는 것이 없다 → 적지 않은 것은 아무도 정해 주지 않는다.
// 한 벌을 공유하면 프롬프트 방식은 연출이 통째로 모델에 넘어간 줄 모른 채 결과를 받고, 컨셉입력은
// 이미 카테고리로 고른 톤을 한 번 더 적게 된다(두 값이 어긋나면 모델이 무엇을 따를지 알 수 없다)

/**
 * 컨셉입력 방식의 예시: 무엇을 담을지만 적는다.
 * 톤과 연출은 브랜드/컨셉 카테고리가 이미 정했다. 예시가 그 사실을 말하지 않으면 사람이 여기에
 * 표현 형식과 무드를 다시 적게 되고 그때부터 같은 것을 두 자리에서 정하게 된다.
 */
export const SCENE_BRIEF_PLACEHOLDER = [
  '무엇을 담을지 동영상 단위로 적습니다. 번호를 붙인 만큼 만들어집니다.',
  '톤과 연출은 브랜드와 카테고리가 정하니 여기 적지 않아도 되고, 비워 두어도 됩니다.',
  '대화내용과 나레이션은 동영상 하나에 하나만 씁니다. 쓰지 않는 쪽은 없음으로 둡니다.',
  '',
  '동영상1:',
  '장면 구성: 목욕 후 아기 엉덩이를 부드럽게 닦아주는 장면',
  '대화내용: 없음',
  '나레이션: 목욕 후에도 남는 찝찝함',
  '',
  '동영상2:',
  '장면 구성: 힙 클린 미스트를 뿌리는 클로즈업',
  '대화내용: 이제 뽀송해졌지?',
  '나레이션: 없음',
].join('\n');

/**
 * 프롬프트 방식의 예시: 적은 것이 전부다.
 * 그래서 화면과 움직임, 조명까지 담은 형태를 보여준다. 컨셉입력의 예시를 그대로 쓰면 톤을 적어야
 * 한다는 사실이 화면 어디에도 없게 된다.
 */
export const PROMPT_BRIEF_PLACEHOLDER = [
  '만들 영상을 자유롭게 적습니다. 적지 않은 것은 AI 가 정하고, 번호를 붙인 만큼 만들어집니다.',
  '화면과 움직임, 조명과 색감까지 적을수록 그대로 만들어집니다.',
  '대화내용과 나레이션은 동영상 하나에 하나만 씁니다. 쓰지 않는 쪽은 없음으로 둡니다.',
  '',
  '동영상1:',
  '장면 구성: 화이트 배경 위 2D 모션그래픽. 가상 카메라가 천천히 줌인하고, 파우더 아이콘 주변만 채도를 낮춰 답답한 문제 상황을 암시한다',
  '대화내용: 없음',
  '나레이션: 아직도 파우더 쓰세요?',
  '',
  '동영상2:',
  '장면 구성: 손끝 일러스트가 베일크림을 펴 바르는 매크로 클로즈업. 밝은 옐로우 민트 톤으로 전환되며 손그림풍 종이 질감을 살린다',
  '대화내용: 이거 하나면 끝나요',
  '나레이션: 없음',
].join('\n');

export const CONSTRAINTS_PLACEHOLDER = [
  '피해야 할 것을 적습니다. 위에 적은 내용에 걸리는 제한입니다.',
  '',
  '실사 질감 유지, AI 느낌 나도록 만들지 말 것',
  '아이 얼굴 클로즈업 금지',
].join('\n');

// 세그먼트 연결 방식
//
// 씬 하나가 세그먼트 하나이고 최종 영상은 그것들을 이어붙여 만든다. 그래서 "한꺼번에 만들까,
// 앞의 것을 보고 다음 것을 만들까" 라는 선택이 생긴다.
// 값은 렌더가 해석한다. 화면은 목록과 문구만 갖고 백엔드는 문자열을 그대로 실어 보내므로
// (WAN_VIDEO_MODES 와 같은 규칙) 방식을 늘려도 백엔드는 바뀌지 않는다.

/** 세그먼트를 만드는 방식. 값은 렌더 잡 params 로 그대로 나간다. */
export type SegmentMode = 'parallel' | 'sequential';

export interface SegmentModeChoice {
  key: SegmentMode;
  label: string;
  description: string;
}

/**
 * 표시 순서 = 이 배열 순서. 기본은 순차다.
 * 병렬이 빠르지만 기본으로 두지 않는다. 동시에 만들면 앞뒤가 서로를 보지 못해 흐름이 끊기고 그
 * 차이는 영상을 다 만든 뒤에야 보인다. 빠른 쪽을 원하는 사람은 고르면 된다.
 */
export const SEGMENT_MODES: SegmentModeChoice[] = [
  {
    key: 'sequential',
    label: '자연스러운 흐름',
    description: '세그먼트를 순서대로 만듭니다. 앞 장면을 이어받아 흐름이 매끄럽습니다',
  },
  {
    key: 'parallel',
    label: '빠른 생성',
    // "동시에" 라고 적지 않는다. 제출은 영상 모델의 요청 한도에 맞춰 간격을 두고 나가고 생성이
    //   겹치는 것이라, 한 번에 다 시작되지 않는 것을 보고 멈춘 줄 알면 안 된다.
    description:
      '세그먼트를 겹쳐 만들어 순차보다 빠릅니다. 영상 모델의 요청 한도에 맞춰 보내는 간격은 자동으로 조절되고, 장면 사이 흐름은 끊길 수 있습니다',
  },
];

export const DEFAULT_SEGMENT_MODE: SegmentMode = 'sequential';
