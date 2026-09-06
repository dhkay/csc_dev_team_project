/**
 * v1.5 기획 유저 프롬프트 SSOT: 생성 시점 런타임 값 주입
 *
 * v1.0 의 것(`prompt/v10/user.ts`)과 갈라 둔 곳은 셋이다.
 *
 * 1. 브랜드 절과 연출 성격 절이 각자 조건부다. 이 버전에는 브랜드를 고르지 않는 입력 방식이
 *    있고(프롬프트 탭), 그 방식에는 연출 성격도 없다. 빈 절을 남기면 모델이 채워야 할 빈자리로
 *    읽으므로 값이 없으면 절 자체를 뺀다.
 * 2. 최종 지시가 세 갈래다. 목적 키워드 / 브랜드 / 사용자 입력사항 중 무엇을 중심에 둘지
 * 3. 효과음 후보를 싣지 않는다. 이 버전의 동영상은 장면 구성과 대화내용 둘만 갖는다(씬에 붙는
 *    효과음 자리가 없다). BGM 은 기획안 레벨이라 그대로 있다.
 */

import { conceptLines } from '../../brand-concept';
import type { AudioCandidateLine, PlanUserPromptContext } from '../context';
import { PromptSegmentDef } from '../../prompt-segment';

const UNSPECIFIED = '(지정 안 함)';
const NONE = '(없음)';

/** 오디오 후보를 `id | name | axisKey=value, ...` 줄로 렌더(태그 없으면 name 만). 비면 `(없음)`. */
function audioCandidateLines(candidates: AudioCandidateLine[]): string[] {
  if (candidates.length === 0) return [NONE];
  return candidates.map((c) => {
    const tags = c.tags.map((t) => `${t.axisKey}=${t.value}`).join(', ');
    return `${c.id} | ${c.name}${tags ? ` | ${tags}` : ''}`;
  });
}

/**
 * 최종 지시: 무엇을 중심에 둘지 + 만들 것이 영상 한 편이라는 사실
 *
 * 개수를 말하지 않는다(늘 하나다). 대신 동영상 개수를 시스템 프롬프트의 개수 지시가 못박는다.
 */
function buildV15FinalInstruction(
  hasPurposeKeywords: boolean,
  hasBrand: boolean,
): string {
  const focus = hasPurposeKeywords
    ? '위 목적 키워드를 중심으로(브랜드는 절제하고 자연스럽게 녹여)'
    : hasBrand
      ? '위 브랜드와 브랜드 설명을 중심으로'
      : '위 사용자 입력사항을 그대로 중심으로';
  return `${focus}, 마케팅 영상 한 편의 기획안을 JSON 배열로만 출력한다.`;
}

/**
 * v1.5 유저 프롬프트 세그먼트: 조립 순서 그대로가 SSOT.
 * 순서: 채널 → 브랜드 → 연출 성격 → 목적 키워드 → 사용자 입력사항 → 제한사항 → BGM 후보 → 최종 지시
 */
export const V15_USER_SEGMENTS: readonly PromptSegmentDef<PlanUserPromptContext>[] = [
  {
    id: 'channel',
    title: '채널',
    kind: 'injected',
    template: '채널: {채널명}',
    note: '현재 채널 이름이 들어갑니다.',
    render: (ctx) => [`채널: ${ctx.channelName || UNSPECIFIED}`],
  },
  {
    id: 'brand-concept',
    title: '브랜드',
    // conditional: 프롬프트 입력 방식에는 브랜드가 없다. 그때는 이 절이 통째로 빠진다.
    kind: 'conditional',
    template: '[브랜드]\n브랜드명: {브랜드명}\n브랜드 설명: {브랜드 설명}',
    note:
      '컨셉입력 방식에서 고른 브랜드/컨셉 세트의 이름과 설명입니다. ' +
      '프롬프트 방식에는 브랜드가 없어 이 절 자체가 빠집니다.',
    blankBefore: true,
    render: (ctx) =>
      ctx.brand.name
        ? [
            '[브랜드]',
            `브랜드명: ${ctx.brand.name}`,
            ...(ctx.brand.description ? [`브랜드 설명: ${ctx.brand.description}`] : []),
          ]
        : [],
  },
  {
    id: 'concepts',
    title: '연출 성격',
    kind: 'conditional',
    template:
      '[연출 성격]\n표현 형식: {표현 형식}, {감독 노트}\n무드: {무드}, {감독 노트}\n톤앤매너: {톤앤매너}, {감독 노트}\n(사운드 스타일, 콘텐츠 구조, 타겟 오디언스, 목적 유형도 같은 형식)',
    note:
      '컨셉입력 방식에서 고른 카테고리가 들어갑니다. 프롬프트 방식에는 고를 카테고리가 없어 ' +
      '이 절 자체가 빠지고, 연출은 모델이 사용자 입력사항에 맞춰 정합니다.',
    blankBefore: true,
    // 브랜드와 절을 나눈 이유: 축을 비운 채 브랜드만 고른 경우가 있다. 한 절로 묶으면 그때 빈
    //   `[브랜드와 컨셉]` 머리만 남는다.
    render: (ctx) => {
      const lines = conceptLines(ctx.brand.concepts);
      return lines.length > 0 ? ['[연출 성격]', ...lines] : [];
    },
  },
  {
    id: 'purpose-keywords',
    title: '목적 키워드',
    kind: 'conditional',
    template: '[목적 키워드]\n{선택한 목적 키워드, 쉼표 구분}',
    note: '작업자가 이번 생성에 고른 목적 키워드가 들어갑니다. 고르지 않았으면 이 절 자체가 빠집니다.',
    blankBefore: true,
    render: (ctx) =>
      ctx.purposeKeywords.length > 0 ? ['[목적 키워드]', ctx.purposeKeywords.join(', ')] : [],
  },
  {
    id: 'scene-brief',
    title: '사용자 입력사항',
    kind: 'conditional',
    template: '[사용자 입력사항]\n{작업자가 직접 적은 동영상 구성/요구사항}',
    note:
      '작업자가 생성 화면에서 직접 적은 요구사항입니다. 동영상 개수도 여기서 파생됩니다' +
      '(번호를 붙여 적은 만큼). 프롬프트 입력 방식에서는 이 절이 곧 주제입니다.',
    blankBefore: true,
    render: (ctx) => (ctx.sceneBrief ? ['[사용자 입력사항]', ctx.sceneBrief] : []),
  },
  {
    id: 'constraints',
    title: '제한사항',
    kind: 'conditional',
    template: '[제한사항]\n{작업자가 직접 적은, 피해야 할 것}',
    note: '작업자가 생성 화면에서 직접 적은 제한사항입니다. 적지 않았으면 이 절 자체가 빠집니다.',
    blankBefore: true,
    // 사용자 입력사항 바로 뒤다. "이렇게 만들되 이건 피하라" 가 한 덩어리로 읽혀야 한다.
    render: (ctx) => (ctx.constraints ? ['[제한사항]', ctx.constraints] : []),
  },
  {
    id: 'available-bgm',
    title: 'BGM 후보',
    kind: 'injected',
    template: '[사용 가능한 BGM] (영상 전체에 쓸 하나를 id 로 고른다)\n{id | 이름 | 태그(mood=…, genre=…, …)}',
    note: '조직이 쓸 수 있는 BGM 에셋 목록이 주입됩니다. 이 중에서 AI 가 1개를 고릅니다(없으면 (없음)).',
    blankBefore: true,
    render: (ctx) => [
      '[사용 가능한 BGM] (영상 전체에 쓸 하나를 id 로 고른다)',
      ...audioCandidateLines(ctx.bgmCandidates),
    ],
  },
  {
    id: 'final-instruction',
    title: '최종 지시',
    kind: 'injected',
    template: buildV15FinalInstruction(true, true),
    note:
      '무엇을 중심에 둘지가 세 갈래입니다. 목적 키워드가 없으면 브랜드로, 브랜드도 없으면(프롬프트 ' +
      `방식) 사용자 입력사항으로 바뀝니다: “${buildV15FinalInstruction(false, false)}”`,
    blankBefore: true,
    render: (ctx) => [
      buildV15FinalInstruction(ctx.purposeKeywords.length > 0, ctx.brand.name.length > 0),
    ],
  },
];
