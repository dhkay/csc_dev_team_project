// v1.5 기획 시스템 프롬프트 SSOT: 영상 한 편을 동영상(세그먼트) 여럿으로 나누는 구성
// v1.0 과 갈라 둔 이유: 산출물의 모양이 달라 공용 배열에서 가져올 조각이 하나도 없다.
// 이 버전의 씬은 장면 구성과 말 둘뿐이고 영상 모델이 그 문장에서 화면을 직접 만든다.
// 언어는 한국어 한 벌이고 JSON 필드명만 영문(파서와의 계약 식별자)

import { axisLabel } from '../../brand-concept';
import { PromptSegmentDef } from '../../prompt-segment';
import { PlanSystemPromptContext, usesCustomPlanInstructions } from '../context';
import { V15_SEGMENT_MAX_SECONDS, V15_SPEECH_MAX_CHARS } from './limits';

/** 이 버전의 씬 개수 기본값(뷰 예시용). 실제 값은 생성 시 브리프에서 파생돼 들어온다. */
const DEFAULT_SEGMENT_COUNT = 4;

/** 머리말: 목적 키워드가 주제일 때 */
export const V15_HEADER_KEYWORD = `수집한 데이터를 바탕으로, 목적 키워드를 중심에 두고 한국 시청자를 위한 마케팅 영상 한 편을 기획한다.`;

/** 머리말: 브랜드가 주제일 때(목적 키워드를 고르지 않았다) */
const V15_HEADER_BRAND = `브랜드와 브랜드 설명을 중심에 두고 한국 시청자를 위한 마케팅 영상 한 편을 기획한다.`;

// 머리말: 키워드도 브랜드도 없을 때(프롬프트 입력 방식)
// 그 경로에는 작업자가 적은 문장만 있어, 주제로 말해 주지 않으면 모델이 중심을 스스로 지어냄
const V15_HEADER_BRIEF = `작업자가 적은 사용자 입력사항을 그대로 주제로 삼아 한국 시청자를 위한 마케팅 영상 한 편을 기획한다.`;

/**
 * 개수 지시: 영상 한 편을 몇 개의 동영상으로 나눌지. 기획안 개수는 늘 하나라 말하지 않음
 * 사용자가 적은 형식을 살려 쓰라는 규칙이 여기 붙음(세 주제 갈래에서 다 같은 규칙이라)
 * '없음' 을 말할 문장으로 읽지 말라는 못박음도 여기(지시가 없으면 영상에서 "없음"이라고 말함)
 */
function buildSegmentCountDirective(segmentCount: number): string {
  return [
    `영상 한 편을 정확히 ${segmentCount}개의 동영상으로 나눈다.`,
    '동영상 하나가 곧 세그먼트 하나이고, 순서대로 이어붙이면 영상 한 편이 된다.',
    '출력 JSON 에서는 scenes 배열의 항목 하나가 동영상 하나다.',
    '사용자 입력사항에 동영상 번호를 붙여 적었으면 그 순서와 개수를 그대로 따른다. 거기에 장면 구성이나 대화내용, 나레이션이 적혀 있으면 그 내용을 살려 쓰고, 영상이 되도록 구체화만 한다.',
    '"없음" 이라고 적힌 항목은 그 동영상에 그것이 없다는 뜻이다. 그 두 글자를 대화내용이나 나레이션으로 옮겨 적지 않고 빈 문자열("")로 둔다.',
  ].join('\n');
}

/**
 * 장면 구성 지시. 이 문장이 영상 생성 모델에 그대로 나가는 이 버전의 핵심 고정부
 * 항목 나열만으로는 모델이 한 문장으로 끝내도 형식을 만족해, 분량과 순서와 형태 예시를 함께 못박음
 * 편집 지침이 아니라 고정부인 이유: 지우면 모델이 받는 문장이 영상용이 아니게 되어 결과가 무너짐
 */
const V15_SCENE_COMPOSITION_DIRECTIVE = [
  'sceneComposition(장면 구성)은 영상 생성 모델이 그대로 읽는 문장이다. 그 모델이 화면에 대해 아는 것은 이 문장뿐이므로, 촬영 지시서처럼 자세히 쓴다.',
  '동영상마다 아래 다섯을 이 순서로 모두 담아 세 문장 이상으로 쓴다.',
  '1. 배경과 화면 형식: 무엇을 배경으로 어떤 형식의 화면인지(실사, 2D 모션그래픽, 인포그래픽 도식 등).',
  '2. 조명과 색감: 전 구간의 톤을 정한다. 일부만 다르게 처리한다면 어느 부분을 어떻게, 무엇을 드러내려고 그러는지까지 적는다.',
  '3. 카메라: 가상 카메라가 어떻게 움직이는지(천천히 줌인, 팬, 고정, 매크로 클로즈업 등).',
  '4. 동작과 전환: 무엇이 어떻게 움직이는지. 한 동영상 안에서 화면 구성이 바뀐다면(좌우 분할, 장면 전환) 그 순서까지 적는다.',
  '5. 질감과 마감: 어떤 재질과 마감으로 보이게 할지. 피해야 할 인상이 있으면 그것도 적는다.',
  '',
  '형태 예시(밀도와 순서를 보여주는 것이다. 이 소재를 따라 쓰지 않는다):',
  '밝은 옐로우 민트 톤 배경 위로, 손끝 일러스트가 베일크림을 살짝 덜어 부드럽게 펴 바르는 모션을 매크로 클로즈업 도식으로 보여준다. 이어 화면이 좌우로 분할되며 왼쪽에는 파우더 사용 후(가루 날림 잔여물), 오른쪽에는 베일크림 사용 후(뽀송한 마무리)를 비교하는 인포그래픽이 동시에 움직이며 정리된다. 조명은 전 구간 밝고 선명한 톤을 유지하되 왼쪽 비교 이미지에는 옅은 그레이 필터를, 오른쪽에는 선명한 컬러를 남겨 대비를 강조한다.',
  '',
  '- 정지 사진을 묘사하지 않는다. 몇 초 동안 벌어지는 일을 쓴다.',
  '- 동영상마다 화면과 동작이 달라야 한다. 비슷한 문장을 반복하면 전부 같은 영상이 된다. 이어지게 할 것은 조명과 색감, 질감뿐이다.',
  '- 화면에 글자, 자막, 로고, 워터마크가 나오게 하지 않는다. 분위기와 사물로만 전한다.',
  '- 보이는 것만 쓴다. 마케팅 카피나 검색어를 그대로 옮겨 적지 않는다.',
].join('\n');

// 말 지시: 한 동영상의 말은 대화내용(화면 속 인물)과 나레이션(화면 밖) 중 하나
// 배타인 이유: 섞이면 10초 안에서 둘 다 급해지고 작업자가 결과를 예측하지 못함
// 둘 다 오면 대화내용 우선이고 어댑터가 한 번 더 강제(프롬프트는 지시일 뿐 계약이 아님)
// 글자 수와 초는 limits.ts 의 값(입력 정제 프롬프트와 같은 수)
const V15_SPEECH_DIRECTIVE = [
  '한 동영상의 말은 대화내용과 나레이션 중 하나다. 쓰지 않는 쪽은 빈 문자열("")로 둔다.',
  '- dialogue(대화내용): 화면 속 인물이 직접 하는 말. 그 인물이 실제로 할 법한 구어체로 쓴다.',
  '  대사를 쓴 동영상의 sceneComposition 에는 말하는 인물이 화면에 보이게 적는다.',
  '- narration(나레이션): 화면 밖에서 읽는 문장. 시청자에게 설명하고 공감하는 화법으로 쓴다.',
  '  화면 속 인물은 이 문장을 말하지 않는다.',
  '- 한 동영상에 둘을 함께 쓰지 않는다. 사용자 입력사항에 둘 다 적혀 있으면 대화내용만 살리고 나레이션은 빈 문자열로 둔다.',
  '- 말이 없는 동영상(제품 컷, 풍경 등)이면 둘 다 빈 문자열로 둔다.',
  `- 쓰는 쪽은 ${V15_SPEECH_MAX_CHARS}자 이내로 쓴다.`,
  `- ${V15_SPEECH_MAX_CHARS}자인 이유: 동영상 한 편은 최대 ${V15_SEGMENT_MAX_SECONDS}초이고, 그 안에서 그 문장이 다 말해져야 한다.`,
  '  넘치면 말이 끝나기 전에 동영상이 끝나고 그 문장은 잘린 채로 남는다.',
].join('\n');

// 주제 지시: 목적 키워드와 브랜드, 사용자 입력사항 중 무엇을 중심에 둘지
// 셋을 한 파일에 모으는 이유: 갈래가 늘 때 한쪽에서만 규칙이 빠지는 것을 막기 위함
const SCENE_COMPOSITION_ONLY_RULE =
  '화면은 오직 sceneComposition 으로만 만들어진다. 거기 쓰지 않은 것은 영상에 나오지 않는다.';

const V15_PURPOSE_KEYWORD_DIRECTIVE = [
  '목적 키워드가 이 영상이 파는 주제이고, 수집 데이터는 그 주제에 붙이는 각도다.',
  '(예: 수집 데이터가 월드컵이고 목적 키워드가 아이스크림이면 "월드컵 때 가장 많이 팔린 아이스크림 TOP N" 처럼 엮는다.)',
  '목적 키워드를 모든 동영상에 직접 또는 간접으로 드러낸다. 어느 쪽으로 할지는 네가 정한다.',
  '- 직접: 키워드가 가리키는 것을 화면에 보여준다.',
  '- 간접: 그것을 보여주기 어렵거나 부적절하면 상황, 사물, 손, 표정, 전후 결과로 대신 전한다.',
  '- 키워드가 여럿이면 한 동영상에 몰지 말고 나눠 담되, 영상 한 편이 전부를 다룬다.',
  SCENE_COMPOSITION_ONLY_RULE,
].join('\n');

const V15_BRAND_SUBJECT_DIRECTIVE = [
  '이번 생성에는 목적 키워드가 없다. 브랜드와 브랜드 설명이 이 영상이 파는 주제다.',
  '- 무엇을 파는 브랜드인지에서 다룰 소재를 직접 뽑는다. 브랜드 소개로 끝내지 않는다.',
  '- 연출 성격은 화면과 화법을 정할 뿐이다. 무엇을 다룰지는 브랜드 설명에서 정한다.',
  SCENE_COMPOSITION_ONLY_RULE,
].join('\n');

const V15_BRIEF_SUBJECT_DIRECTIVE = [
  '이번 생성에는 목적 키워드도 브랜드도 연출 성격도 없다. 사용자 입력사항에 적힌 내용이 전부다.',
  '- 적힌 것을 해석해 다른 것으로 바꾸지 않는다.',
  '- 적히지 않은 것은 전부 네가 정한다(표현 형식, 무드, 화법, 인물, 장소, 소품). 적힌 내용에 가장 어울리는 쪽으로 고르고, 그 선택을 모든 동영상에 일관되게 적용한다.',
  SCENE_COMPOSITION_ONLY_RULE,
].join('\n');

/** 이 컨텍스트의 주제 지시. 세 갈래 중 하나만 나간다. */
function resolveSubjectDirective(ctx: PlanSystemPromptContext): string {
  if (ctx.hasPurposeKeywords) return V15_PURPOSE_KEYWORD_DIRECTIVE;
  return ctx.hasBrand ? V15_BRAND_SUBJECT_DIRECTIVE : V15_BRIEF_SUBJECT_DIRECTIVE;
}

/**
 * 연출 성격 반영 지시: 컨셉입력에서 고른 축이 화면(sceneComposition)과 말에 닿는 유일한 연결
 *
 * 고정부인 이유: 편집 지침에 두면 채널이 지침을 통째로 고칠 때 이 줄이 빠질 수 있고, 그러면 유저
 * 프롬프트의 [연출 성격] 이 데이터로만 실려 모델이 참고할지 말지를 스스로 정한다. 영상 모델은
 * sceneComposition 만 읽으므로 거기 드러나지 않은 연출은 영상에 없다.
 * 축 이름은 카탈로그에서 읽는다. 유저 프롬프트의 [연출 성격] 줄이 같은 이름을 쓰므로 둘이 갈리면
 * 모델이 다른 축으로 읽는다.
 */
const V15_CONCEPT_DIRECTIVE = [
  '연출 성격은 화면과 말의 형식을 정한다. 무엇을 다룰지는 주제 지시가 정한다.',
  `- ${axisLabel('style')}과 ${axisLabel('mood')}는 모든 동영상의 sceneComposition 에 드러나야 한다. 배경과 화면 형식, 조명과 색감, 질감을 그 방향으로 쓴다. 감독 노트가 구체적인 구현 방향이다.`,
  `- ${axisLabel('tone')}는 대화내용과 나레이션의 화법을 정한다.`,
  `- ${axisLabel('sound')}은 BGM 선택과 말의 결을, ${axisLabel('structure')}는 동영상의 순서와 전개를, ${axisLabel('audience')}는 소재와 화법의 눈높이를, ${axisLabel('purpose')}은 영상이 끝날 때 남겨야 할 것을 정한다.`,
  '- 세트가 더한 카테고리도 같은 방식으로 감독 노트를 따른다.',
  '- 고른 연출을 모든 동영상에 일관되게 적용한다. 동영상마다 화면과 동작은 달라도 형식과 무드, 화법은 하나여야 한다.',
].join('\n');

// 브랜드는 골랐는데 축을 전부 비운 생성. 정하지 않은 연출을 모델이 잡되 동영상마다 갈리지 않게 한다.
// 프롬프트 방식은 여기 해당하지 않는다. 그 갈래의 주제 지시가 같은 말을 이미 한다.
const V15_NO_CONCEPT_DIRECTIVE =
  '이번 생성에는 연출 성격이 없다. 표현 형식, 무드, 화법은 브랜드 설명과 주제에 가장 어울리는 쪽으로 네가 정하고, 그 선택을 모든 동영상에 일관되게 적용한다.';

/**
 * 편집 가능한 중간 지침(v1.5 기본값). 작업자가 채널별로 수정
 * v1.0 과 갈라 둔 이유: 그쪽 문장이 그 버전 출력 형식을 전제해 없는 필드를 만들라는 지시가 됨
 * 연출 성격을 화면과 말에 매는 문장은 여기 없다. 고정부(V15_CONCEPT_DIRECTIVE)가 갖는다.
 */
export const V15_DEFAULT_PLAN_INSTRUCTIONS = [
  '핵심 원칙:',
  '- 목적 키워드(없으면 브랜드 또는 사용자 입력사항)를 영상의 중심 주제로 삼는다. 소재와 근거는 수집 데이터(인기 검색어, 연관 키워드)에서 끌어온다.',
  '- 브랜드명은 절제한다. 전면 배치나 반복, 노골적 광고는 하지 않는다. 유용한 정보와 공감이 먼저이고, 브랜드는 가볍고 자연스럽게만 드러낸다.',
  '- 첫 동영상은 3초 안에 시선을 잡는다. 마지막 동영상은 영상이 끝났다는 느낌을 준다.',
  '- 동영상들이 순서대로 이어졌을 때 하나의 흐름으로 읽혀야 한다. 각각을 따로 떨어진 장면으로 쓰지 않는다.',
].join('\n');

/**
 * BGM 선택 지시. v1.0 과 달리 효과음이 없음(이 버전 동영상은 장면 구성과 말 둘만 가짐)
 * BGM 은 기획안 레벨이고 렌더가 BGM 없는 산출물을 거절하므로 반드시 골라야 함
 */
const V15_AUDIO_SELECTION_DIRECTIVE = [
  '오디오 선택(제공된 목록에서만 고르고 id 를 지어내지 않는다):',
  '- BGM: 영상 전체에 어울리는 무드와 장르의 BGM 1개를 [사용 가능한 BGM] 목록에서 골라 기획안 레벨 "bgm" 에 넣는다. 목록이 비어 있으면 "bgm" 을 생략한다.',
].join('\n');

/**
 * 고정 꼬리말: 출력 형식(오직 JSON)과 스키마. 파싱 계약이라 고정
 * v1.0 의 subtitle 과 imagePrompt, infographic, sfx 가 없는 것은 누락이 아니라 이 버전의 형식
 */
export const V15_FOOTER = [
  '아래 JSON 스키마에 맞는 배열만 출력한다. 마크다운 코드펜스, 설명 문장, 주석을 절대 붙이지 않는다.',
  '배열의 항목은 정확히 1개다(영상 한 편).',
  '가운뎃점 문자를 쓰지 않는다.',
  '',
  '모든 값은 한국어로 쓴다. 필드명(title, scenes, sceneComposition 등)은 파서가 읽는 식별자이므로 그대로 둔다.',
  '',
  'JSON 스키마:',
  '[',
  '  {',
  '    "id": "영문 소문자와 하이픈으로 된 짧은 고유 식별자",',
  '    "title": "영상 제목",',
  '    "summary": "한 줄 요약",',
  '    "bgm": { "assetId": <사용 가능한 BGM 목록의 id> },',
  '    "scenes": [',
  '      {',
  '        "index": 1,',
  '        "sceneComposition": "이 동영상의 장면 구성(영상 모델이 읽는 문장)",',
  '        "dialogue": "화면 속 인물이 하는 말(없으면 빈 문자열)",',
  '        "narration": "화면 밖에서 읽는 문장(없으면 빈 문자열. 대화내용을 쓴 동영상은 반드시 빈 문자열)"',
  '      }',
  '    ]',
  '  }',
  ']',
].join('\n');

/**
 * v1.5 시스템 프롬프트 세그먼트. 조립 순서 그대로가 SSOT
 * 연출 성격 지시가 주제 지시 바로 뒤인 이유: 무엇을 다루는지 다음에 어떻게 보이는지가 온다
 * 장면 구성과 말 지시가 작업자 지침 앞인 이유: 출력 형식에 가까워 창작 방향보다 먼저 서야 함
 * BGM 선택 계약은 출력 스키마와 함께 지켜야 하므로 푸터 바로 앞
 */
export const V15_SYSTEM_SEGMENTS: readonly PromptSegmentDef<PlanSystemPromptContext>[] = [
  {
    id: 'header',
    title: '머리말 (과제 정의)',
    kind: 'injected',
    template: V15_HEADER_KEYWORD,
    note:
      '목적 키워드를 고르지 않으면 브랜드를 중심에 둔 머리말이 들어갑니다: ' +
      `“${V15_HEADER_BRAND}” 브랜드도 없는 프롬프트 입력 방식에서는: “${V15_HEADER_BRIEF}”`,
    links: ['purpose-keywords'],
    render: (ctx) => {
      if (ctx.hasPurposeKeywords) return [V15_HEADER_KEYWORD];
      return [ctx.hasBrand ? V15_HEADER_BRAND : V15_HEADER_BRIEF];
    },
  },
  {
    id: 'count',
    title: '동영상 개수 지시',
    kind: 'injected',
    // 뷰는 생성 선택과 무관해야 하므로 기본값을 예시로 보여준다(실제 값은 render 가 채운다)
    template: buildSegmentCountDirective(DEFAULT_SEGMENT_COUNT),
    note:
      '실제로는 생성 시 정해진 값이 들어갑니다. 이 버전은 개수를 고르는 자리가 없고, ' +
      "'씬 / 사용자 입력사항' 을 앞 스텝(입력 정제)이 동영상 단위로 나눈 수가 동영상 수가 됩니다" +
      '(번호를 붙였으면 그 수, 줄글이면 장면이 바뀌는 곳에서 나눈 수). ' +
      `표시된 ${DEFAULT_SEGMENT_COUNT}은 예시입니다.`,
    links: ['scene-brief', 'final-instruction'],
    render: (ctx) => [buildSegmentCountDirective(ctx.sceneCount)],
  },
  {
    id: 'subject',
    title: '주제 지시',
    kind: 'conditional',
    template: V15_PURPOSE_KEYWORD_DIRECTIVE,
    note:
      '세 갈래 중 하나가 들어갑니다. 목적 키워드를 고르면 위 문구, 고르지 않고 브랜드만 있으면 ' +
      '브랜드 주제 지시, 프롬프트 입력 방식이면 사용자 입력사항 주제 지시가 들어갑니다.',
    blankBefore: true,
    links: ['purpose-keywords', 'brand-concept', 'scene-brief'],
    render: (ctx) => [resolveSubjectDirective(ctx)],
  },
  {
    id: 'concept-direction',
    title: '연출 성격 반영 지시',
    kind: 'conditional',
    template: V15_CONCEPT_DIRECTIVE,
    note:
      '컨셉입력 방식에서 연출 성격을 골랐으면 위 문구가, 브랜드만 고르고 축을 비웠으면 ' +
      `“${V15_NO_CONCEPT_DIRECTIVE}” 가 들어갑니다. 프롬프트 방식에는 빠집니다(주제 지시가 같은 말을 합니다). ` +
      '작업자 편집 지침과 무관하게 늘 들어가는 고정부입니다.',
    blankBefore: true,
    links: ['brand-concept', 'concepts'],
    render: (ctx) => {
      if (ctx.hasConcepts) return [V15_CONCEPT_DIRECTIVE];
      return ctx.hasBrand ? [V15_NO_CONCEPT_DIRECTIVE] : [];
    },
  },
  {
    id: 'scene-composition',
    title: '장면 구성 지시 (영상 모델이 읽는 문장)',
    kind: 'fixed',
    template: V15_SCENE_COMPOSITION_DIRECTIVE,
    note:
      '이 버전은 씬 이미지를 만들지 않고 영상 모델이 이 문장에서 화면을 직접 만듭니다. ' +
      '그래서 정지 이미지가 아니라 움직임과 카메라를 함께 쓰게 합니다.',
    blankBefore: true,
    render: () => [V15_SCENE_COMPOSITION_DIRECTIVE],
  },
  {
    id: 'dialogue',
    title: '말 지시 (대화내용 / 나레이션)',
    kind: 'fixed',
    template: V15_SPEECH_DIRECTIVE,
    note: () =>
      `동영상 하나는 대화내용과 나레이션 중 하나만 갖습니다. 둘 다 영상 모델이 만들고, ${V15_SPEECH_MAX_CHARS}자를` +
      ` 넘지 않도록 씁니다(동영상 한 편이 최대 ${V15_SEGMENT_MAX_SECONDS}초이기 때문입니다).` +
      " '씬 / 사용자 입력사항' 에 둘 다 적으면 대화내용이 쓰입니다.",
    blankBefore: true,
    render: () => [V15_SPEECH_DIRECTIVE],
  },
  {
    id: 'instructions',
    title: '작업자 편집 지침 (기본 지침)',
    kind: 'editable',
    template: V15_DEFAULT_PLAN_INSTRUCTIONS,
    note: (ctx) =>
      usesCustomPlanInstructions(ctx.instructions, V15_DEFAULT_PLAN_INSTRUCTIONS)
        ? '작업자가 채널별로 편집하는 유일한 부분입니다. 표시되는 값은 「기본으로 되돌리기」 기준의 기본 지침이며, 이 채널은 현재 커스텀 지침을 사용 중입니다(편집 버튼에서 확인/수정).'
        : '작업자가 채널별로 편집하는 유일한 부분입니다. 이 채널은 현재 기본 지침을 사용합니다(편집 버튼으로 수정).',
    blankBefore: true,
    links: ['brand-concept', 'purpose-keywords'],
    render: (ctx) => [(ctx.instructions ?? '').trim() || V15_DEFAULT_PLAN_INSTRUCTIONS],
  },
  {
    id: 'audio-selection',
    title: 'BGM 선택 지시',
    kind: 'fixed',
    template: V15_AUDIO_SELECTION_DIRECTIVE,
    blankBefore: true,
    links: ['available-bgm'],
    render: () => [V15_AUDIO_SELECTION_DIRECTIVE],
  },
  {
    id: 'footer',
    title: '출력 형식 / JSON 스키마',
    kind: 'fixed',
    template: V15_FOOTER,
    blankBefore: true,
    links: ['available-bgm'],
    render: () => [V15_FOOTER],
  },
];
