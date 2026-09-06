// 씬 이미지 생성 프롬프트 SSOT. 전문이 한국어 한 벌이라 저장된 값이 그대로 모델에 나간다.
// 순서: 표현 형식(매체) → 이 컷의 브리프 → 무드 → 형식과 금지 규칙
// 확산 모델이 앞 토큰을 강하게 반영하므로 매체를 먼저 고정하고 곧바로 컷 브리프를 둔다.
// 무드와 형식은 한 기획안의 모든 씬에 공통이라 씬 간 비주얼 일관성을 만든다.
// 톤앤매너는 화법이라 정지 이미지에 넣지 않고, 브랜드명도 분위기로만 절제해 드러낸다.

import { ConceptSelection, conceptLine } from './brand-concept';
import { PromptSegmentDef, assembleSegments } from './prompt-segment';

/**
 * 이미지 생성 엔진의 현재 부하. 자체 호스팅일 때의 큐 현황이고 외부 벤더는 null
 * ComfyUI 는 전 환경이 GPU 1장을 공유해 내 대기 시간을 이 큐가 정함
 */
export interface PlanImageEngineLoad {
  // 지금 그리는 중인 잡 수
  running: number;
  // 차례를 기다리는 잡 수
  pending: number;
}

// 이미지 품질(비용과 시간 레버): low / medium / high
export const PLAN_IMAGE_QUALITY = 'medium';

/** 이미지 프롬프트용 브랜드/컨셉 입력(스타일 앵커의 근거) */
export interface SceneImageBrand {
  name: string;
  description: string;
  // 축별 컨셉 선택. 이미지 앵커는 style 과 mood 만 사용(tone 은 화법이라 제외)
  concepts: ConceptSelection[];
}

/**
 * 이미지 프롬프트용 씬 입력: LLM 이 쓴 시각 브리프 한 덩어리
 *
 * 목적 키워드와 기획안 제목, 자막과 나레이션 원문, 브랜드 설명은 여기 없는 것이 의도된 설계
 * 마케팅 언어를 넣으면 모델이 문자 그대로 그릴 대상으로 읽어 같은 씬이 성공과 거부로 갈림
 * 그 의미는 기획 LLM 이 imagePrompt 에 이미 접어넣었고 제목은 seed 계산에만 쓰임
 */
export interface SceneImageSubject {
  // LLM 이 쓴 시각 브리프
  imagePrompt: string;
  // 화면비 라벨(예: "vertical (4:5)"). 버전이 정하는 값이라 호출부가 제공
  // 한 값을 고정하면 그림과 캔버스가 어긋나 렌더러가 꽉 채워 자름
  aspectLabel: string;
}

// 매체 미선택 시 기본(프롬프트 뷰도 재사용)
const DEFAULT_STYLE_LINE = '실제로 촬영한 듯한 고품질 실사 느낌.';

/**
 * 화면비 라벨을 받아 형식 지시를 만든다. 상수로 두면 그림과 캔버스가 어긋남
 * 금지 규칙은 한 줄로 합침(상표를 명시하면 부정형이어도 벤더 모더레이션이 IP 의도로 읽어 거부)
 */
const formatLines = (aspectLabel: string) => [
  `숏폼 마케팅 영상용 ${aspectLabel} 정지 이미지 1장. 한 기획안의 모든 컷이 같은 색감, 조명, 아트디렉션을 공유한다.`,
  '글자, 자막, 로고, 워터마크는 화면 어디에도 넣지 않는다. 분위기만으로 전달하는 순수 비주얼.',
];

/** 씬 이미지 프롬프트 조립 입력 */
export interface SceneImagePromptContext {
  brand: SceneImageBrand;
  scene: SceneImageSubject;
}

function conceptOn(ctx: SceneImagePromptContext, axis: string): string {
  return conceptLine(ctx.brand.concepts.find((c) => c.axis === axis));
}

/**
 * 씬 이미지 프롬프트의 세그먼트 정의. 조립 순서 그대로가 SSOT
 * 실제 호출(buildSceneImagePrompt)과 프로세스 뷰가 모두 이 배열에서 파생됨
 */
export const SCENE_IMAGE_SEGMENTS: readonly PromptSegmentDef<SceneImagePromptContext>[] = [
  {
    id: 'style',
    title: '표현 형식 (매체)',
    kind: 'injected',
    template: `표현 형식: {표현 형식}, {감독 노트}\n(미선택 시 기본: ${DEFAULT_STYLE_LINE})`,
    note: '브랜드 컨셉의 표현 형식에서 주입됩니다. 확산 모델이 앞 토큰을 강하게 반영해 맨 앞에 둡니다.',
    // 매체는 맨 앞. 미선택 시 소프트 기본(실사)
    render: (ctx) => [conceptOn(ctx, 'style') || DEFAULT_STYLE_LINE],
  },
  {
    id: 'image-brief',
    title: '이 컷 브리프',
    kind: 'injected',
    template: '{이 컷을 위한 완결된 시각 브리프}',
    note: '씬마다 다릅니다. 기획 LLM 이 장면과 자막/나레이션의 의미, 브랜드 맥락을 접어 쓴 imagePrompt.',
    // 이 컷: LLM 이 장면과 대사 의미, 브랜드 맥락을 접어넣은 브리프
    render: (ctx) => (ctx.scene.imagePrompt ? [ctx.scene.imagePrompt] : []),
  },
  {
    id: 'mood',
    title: '무드',
    kind: 'injected',
    template: '무드: {무드}, {감독 노트}',
    note: '브랜드 컨셉의 무드에서 주입됩니다. 한 기획안의 모든 씬에 공통(비주얼 일관성).',
    // 씬 간 일관성용 공통값. 톤앤매너는 화법이라 제외
    render: (ctx) => {
      const mood = conceptOn(ctx, 'mood');
      return mood ? [mood] : [];
    },
  },
  {
    id: 'format',
    title: '형식 / 금지 규칙',
    kind: 'fixed',
    // 뷰에는 자리표시로 노출. 실제 값은 그 버전의 화면비라 렌더 시점에 정해짐
    template: formatLines('{화면비}').join('\n'),
    note: '톤앤매너는 화법이라 정지 이미지 프롬프트에는 넣지 않습니다. 화면비 라벨은 그 버전의 화면비에서 파생됩니다.',
    render: (ctx) => formatLines(ctx.scene.aspectLabel),
  },
];

/**
 * 프로세스 뷰용 빈 컨텍스트. 컨셉과 브리프가 전부 런타임 값이라 뷰는 template 만 보여줌
 * 세그먼트 note 해석에만 쓰임(현재 전부 정적 문구)
 */
export const SCENE_IMAGE_VIEW_CONTEXT: SceneImagePromptContext = {
  brand: { name: '', description: '', concepts: [] },
  scene: { imagePrompt: '', aspectLabel: '{화면비}' },
};

/** 씬 이미지 프롬프트 조립. 매체 → 컷 브리프 → 무드 → 형식과 금지 순서 */
export function buildSceneImagePrompt(brand: SceneImageBrand, scene: SceneImageSubject): string {
  return assembleSegments(SCENE_IMAGE_SEGMENTS, { brand, scene });
}

/**
 * 문자열을 결정적 seed(32bit 양수)로 변환. 같은 입력이면 같은 seed
 * 한 기획안의 모든 씬에 동일 seed 를 써서 내장 이미지의 씬 간 일관성을 높임
 */
export function stableSeed(text: string): number {
  let hash = 2166136261; // FNV-1a 32bit
  const s = text ?? '';
  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0; // 부호 없는 32bit
}
