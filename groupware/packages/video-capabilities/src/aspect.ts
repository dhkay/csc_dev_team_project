/**
 * 마케팅 영상 화면비 카탈로그: 한 화면비가 무엇을 뜻하는가(이미지 크기, 프롬프트 라벨, CSS)
 *
 * 소비자 셋이 같은 해석을 쓰게 하는 것이 존재 이유다. web-groupware 는 CSS 비율을 그리고,
 * csc-marketing 은 렌더 스펙과 씬 이미지 크기를 정하고, video-model 은 그 문자열을 픽셀로 해석한다.
 * 앞의 둘은 이 파일을 import 하므로 어긋날 수 없고, 세 번째는 언어가 달라 문자열만 맞추고
 * `scripts/check-marketing-aspect.mjs` 가 그 일치를 CI 에서 지킨다.
 *
 * 어느 화면비를 쓰는지는 여기서 정하지 않는다. 버전이 정한다(`pipelineFor(v).aspectRatio`).
 * 그래서 전역 현재 화면비 상수를 두지 않는다. 두면 버전을 모르는 자리가 그 값을 집어 들고,
 * 어긋남은 결과 영상을 보고서야 드러난다.
 *
 * 이미지와 영상이 한 값에서 나오는 이유는 v1.0 에서 씬 이미지가 곧 영상의 한 프레임이기 때문이다.
 * 두 값이 갈리는 순간 렌더러가 이미지를 캔버스에 꽉 채워 자른다(`_cover`). 1:1 이미지를 4:5
 * 캔버스에 넣으면 위아래가 잘려 나가고, 그 사실은 결과 영상을 보고서야 드러난다.
 */

/** 지원 화면비. video-model `_DIMS` 의 키와 글자 그대로 일치해야 한다. */
export type AspectRatio = '1:1' | '9:16' | '4:5' | '16:9';

/** 화면비 → gpt-image 생성 크기(모델 지원 크기 근사) */
const IMAGE_SIZE: Record<AspectRatio, string> = {
  '1:1': '1024x1024',
  '9:16': '1024x1536',
  '4:5': '1024x1280',
  '16:9': '1536x1024',
};

/** 화면비 → 이미지 프롬프트 영어 라벨(확산 모델 구도 지시) */
const PROMPT_LABEL_EN: Record<AspectRatio, string> = {
  '1:1': 'square (1:1)',
  '9:16': 'vertical (9:16)',
  '4:5': 'vertical (4:5)',
  '16:9': 'horizontal (16:9)',
};

/** 화면비 → 가로/세로 수치. CSS 값과 픽셀 계산이 같은 출처를 쓰게 한다. */
const RATIO_PARTS: Record<AspectRatio, readonly [number, number]> = {
  '1:1': [1, 1],
  '9:16': [9, 16],
  '4:5': [4, 5],
  '16:9': [16, 9],
};

/**
 * 지원하는 화면비인가. 버전 표의 문자열이 이 카탈로그에 있는지 확인하는 문지기다.
 *
 * 두 커널이 서로를 import 하지 않아 버전 표의 값이 `string` 으로 온다. 그 값을 그대로 색인에 쓰면
 * 오타가 `undefined` 로 조용히 통과하고, 그 결과는 이미지 크기가 비어 렌더가 실패할 때 드러난다.
 */
export function isAspectRatio(value: string): value is AspectRatio {
  return value in RATIO_PARTS;
}

/** 지원하지 않는 화면비면 던진다. 조용히 기본값으로 대신하지 않는다(다른 모양이 나온다) */
function requireAspect(ratio: string): AspectRatio {
  if (!isAspectRatio(ratio)) {
    throw new Error(
      `지원하지 않는 화면비입니다: ${ratio}. @csc/video-capabilities 의 AspectRatio 를 확인하세요.`,
    );
  }
  return ratio;
}

/** 그 화면비의 이미지 생성 크기(예: 4:5 → 1024x1280) */
export function imageSizeFor(ratio: string): string {
  return IMAGE_SIZE[requireAspect(ratio)];
}

/** 그 화면비의 이미지 프롬프트 영어 라벨(예: 4:5 → "vertical (4:5)") */
export function aspectPromptLabelFor(ratio: string): string {
  return PROMPT_LABEL_EN[requireAspect(ratio)];
}

/**
 * CSS `aspect-ratio` 값(예: `9 / 16`). 비율 문자열에서 파생한다.
 *
 * 손으로 적지 않는 이유: 프론트가 별도 리터럴(`'1 / 1'`)을 들면 화면의 상자와 실제 영상의 모양이
 * 갈리는데, 카드가 `object-cover` 라 그림은 멀쩡해 보이고 아무도 눈치채지 못한다.
 *
 * Tailwind `aspect-*` 클래스를 쓰지 않는 이유: 임의 비율도 JIT 스캔 없이 즉시 반영된다.
 */
export function aspectRatioCss(ratio: string): string {
  const [w, h] = RATIO_PARTS[requireAspect(ratio)];
  return `${w} / ${h}`;
}

/**
 * 가로 대비 세로 배수(예: 9:16 → 16/9 ≈ 1.778). 캔버스 높이 계산에 쓴다.
 *
 * 이 값이 있어야 캔버스로 그리는 산출물(인포그래픽 씬 이미지, 썸네일)이 화면비를 따라온다.
 * 없으면 그쪽이 픽셀을 하드코딩하고, 화면비를 바꿀 때 잊혀지는 자리가 하나 더 생긴다.
 */
export function aspectHeightFactor(ratio: string): number {
  const [w, h] = RATIO_PARTS[requireAspect(ratio)];
  return h / w;
}
