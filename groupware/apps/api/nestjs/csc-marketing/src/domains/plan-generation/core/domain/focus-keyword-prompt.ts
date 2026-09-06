// 포커스 키워드 보완 프롬프트 SSOT
// 후보는 수집 서버가 먼저 주고, 목표 개수를 못 채울 때 모자란 만큼만 이 프롬프트로 보완한다.
// 그래서 필요 개수와 이미 나온 후보를 함께 받는다(후자가 없으면 같은 말이 두 줄로 남는다)
// 후보는 입력 키워드를 품은 롱테일이자 검색해서 찾는 짧은 말이어야 하고 브랜드는 넣지 않는다.
// 세그먼트 정의 배열 하나가 진실원이라 프롬프트를 고치면 프로세스 화면이 함께 바뀐다.

import { PromptSegmentDef, assembleSegments } from './prompt-segment';

// 기획서 한 건이 받을 수 있는 목적 키워드 수. 많으면 한 기획안이 흩어져 어느 것도 깊이 다루지 못함
export const FOCUS_KEYWORD_MAX = 5;

// 화면에 보여줄 후보 목록의 목표 개수. 이 수를 채우는 것이 계약이고 수집분이 모자라면 LLM 이 채움
export const FOCUS_KEYWORD_SUGGESTION_COUNT = 15;

// 보완 호출 최대 횟수. 상한이 없으면 새 말을 못 만드는 주제에서 같은 호출이 끝없이 반복됨
export const FOCUS_KEYWORD_MAX_ATTEMPTS = 3;

// 후보 하나의 최대 길이. 검색어라 이보다 길면 문장이므로 잘라서 버림
export const FOCUS_KEYWORD_MAX_LENGTH = 100;

export const FOCUS_KEYWORD_SYSTEM_PROMPT = [
  '너는 마케팅 영상 기획을 위한 검색 키워드를 뽑는 사람이다.',
  '',
  '규칙:',
  '- **주제로 받은 말을 글자 그대로 포함**하고, 그보다 긴 검색어를 만든다(롱테일).',
  '  예: 주제가 "수분크림" 이면 "수분크림 추천", "지성피부 수분크림" 은 되고 "속건조" 는 안 된다.',
  '- 사람들이 그 주제를 찾을 때 실제로 검색창에 치는 짧은 말을 쓴다.',
  '- 한 후보는 한 줄, 2~4 단어 정도로 짧게 쓴다. 문장이나 광고 문구를 쓰지 않는다.',
  '- 서로 다른 각도로 흩어 놓는다(증상, 원인, 해결, 사용 상황, 비교, 시기).',
  '- 특정 브랜드명이나 상품명을 넣지 않는다.',
  '- 같은 말을 어미만 바꿔 반복하지 않는다.',
  '- 이미 있는 후보와 같거나 어미만 다른 말을 만들지 않는다.',
  '- 가운뎃점 문자를 쓰지 않는다.',
  '',
  '요청받은 개수만큼 JSON 문자열 배열로만 출력한다. 다른 설명을 붙이지 않는다.',
  '예: 주제가 "아기 발진" 이면 ["아기 발진 연고", "신생아 아기 발진", "아기 발진 병원"]',
].join('\n');

/** 보완 프롬프트 조립 입력. 전부 호출 시점 런타임 값 */
export interface FocusKeywordPromptContext {
  // 작업자가 넣은 주제 한 줄
  seed: string;
  // 채널 이름(어디에 쓸 영상인지의 맥락). 없으면 빈 문자열
  channelName: string;
  // 수집으로 이미 확보한 후보. 모델이 같은 말을 다시 만들지 않게 그대로 보여줌
  existing: string[];
  // 더 만들어야 하는 개수(목표 개수에서 수집분을 뺀 값)
  needed: number;
}

/**
 * 유저 프롬프트 세그먼트 정의. 조립 순서 그대로가 SSOT
 * 각 섹션은 앞에 빈 줄을 두고 이어붙음(첫 섹션 제외)
 */
export const FOCUS_KEYWORD_SEGMENTS: readonly PromptSegmentDef<FocusKeywordPromptContext>[] =
  [
    {
      id: 'seed',
      title: '주제',
      kind: 'injected',
      template: '주제: {작업자가 입력한 주제}',
      note: '키워드 검색 화면에서 작업자가 검색한 주제 한 줄이 들어갑니다.',
      render: (ctx) => [`주제: ${ctx.seed.trim()}`],
    },
    {
      id: 'channel',
      title: '채널',
      kind: 'conditional',
      template: '채널: {채널명}',
      note: '어디에 쓸 영상인지의 맥락입니다. 채널 이름이 있을 때만 포함됩니다.',
      render: (ctx) =>
        ctx.channelName.trim() ? [`채널: ${ctx.channelName.trim()}`] : [],
    },
    {
      id: 'existing',
      title: '이미 있는 후보',
      kind: 'conditional',
      template: '[이미 있는 후보]\n{수집으로 확보한 키워드, 줄바꿈 구분}',
      note: '수집으로 이미 확보한 후보가 있을 때만 포함됩니다. 모델이 같은 말을 다시 만들지 않게 합니다.',
      blankBefore: true,
      render: (ctx) =>
        ctx.existing.length === 0
          ? []
          : ['[이미 있는 후보]', ...ctx.existing.map((k) => `- ${k}`)],
    },
    {
      id: 'instruction',
      title: '지시',
      kind: 'injected',
      template:
        '위 주제를 그대로 포함하는 더 긴 검색어(롱테일)를 {필요 개수}개 더 뽑는다.',
      note: '목표 개수에서 수집분을 뺀 수가 들어갑니다. 수집만으로 채워지면 이 호출 자체를 하지 않습니다.',
      blankBefore: true,
      render: (ctx) => [
        `위 주제를 그대로 포함하는 더 긴 검색어(롱테일)를 ${ctx.needed}개 더 뽑는다.`,
      ],
    },
  ];

/** 프로세스 뷰용 빈 컨텍스트. 전부 런타임 값이라 뷰는 template 만 보여줌 */
export const FOCUS_KEYWORD_VIEW_CONTEXT: FocusKeywordPromptContext = {
  seed: '',
  channelName: '',
  existing: [],
  needed: FOCUS_KEYWORD_SUGGESTION_COUNT,
};

/** 최종 유저 프롬프트 조립. FOCUS_KEYWORD_SEGMENTS 에서 파생 */
export function buildFocusKeywordUserPrompt(ctx: FocusKeywordPromptContext): string {
  return assembleSegments(FOCUS_KEYWORD_SEGMENTS, ctx);
}
