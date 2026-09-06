/**
 * v1.5 입력 정제 프롬프트 SSOT: 작업자가 적은 씬/사용자 입력사항과 제한사항 → 파이프라인이 읽는 형식
 *
 * 기획 LLM 앞에 한 단계를 더 두는 이유. 사람은 이 칸에 무엇이든 적는다. 시간 구간((0-8초)), 단계
 * 태그([훅], [CTA]), 동영상 밖에 따로 모아 적은 전체 나레이션, 한 동영상 안의 하위 시간별 묘사,
 * 화면에 로고를 넣으라는 지시. 이 파이프라인은 그중 어느 것도 받지 않는다(길이는 말에서 정해지고,
 * 말은 동영상마다 하나이며, 화면에 글자는 없다). 그 해석을 기획 LLM 에 맡기면 같은 입력이 생성마다
 * 다른 개수와 다른 화자로 나온다. 정제기는 창작하지 않는다. 옮기고, 형식에 맞지 않는 것만 고치고,
 * 무엇을 고쳤는지 적는다.
 *
 * 세그먼트 정의 배열이 진실원이라 프롬프트를 고치면 프로세스 화면이 함께 바뀐다.
 */
import { MAX_SCENE_COUNT, MIN_SCENE_COUNT } from '../../plan-counts';
import { PromptSegmentDef } from '../../prompt-segment';
import type { BriefRefinementPromptContext } from '../context';
import { V15_SEGMENT_MAX_SECONDS, V15_SPEECH_MAX_CHARS } from './limits';

const V15_REFINER_ROLE = [
  '너는 마케팅 영상 제작 파이프라인의 입력 정제기다.',
  '작업자가 자유롭게 적은 영상 요구사항(사용자 입력사항)과 제한사항을 받아, 이 파이프라인이 읽는 형식으로 다시 쓴다.',
  '내용을 새로 짓지 않는다. 적힌 것을 옮기고, 형식에 맞지 않는 것만 고치고, 무엇을 고쳤는지 적는다.',
].join('\n');

// 파이프라인의 한계는 상수에서 온다. 여기 숫자를 손으로 적으면 기획 시스템 프롬프트와 어긋난다.
const V15_REFINER_PIPELINE_CONTRACT = [
  '[이 파이프라인이 받는 것]',
  `- 영상 한 편은 동영상(세그먼트) ${MIN_SCENE_COUNT}~${MAX_SCENE_COUNT}개로 나뉜다. 동영상 하나가 곧 클립 하나다. 넘는 입력은 서버가 거절하고 작업자가 고친다.`,
  '- 동영상 하나는 장면 구성 하나와 말 하나를 갖는다. 말은 대화내용(화면 속 인물이 하는 말), 나레이션(화면 밖 목소리), 없음 중 하나다.',
  `- 말은 ${V15_SPEECH_MAX_CHARS}자 이내다. 동영상 하나는 최대 ${V15_SEGMENT_MAX_SECONDS}초이고 그 안에서 말해져야 한다.`,
  '- 시간은 받지 않는다. 동영상의 길이는 그 말에서 파이프라인이 정한다. 시작과 끝 시각, 구간 표기, 총 길이는 모두 버린다.',
  '- 화면에 글자, 자막, 로고, 워터마크를 넣지 않는다. 제품 자체가 보이는 것은 된다.',
  '- 장면 구성은 영상 생성 모델이 그대로 읽는 문장이다. 정지 사진이 아니라 몇 초 동안 벌어지는 일을 쓴다.',
].join('\n');

const V15_REFINER_RULES = [
  '[정제 규칙]',
  '1. 동영상 단위는 작업자가 나눈 대로 따른다. 번호("동영상1", "씬2", "1."), 시간 구간, 문단 나눔이 그 단위다. 단위를 나누지 않고 줄글로 적었으면 장면이 바뀌는 곳에서 나눈다. 장면이 하나뿐이면 하나로 둔다.',
  `2. 동영상 수는 작업자가 나눈 대로 둔다. ${MAX_SCENE_COUNT}개를 넘어도 합치지 않는다. 개수를 맞추려 합치면 작업자가 나눈 단위가 말없이 바뀐다.`,
  '3. 시간 표기((0-8초), 8-16초, 총 30초)와 단계 태그([훅], [씬1], [CTA])는 모두 제거한다. 그것은 어느 동영상에 어떤 말이 붙는지 판단하는 근거로만 쓴다.',
  '4. 한 동영상 안에 하위 구간별 묘사가 있으면 하나의 흐름으로 이어 쓴다. 순서는 그대로 둔다.',
  '5. 동영상 밖에 따로 모아 적은 말(전체 나레이션, 대사 목록)은 시간 구간이나 순서를 근거로 각 동영상에 나눠 붙인다. 한 동영상에 둘 이상의 문장이 걸리면 그 동영상의 흐름에 맞는 하나로 합치거나 줄인다.',
  `6. ${V15_SPEECH_MAX_CHARS}자를 넘는 말은 뜻을 유지하며 줄인다. 한 동영상에 대화내용과 나레이션이 둘 다 있으면 대화내용만 남긴다. "없음" 은 말이 없다는 뜻이다.`,
  '7. 화면에 글자, 자막, 로고, 워터마크를 넣으라는 지시는 장면 구성에서 제거한다. 그 자리는 사물과 분위기로 바꾼다(로고 대신 제품이 놓인 클로징 컷).',
  '8. 제한사항은 피해야 할 것만 한 줄에 하나씩 남긴다. 요구사항 안에 섞여 적힌 제한(~하지 않도록, ~금지)은 제한사항으로 옮긴다. 원문의 뜻을 바꾸지 않는다.',
  '9. 작업자가 적지 않은 것은 채우지 않는다. 연출, 인물, 장소, 제품을 지어내지 않는다. 짧은 장면 구성은 짧은 채로 둔다(구체화는 다음 단계가 한다).',
  '10. 무엇을 바꿨는지 notes 에 짧게 적는다(제거한 것, 합친 것, 줄인 것, 옮긴 것). 바꾼 것이 없으면 빈 배열로 둔다.',
].join('\n');

// 파싱 계약. 어댑터가 읽는 필드명이라 고정
const V15_REFINER_FOOTER = [
  '아래 JSON 스키마에 맞는 객체 하나만 출력한다. 마크다운 코드펜스, 설명 문장, 주석을 절대 붙이지 않는다.',
  '모든 값은 한국어로 쓴다. 필드명은 파서가 읽는 식별자이므로 그대로 둔다. 가운뎃점 문자를 쓰지 않는다.',
  '',
  'JSON 스키마:',
  '{',
  '  "segments": [',
  '    {',
  '      "sceneComposition": "이 동영상의 장면 구성(시간 표기와 단계 태그를 뺀 문장)",',
  '      "dialogue": "화면 속 인물이 하는 말(없으면 빈 문자열)",',
  '      "narration": "화면 밖에서 읽는 문장(없으면 빈 문자열. 대화내용을 쓴 동영상은 반드시 빈 문자열)"',
  '    }',
  '  ],',
  '  "constraints": ["피해야 할 것 한 줄"],',
  '  "notes": ["바꾼 것 한 줄"]',
  '}',
  '',
  '사용자 입력사항이 없고 제한사항만 있으면 segments 는 빈 배열로 둔다.',
].join('\n');

/**
 * 시스템 프롬프트 세그먼트. 전부 고정이라 컨텍스트를 읽지 않는다(조립 순서 그대로가 SSOT).
 * 규칙이 형식 앞인 이유: 무엇을 고치는지를 알아야 출력 형식의 각 필드가 무엇을 담는지 읽힌다.
 */
export const V15_BRIEF_REFINER_SYSTEM_SEGMENTS: readonly PromptSegmentDef<BriefRefinementPromptContext>[] =
  [
    {
      id: 'refiner-role',
      title: '역할',
      kind: 'fixed',
      template: V15_REFINER_ROLE,
      note: '정제기는 창작하지 않습니다. 적힌 것을 옮기고 형식에 맞지 않는 것만 고칩니다.',
      render: () => [V15_REFINER_ROLE],
    },
    {
      id: 'refiner-pipeline-contract',
      title: '이 파이프라인이 받는 것',
      kind: 'fixed',
      template: V15_REFINER_PIPELINE_CONTRACT,
      note: '동영상 수 범위, 말의 글자 수와 클립 길이, 시간과 화면 글자를 받지 않는다는 사실. 기획 시스템 프롬프트와 같은 상수에서 나옵니다.',
      blankBefore: true,
      render: () => [V15_REFINER_PIPELINE_CONTRACT],
    },
    {
      id: 'refiner-rules',
      title: '정제 규칙',
      kind: 'fixed',
      template: V15_REFINER_RULES,
      note: '시간 표기와 단계 태그 제거, 따로 모은 나레이션의 배치, 긴 말의 축약, 화면 글자 지시 제거, 제한사항 분리.',
      blankBefore: true,
      render: () => [V15_REFINER_RULES],
    },
    {
      id: 'refiner-footer',
      title: '출력 형식 / JSON 스키마',
      kind: 'fixed',
      template: V15_REFINER_FOOTER,
      blankBefore: true,
      render: () => [V15_REFINER_FOOTER],
    },
  ];

/**
 * 유저 프롬프트 세그먼트: 작업자가 적은 원문 둘 + 최종 지시. 조립 순서 그대로가 SSOT
 * 절 이름이 기획 유저 프롬프트와 같은 이유: 정제기의 출력이 그 자리로 되돌아간다.
 */
export const V15_BRIEF_REFINER_USER_SEGMENTS: readonly PromptSegmentDef<BriefRefinementPromptContext>[] =
  [
    {
      id: 'raw-scene-brief',
      title: '사용자 입력사항 (원문)',
      kind: 'conditional',
      template: '[사용자 입력사항]\n{작업자가 적은 동영상 구성/요구사항 원문}',
      note: '생성 화면의 씬/사용자 입력사항 원문이 그대로 들어갑니다. 적지 않았으면 이 절이 빠지고 segments 는 빈 배열로 나옵니다.',
      render: (ctx) => (ctx.sceneBrief ? ['[사용자 입력사항]', ctx.sceneBrief] : []),
    },
    {
      id: 'raw-constraints',
      title: '제한사항 (원문)',
      kind: 'conditional',
      template: '[제한사항]\n{작업자가 적은 제한사항 원문}',
      note: '생성 화면의 제한사항 원문이 그대로 들어갑니다. 적지 않았으면 이 절이 빠집니다.',
      blankBefore: true,
      render: (ctx) => (ctx.constraints ? ['[제한사항]', ctx.constraints] : []),
    },
    {
      id: 'refiner-instruction',
      title: '최종 지시',
      kind: 'injected',
      template: '위 입력을 정제 규칙대로 다시 써서 JSON 객체 하나로만 출력한다.',
      blankBefore: true,
      render: () => ['위 입력을 정제 규칙대로 다시 써서 JSON 객체 하나로만 출력한다.'],
    },
  ];
