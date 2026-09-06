/**
 * 기획서 생성 유저 프롬프트 SSOT: 채널과 브랜드, 목적 키워드, 오디오 후보를 생성 시점에 주입한다.
 * 수집 데이터는 들어오지 않는다. 수집은 키워드를 만드는 단계에서 끝나고 이 프롬프트는 사람이 고른
 * 키워드만 받는다(원문을 통째로 실으면 무엇이 왜 기획에 들어갔는지 화면에서 추적되지 않는다)
 * 시스템 프롬프트와 마찬가지로 세그먼트 정의 배열 하나가 진실원이고 실제 호출과 프로세스 뷰가 모두
 * 여기서 파생된다. 섹션을 추가하면 프롬프트와 화면에 동시에 반영된다.
 * 프롬프트는 한국어 한 벌이고 라벨도 값도 화면에 보이는 그대로 나간다. 영어 라벨과 화면용 번역을
 * 따로 들면 두 벌을 손으로 맞춰야 해서 한쪽만 고쳤을 때 조용히 어긋난다.
 * 조립이 어댑터가 아니라 도메인에 있는 이유: 프롬프트 형태가 도메인 계약이다(어댑터는 호출과 파싱만)
 */

import { conceptLines } from '../../brand-concept';
import { PromptSegmentDef, assembleSegments } from '../../prompt-segment';
import type { AudioCandidateLine, PlanUserPromptContext } from '../context';

const UNSPECIFIED = '(지정 안 함)';
const NONE = '(없음)';

/** 오디오 후보를 `id | name | axisKey=value, ...` 줄로 렌더(태그 없으면 name 만). 비면 `(none)`. */
function audioCandidateLines(candidates: AudioCandidateLine[]): string[] {
  if (candidates.length === 0) return [NONE];
  return candidates.map((c) => {
    const tags = c.tags.map((t) => `${t.axisKey}=${t.value}`).join(', ');
    return `${c.id} | ${c.name}${tags ? ` | ${tags}` : ''}`;
  });
}

/**
 * 최종 지시: 무엇을 중심에 둘지 + 정확한 기획안 개수
 *
 * 중심은 목적 키워드가 있을 때만 키워드다. 없으면 브랜드와 브랜드 설명이 주제이므로 "브랜드는
 * 절제하고" 를 그대로 보내면 주제를 절제하라는 자기모순이 된다(그때 남는 중심이 없어 모델이 아무
 * 데로나 간다). 컨셉은 어느 경우에도 주제가 아니라 연출이므로 중심에 넣지 않는다.
 */
function finalInstruction(
  proposalCount: number | string,
  hasPurposeKeywords = true,
): string {
  const focus = hasPurposeKeywords
    ? '위 목적 키워드를 중심으로(브랜드는 절제하고 자연스럽게 녹여)'
    : '위 브랜드와 브랜드 설명을 중심으로';
  return (
    `${focus}, ` +
    `정확히 ${proposalCount}개의 서로 다른 마케팅 영상 기획안을 JSON 배열로만 출력한다.`
  );
}

/**
 * 유저 프롬프트 세그먼트 정의: 조립 순서 그대로가 SSOT.
 * 각 섹션은 앞에 빈 줄을 두고(첫 섹션 제외) 이어붙는다.
 */
export const PLAN_USER_SEGMENTS: readonly PromptSegmentDef<PlanUserPromptContext>[] = [
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
    title: '브랜드 / 컨셉',
    kind: 'injected',
    template:
      '[브랜드와 컨셉]\n브랜드명: {브랜드명}\n브랜드 설명(한국어): {브랜드 설명}\n표현형식: {표현형식}, {감독 노트}\n무드: {무드}: {감독 노트}\n톤앤매너: {톤앤매너}: {감독 노트}',
    note: "선택한 브랜드/컨셉 세트가 주입됩니다('라벨: 값, 감독 노트' 형식, 카탈로그 축 순서).",
    blankBefore: true,
    render: (ctx) => [
      '[브랜드와 컨셉]',
      `브랜드명: ${ctx.brand.name || UNSPECIFIED}`,
      ...(ctx.brand.description ? [`브랜드 설명: ${ctx.brand.description}`] : []),
      // 축별 컨셉을 라벨 + 감독 노트로 주입(창작 핵심 축). 표기 순서/라벨/포맷은 brand-concept 가 SSOT.
      ...conceptLines(ctx.brand.concepts),
    ],
  },
  {
    id: 'purpose-keywords',
    title: '목적 키워드',
    // conditional: 키워드를 고르지 않고 생성하면 이 절이 빠진다(선택 항목이라 있을 수도 없을 수도 있다)
    kind: 'conditional',
    template:
      '[목적 키워드(한국어)]\n{선택 파트의 목적 키워드, 쉼표 구분}',
    note: '작업자가 이번 생성에 고른 목적 키워드가 들어갑니다. 고르지 않았으면 이 절 자체가 빠집니다.',
    blankBefore: true,
    // 키워드가 없으면 '(없음)' 을 적지 않고 절을 뺀다. 시스템 프롬프트가 그때는 브랜드를 주제로 삼으라고
    //   말하는데, 여기서 빈 키워드 칸을 보여 주면 모델이 채워야 할 빈자리로 읽는다.
    render: (ctx) =>
      ctx.purposeKeywords.length > 0
        ? ['[목적 키워드]', ctx.purposeKeywords.join(', ')]
        : [],
  },
  {
    id: 'scene-brief',
    title: '사용자 입력사항',
    // conditional: 적지 않고 생성할 수 있다(선택 항목). 목적 키워드와 같은 이유로 빈 칸을 남기지
    //   않는다. 빈자리를 보여 주면 모델이 채워야 할 곳으로 읽는다.
    kind: 'conditional',
    template: '[사용자 입력사항]\n{작업자가 직접 적은 씬 구성/요구사항}',
    note: '작업자가 생성 화면에서 직접 적은 요구사항입니다. 적지 않았으면 이 절 자체가 빠집니다.',
    blankBefore: true,
    // 목적 키워드보다 뒤에 둔다. 키워드가 주제를 정하고 이 지시가 그 주제를 어떻게 담을지를
    //   말하는 순서라, 뒤에 오는 편이 앞의 내용을 구체화하는 것으로 읽힌다.
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
    //   사이에 다른 절(BGM 후보 등)이 끼면 제한이 무엇에 걸리는 말인지 흐려진다.
    render: (ctx) => (ctx.constraints ? ['[제한사항]', ctx.constraints] : []),
  },
  {
    id: 'available-bgm',
    title: 'BGM 후보',
    kind: 'injected',
    template:
      '[사용 가능한 BGM] (기획안 전체에 쓸 하나를 id 로 고른다)\n{id | 이름 | 태그(mood=…, genre=…, …)}',
    note: '조직이 쓸 수 있는 BGM 에셋 목록이 주입됩니다. 이 중에서 AI 가 1개를 고릅니다(없으면 (none)).',
    blankBefore: true,
    // 파서가 선택된 id 를 검증/스냅샷하므로 목록에 없는 id 는 무시된다.
    render: (ctx) => [
      '[사용 가능한 BGM] (기획안 전체에 쓸 하나를 id 로 고른다)',
      ...audioCandidateLines(ctx.bgmCandidates),
    ],
  },
  {
    id: 'available-sfx',
    title: '효과음 후보',
    kind: 'injected',
    template:
      '[사용 가능한 효과음] (씬마다 선택적으로 id 로 배치, offsetSec 지정)\n{id | 이름 | 태그(type=…, usage=…, …)}',
    note: '조직이 쓸 수 있는 효과음 에셋 목록이 주입됩니다(없으면 (none)).',
    blankBefore: true,
    render: (ctx) => [
      '[사용 가능한 효과음] (씬마다 선택적으로 id 로 배치, offsetSec 지정)',
      ...audioCandidateLines(ctx.sfxCandidates ?? []),
    ],
  },
  {
    id: 'final-instruction',
    title: '최종 지시',
    kind: 'injected',
    template: finalInstruction('{기획안 수}'),
    note:
      '기획안 개수(선택값)가 들어갑니다. 목적 키워드 없이 생성하면 중심이 브랜드와 컨셉으로 바뀝니다: ' +
      `“${finalInstruction('{기획안 수}', false)}”`,
    blankBefore: true,
    render: (ctx) => [finalInstruction(ctx.proposalCount, ctx.purposeKeywords.length > 0)],
  },
];

/** 최종 유저 프롬프트 조립: 위 PLAN_USER_SEGMENTS 에서 파생한다. */
export function buildPlanUserPrompt(ctx: PlanUserPromptContext): string {
  return assembleSegments(PLAN_USER_SEGMENTS, ctx);
}
