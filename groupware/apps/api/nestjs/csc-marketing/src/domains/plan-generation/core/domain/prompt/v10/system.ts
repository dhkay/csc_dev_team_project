// v1.0 기획서 생성 시스템 프롬프트 SSOT
// 구조: 고정 HEADER + 편집 가능 INSTRUCTIONS(중간) + 고정 FOOTER(JSON 스키마)
// HEADER 와 FOOTER 는 출력 계약이라 고정이고 조각을 합치는 것은 버전별 조립기의 일
// 언어는 한국어 한 벌이고 JSON 필드명만 영문(파서와의 계약 식별자)

import { InfographicType } from '../../entities';
import { PromptSegmentDef } from '../../prompt-segment';
import type { PlanSystemPromptContext } from '../context';
import { usesCustomPlanInstructions } from '../context';
import {
  DEFAULT_PLAN_COUNT,
  DEFAULT_SCENE_COUNT,
  MAX_PLAN_COUNT,
  MAX_SCENE_COUNT,
  MIN_PLAN_COUNT,
  MIN_SCENE_COUNT,
} from '../../plan-counts';

// 머리말(과제). 개수는 생성 시 buildCountDirective 로 주입되고 HEADER 자체는 개수 불변
export const PLAN_SYSTEM_HEADER = `수집한 데이터를 바탕으로, 목적 키워드를 중심에 두고 한국 시청자를 위한 서로 다른 마케팅 영상 기획안을 만든다.`;

// 목적 키워드 없이 생성할 때의 머리말
// 없는 것을 중심에 두라는 지시가 되면 모델이 그 자리를 스스로 메워 브랜드와 무관한 방향으로 흐름
export const PLAN_SYSTEM_HEADER_NO_KEYWORD = `브랜드와 브랜드 설명을 중심에 두고 한국 시청자를 위한 서로 다른 마케팅 영상 기획안을 만든다.`;

/** 선택된 개수 지시. HEADER 와 작업자 지침 사이에 주입되고 프롬프트 뷰도 재사용 */
function buildCountDirective(proposalCount: number, sceneCount: number): string {
  return `정확히 ${proposalCount}개의 기획안을 만들고, 각 기획안은 정확히 ${sceneCount}개의 씬을 갖게 한다.`;
}

// 편집 가능한 중간 지침(기본값). 창작과 구성 방향만 담고 출력 형식은 FOOTER 가 고정
export const DEFAULT_PLAN_INSTRUCTIONS = [
  '핵심 원칙:',
  '- 목적 키워드를 기획안의 중심 주제로 삼는다. 소재와 근거는 수집 데이터(인기 검색어, 연관 키워드)에서 끌어온다.',
  '- 브랜드 컨셉의 표현 형식과 무드가 씬 연출과 비주얼을 이끌고, 톤앤매너가 나레이션과 자막의 화법을 이끈다. 컨셉을 모든 씬에 일관되게 적용한다(컨셉이 창작의 중심축).',
  '- 브랜드명은 절제한다. 전면 배치나 반복, 노골적 광고는 하지 않는다. 유용한 정보와 공감이 먼저이고, 브랜드는 가볍고 자연스럽게만 드러낸다.',
  '기획안 하나는 아이디어 하나(제목 + 한 줄 요약)와 씬 목록으로 이뤄진다.',
  '각 씬은 소스 방향(연출 지시), 하단 자막, 나레이션을 갖는다.',
  '기획안당 인포그래픽은 최대 1개다. 정보가 가장 잘 정리되는 단 하나의 씬에만 넣고, 없어도 된다. 내용에 맞는 형태를 고른다(리스트/표/막대/비교/단계/통계/타임라인). 감성적이거나 스토리 중심 기획안에서는 생략하고 억지로 넣지 않는다(안 쓰면 infographic 필드를 뺀다).',
  '자막과 나레이션은 짧게 쓴다(자막 약 25자, 나레이션 약 50자). 늘려 쓰지 않는다.',
].join('\n');

// 인포그래픽 형태별 스키마 예시. InfographicType 으로 키를 고정해 누락이 컴파일 에러로 잡힘
// 형태 추가 = 엔티티 유니온 멤버 + 여기 한 줄 + 파서 case + 렌더러 레지스트리
// 값 자리는 한국어로 채움(우리 캔버스 렌더러가 그려 이미지 모델을 거치지 않아 안전)
const INFOGRAPHIC_TYPE_SCHEMAS: Record<InfographicType, string> = {
  list: '{ "type": "list", "title": "한국어 값", "items": ["한국어 값", "한국어 값", "한국어 값"] }',
  table:
    '{ "type": "table", "title": "한국어 값", "columns": ["한국어 값", "한국어 값"], "rows": [["한국어 값", "한국어 값"]] }',
  bar: '{ "type": "bar", "title": "한국어 값", "unit": "%", "bars": [{ "label": "한국어 값", "value": 70 }, { "label": "한국어 값", "value": 30 }] }',
  comparison:
    '{ "type": "comparison", "title": "한국어 값", "left": { "heading": "한국어 값", "points": ["한국어 값"] }, "right": { "heading": "한국어 값", "points": ["한국어 값"] } }',
  steps: '{ "type": "steps", "title": "한국어 값", "steps": ["한국어 값", "한국어 값", "한국어 값"] }',
  stat: '{ "type": "stat", "title": "한국어 값", "stats": [{ "value": "87%", "label": "한국어 값" }] }',
  timeline:
    '{ "type": "timeline", "title": "한국어 값", "events": [{ "time": "한국어 값", "label": "한국어 값" }] }',
};

/** 스키마 예시 줄. type 열 폭을 맞춰 정렬 */
function infographicSchemaLines(): string[] {
  return Object.entries(INFOGRAPHIC_TYPE_SCHEMAS).map(
    ([type, schema]) => `  ${type.padEnd(11)}→ ${schema}`,
  );
}

/**
 * 고정 꼬리말 빌더: 출력 형식(오직 JSON)과 스키마. 파싱 계약이라 고정
 * excludeInfographic 이면 씬 스키마에서 infographic 필드를 빼 생성 자체를 막음
 */
function buildPlanSystemFooter(excludeInfographic = false): string {
  // 씬 필드는 콤마 없이 나열하고 join 으로 구분자를 붙임(필드 추가와 삭제 시 콤마 실수 방지)
  const sceneFields = [
    '"index": 1',
    '"sourceDirection": "촬영팀이 읽을 연출 지시"',
    '"subtitle": "화면 하단 자막"',
    '"narration": "나레이션"',
    '"imagePrompt": "이 컷을 위한 완결된 시각 브리프"',
    ...(excludeInfographic
      ? []
      : ['"infographic": { "type": "list|table|bar|comparison|steps|stat|timeline", "title": "제목", ...형태별 필드 }']),
    // 효과음은 선택(0..N). id 는 후보 목록에서, offsetSec 은 씬 시작 기준 초(음수는 전환에 걸침)
    '"sfx": [ { "assetId": <사용 가능한 효과음 목록의 id>, "offsetSec": <이 씬 시작 기준 부호 있는 초. 음수면 이 씬으로 들어오는 전환에 걸친다> } ]  (선택 배열, 없으면 생략)',
  ];
  const sceneBlock = sceneFields.map((f) => `        ${f}`).join(',\n');
  const lines = [
    '아래 JSON 스키마에 맞는 배열만 출력한다. 마크다운 코드펜스, 설명 문장, 주석을 절대 붙이지 않는다.',
    '가운뎃점 문자를 쓰지 않는다.',
    '',
    // 값은 전부 한국어이고 필드명만 영문(파서와의 계약 식별자라 번역 대상이 아님)
    '모든 값은 한국어로 쓴다. 필드명(title, scenes, imagePrompt 등)은 파서가 읽는 식별자이므로 그대로 둔다.',
    '',
    'imagePrompt: 이 한 컷을 위한 완결된 시각 브리프를 쓴다.',
    '- 그 컷이 보여주는 것, 자막과 나레이션의 의미, 브랜드 맥락을 녹여 넣는다.',
    '- 보이는 것만 묘사한다. 이미지에 글자, 자막, 로고, 워터마크를 넣으라고 하지 않는다.',
    '- 자막을 그대로 옮겨 적지 말고, 사진가가 무엇을 담아야 하는지를 쓴다.',
    '',
    'JSON 스키마:',
    '[',
    '  {',
    '    "id": "영문 소문자와 하이픈으로 된 짧은 고유 식별자",',
    '    "title": "기획안 제목",',
    '    "summary": "한 줄 요약",',
    '    "bgm": { "assetId": <사용 가능한 BGM 목록의 id> },',
    '    "scenes": [',
    '      {',
    sceneBlock,
    '      }',
    '    ]',
    '  }',
    ']',
  ];
  if (!excludeInfographic) {
    // 형태별 필드는 씬 스키마 밖 가이드로 둠(JSON 을 깔끔히 유지)
    lines.push(
      '',
      '인포그래픽 형태: 정보가 밀집된 씬 최대 한 곳에만, 내용에 맞는 형태 하나를 골라 그 형태의 필드를 채운다.',
      ...infographicSchemaLines(),
    );
  }
  return lines.join('\n');
}

// 고정 꼬리말(기본은 인포그래픽 포함). 프롬프트 편집 뷰가 읽기 전용으로 보여주는 값
export const PLAN_SYSTEM_FOOTER = buildPlanSystemFooter(false);

// 인포그래픽 배제 지시. 편집된 instructions 보다 우선하도록 지시부에 강하게 명시
const EXCLUDE_INFOGRAPHIC_DIRECTIVE =
  '인포그래픽을 만들지 않는다. 모든 씬은 소스 방향, 자막, 나레이션, imagePrompt 만 갖는다(infographic 필드를 뺀다).';

// 오디오 선택 지시. 유저 프롬프트가 준 후보 목록에서만 고르게 하는 고정 계약
// BGM 은 기획안당 1개, 효과음은 어울리는 씬에만. 목록이 비면 해당 필드를 생략
const AUDIO_SELECTION_DIRECTIVE = [
  '오디오 선택(제공된 목록에서만 고르고 id 를 지어내지 않는다):',
  '- BGM: 기획안 전체에 어울리는 무드와 장르의 BGM 1개를 [사용 가능한 BGM] 목록에서 골라 기획안 레벨 "bgm" 에 넣는다. 목록이 비어 있으면 "bgm" 을 생략한다.',
  '- 효과음: 씬에 매인 것이 아니라 타임라인 큐다. 전환, 자막 강조, 인트로, 아웃트로에 어울리는 순간에 [사용 가능한 효과음] 목록에서 태그(type/usage/mood)가 그 순간에 맞는 것을 골라 가까운 씬의 "sfx" 배열에 넣는다(보통 0~1개, 분명히 필요할 때만 최대 2개). 각 항목에는 그 씬 시작 기준의 부호 있는 offsetSec(초)를 준다. 0이면 그 씬으로의 컷에 정확히, 음수면 전환에 걸쳐(앞 씬에서 시작), 양수면 씬 안에 놓인다. 대부분의 씬은 없어도 되며 그때는 "sfx" 를 생략한다. 목록이 비어 있으면 넣지 않는다.',
].join('\n');

// 주제 지시 두 갈래가 함께 지키는 규칙. 한 곳에 두는 이유는 갈래가 늘 때 한쪽에서만 빠지는 것을 막기 위함
const IMAGE_PROMPT_ONLY_RULE = '씬 이미지는 오직 imagePrompt 로만 만들어진다. 거기 쓰지 않은 것은 화면에 나오지 않는다.';

// 목적 키워드 표현 지시. 씬 이미지에 캠페인 주제가 담기게 하는 유일한 경로라 고정부에 둠
// 키워드를 이미지 프롬프트에 직접 주입하면 모델이 문자 그대로 그리라는 요청으로 읽어 씬이 거부됨
// 어떻게 드러낼지는 씬을 쓰는 기획 LLM 이 판단하고, 작업자가 지침을 덮어써도 유지되어야 함
const PURPOSE_KEYWORD_DIRECTIVE = [
  '목적 키워드가 이 캠페인이 파는 주제이고, 수집 데이터는 그 주제에 붙이는 각도다.',
  '(예: 수집 데이터가 월드컵이고 목적 키워드가 아이스크림이면 "월드컵 때 가장 많이 팔린 아이스크림 TOP N" 처럼 엮는다.)',
  '목적 키워드를 모든 씬에 직접 또는 간접으로 드러낸다. 어느 쪽으로 할지는 네가 정한다.',
  '- 직접: 키워드가 가리키는 것을 화면에 보여준다.',
  '- 간접: 그것을 보여주기 어렵거나 부적절하면 상황, 사물, 손, 표정, 전후 결과로 대신 전한다.',
  '- 키워드가 여럿이면 한 씬에 몰지 말고 씬들에 나눠 담되, 한 기획안이 전부를 다룬다.',
  IMAGE_PROMPT_ONLY_RULE,
].join('\n');

// 목적 키워드 없이 생성할 때의 주제 지시
// 소재 결정이 모델에게 넘어오는데 말해 주지 않으면 브랜드 소개 영상이 개수만큼 거의 같게 나옴
export const BRAND_SUBJECT_DIRECTIVE = [
  '이번 생성에는 목적 키워드가 없다. 브랜드와 브랜드 설명이 이 캠페인이 파는 주제다.',
  '- 무엇을 파는 브랜드인지에서 다룰 소재를 직접 뽑는다. 브랜드 소개로 끝내지 않는다.',
  '- 컨셉은 연출과 화법을 정할 뿐이다. 무엇을 다룰지는 브랜드 설명에서 정한다.',
  '- 기획안마다 다른 각도를 잡는다(사용 장면, 문제와 해결, 비교, 후기, 정보 전달 등). 같은 소재를 되풀이하지 않는다.',
  IMAGE_PROMPT_ONLY_RULE,
].join('\n');

// 이미지 생성 안전 제약. 벤더에서 거부될 컷을 애초에 만들지 않게 함
// gpt-image 는 영유아 신체를 사실적으로 묘사하는 요청을 차단해 그 씬만 이미지 생성이 실패
// 편집 지침이 아니라 고정 지시부인 이유: 벤더 제약이라 작업자가 지울 수 있으면 안 됨
export const IMAGE_SAFETY_DIRECTIVE = [
  '씬 연출 제약(이미지 모델이 실제로 거부하는 것이므로 엄격히 지킨다):',
  '- 영유아나 미성년의 신체를 컷의 주제로 삼지 않는다. 기저귀 교체, 목욕, 맨살, 노출 부위 클로즈업을 연출하지 않는다.',
  '- 아이가 나와야 하면 옷을 갖춰 입은 일상 순간으로 두고, 신체가 아니라 표정과 상황을 중심에 둔다.',
  '- 아이와 관련된 주제는 제품 컷, 보호자의 손과 표정, 사용하는 행위, 주변 공간과 사물로 대신 전한다.',
].join('\n');

/**
 * 이 채널의 이미지 모델에 적용되는 안전 제약. 해당 없으면 빈 문자열
 * 제약이 필요한 벤더는 외부 gpt-image 계열뿐이라 자체 호스팅에는 걸지 않음
 * 프롬프트 조립과 편집 화면 뷰가 이 함수를 함께 써 보이는 것과 나가는 것이 어긋나지 않음
 */
export function resolveImageSafetyDirective(imageModel: string | undefined): string {
  return (imageModel ?? '').startsWith('gpt-image') ? IMAGE_SAFETY_DIRECTIVE : '';
}

/**
 * 기획서 시스템 프롬프트의 세그먼트 정의. 조립 순서 그대로가 SSOT
 * 실제 조립과 프로세스 뷰가 모두 이 배열에서 파생됨
 * 안전 제약은 키워드 지시 뒤("간접으로 대신 전하라"의 판단 기준), 오디오 계약은 FOOTER 바로 앞
 */
export const PLAN_SYSTEM_SEGMENTS: readonly PromptSegmentDef<PlanSystemPromptContext>[] = [
  {
    id: 'header',
    title: '머리말 (과제 정의)',
    kind: 'injected',
    template: PLAN_SYSTEM_HEADER,
    note:
      '목적 키워드를 고르지 않고 생성하면 대신 브랜드를 중심에 둔 머리말이 들어갑니다: ' +
      `“${PLAN_SYSTEM_HEADER_NO_KEYWORD}”`,
    // 수집 데이터와 목적 키워드 둘 다 유저가 공급하는 값
    links: ['purpose-keywords'],
    render: (ctx) => [ctx.hasPurposeKeywords ? PLAN_SYSTEM_HEADER : PLAN_SYSTEM_HEADER_NO_KEYWORD],
  },
  {
    id: 'count',
    title: '개수 지시',
    kind: 'injected',
    // 뷰는 생성 선택과 무관해야 하므로 기본값을 예시로 보여줌(실제 값은 render 가 채움)
    template: buildCountDirective(DEFAULT_PLAN_COUNT, DEFAULT_SCENE_COUNT),
    note:
      `실제로는 생성 시 작업자가 고른 값이 들어갑니다(기획안 ${MIN_PLAN_COUNT}~${MAX_PLAN_COUNT}개, ` +
      `씬 ${MIN_SCENE_COUNT}~${MAX_SCENE_COUNT}개). 표시된 ${DEFAULT_PLAN_COUNT}, ${DEFAULT_SCENE_COUNT}은 예시입니다.`,
    // 같은 개수를 유저의 최종 지시가 다시 못박음
    links: ['final-instruction'],
    render: (ctx) => [buildCountDirective(ctx.proposalCount, ctx.sceneCount)],
  },
  {
    id: 'exclude-infographic',
    title: '인포그래픽 배제 지시',
    kind: 'conditional',
    template: EXCLUDE_INFOGRAPHIC_DIRECTIVE,
    note: "생성 시 '인포그래픽 없이' 옵션을 켰을 때만 포함됩니다.",
    render: (ctx) => (ctx.excludeInfographic ? [EXCLUDE_INFOGRAPHIC_DIRECTIVE] : []),
  },
  {
    id: 'purpose-keyword',
    title: '목적 키워드 지시',
    kind: 'conditional',
    template: PURPOSE_KEYWORD_DIRECTIVE,
    note: '목적 키워드를 하나 이상 고르고 생성했을 때만 포함됩니다.',
    blankBefore: true,
    // 목적 키워드(주제)와 수집 데이터(각도)를 어떻게 엮을지 규정하고 그 둘은 유저가 공급
    links: ['purpose-keywords'],
    render: (ctx) => (ctx.hasPurposeKeywords ? [PURPOSE_KEYWORD_DIRECTIVE] : []),
  },
  {
    id: 'brand-subject',
    title: '브랜드 주제 지시 (목적 키워드 없이 생성할 때)',
    kind: 'conditional',
    template: BRAND_SUBJECT_DIRECTIVE,
    note: '목적 키워드 없이 생성했을 때만 포함됩니다(위 목적 키워드 지시를 대신합니다).',
    blankBefore: true,
    links: ['brand-concept'],
    render: (ctx) => (ctx.hasPurposeKeywords ? [] : [BRAND_SUBJECT_DIRECTIVE]),
  },
  {
    id: 'image-safety',
    title: '이미지 안전 제약',
    kind: 'conditional',
    template: IMAGE_SAFETY_DIRECTIVE,
    // 적용 여부가 render 와 같은 판정에서 나와 화면과 실제가 어긋나지 않음
    note: (ctx) =>
      resolveImageSafetyDirective(ctx.imageModel)
        ? '현재 채널의 이미지 모델(gpt-image 계열)에 적용 중입니다.'
        : '이미지 모델이 gpt-image 계열일 때만 포함됩니다(현재 채널은 미적용).',
    blankBefore: true,
    render: (ctx) => {
      const safety = resolveImageSafetyDirective(ctx.imageModel);
      return safety ? [safety] : [];
    },
  },
  {
    id: 'instructions',
    title: '작업자 편집 지침 (기본 지침)',
    kind: 'editable',
    // 뷰는 항상 기본 지침 기준으로 보여주고 커스텀 저장 여부는 note 로만 알림
    template: DEFAULT_PLAN_INSTRUCTIONS,
    note: (ctx) =>
      usesCustomPlanInstructions(ctx.instructions, DEFAULT_PLAN_INSTRUCTIONS)
        ? '작업자가 채널별로 편집하는 유일한 부분입니다. 표시되는 값은 「기본으로 되돌리기」 기준의 기본 지침이며, 이 채널은 현재 커스텀 지침을 사용 중입니다(편집 버튼에서 확인/수정).'
        : '작업자가 채널별로 편집하는 유일한 부분입니다. 이 채널은 현재 기본 지침을 사용합니다(편집 버튼으로 수정).',
    blankBefore: true,
    // 컨셉으로 연출과 화법을, 목적 키워드를 중심으로, 수집 데이터에서 근거를 끌라는 지침
    links: ['brand-concept', 'purpose-keywords'],
    render: (ctx) => [(ctx.instructions ?? '').trim() || DEFAULT_PLAN_INSTRUCTIONS],
  },
  {
    id: 'audio-selection',
    title: '오디오(BGM/효과음) 선택 지시',
    kind: 'fixed',
    template: AUDIO_SELECTION_DIRECTIVE,
    blankBefore: true,
    // 후보 목록에서만 고르게 하는 계약이고 그 목록은 유저가 공급
    links: ['available-bgm', 'available-sfx'],
    render: () => [AUDIO_SELECTION_DIRECTIVE],
  },
  {
    id: 'footer',
    title: '출력 형식 / JSON 스키마',
    kind: 'fixed',
    template: PLAN_SYSTEM_FOOTER,
    blankBefore: true,
    // 출력 스키마의 assetId 는 유저가 준 후보 id 로 채워짐
    links: ['available-bgm', 'available-sfx'],
    render: (ctx) => [buildPlanSystemFooter(ctx.excludeInfographic)],
  },
];
