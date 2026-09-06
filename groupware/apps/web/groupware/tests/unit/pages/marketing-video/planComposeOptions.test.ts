import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PROPOSAL_COUNT,
  DEFAULT_SCENE_COUNT,
  MAX_SCENE_COUNT,
  PROPOSAL_COUNT_OPTIONS,
  SCENE_COUNT_OPTIONS,
  SCENE_BRIEF_PLACEHOLDER,
  PROMPT_BRIEF_PLACEHOLDER,
  resolvePlanComposeLimit,
  sceneCountFromBrief,
  DEFAULT_SEGMENT_MODE,
  SEGMENT_MODES,
  pinnedProposalCount,
} from '$lib/pages/tools/marketing-video/planComposeOptions';
import { pipelineFor } from '@csc/tool-versions';
import { VERSION_MODES } from '$lib/shared/lib/versionMode/versionMode';
import { versionProfile } from '$lib/pages/tools/marketing-video/versionProfile';
import { isSegmentFormat } from '$lib/pages/tools/marketing-video/planSceneFormat';
import { AI_CAPABILITIES } from '$lib/pages/tools/marketing-video/aiModelOptions';
import type { AiModelSelection } from '$lib/features/marketing-channels/types';

// 자체(내부) 모델은 조직 전체가 함께 쓰는 사내 GPU 1장 위에서 돈다. 외부처럼 늘려 쓸 수 없어서,
// 기획서를 한 번에 여러 개 만들면 자체 LLM 은 출력이 잘려 기획서를 통째로 잃고(실측: 고정 예산 시절
// 4개부터 파싱 실패), 자체 이미지는 직렬 GPU 큐를 독점해 다른 작업자의 1장을 뒤로 민다.
// 이 규칙이 조용히 풀리면 그 두 증상이 그대로 돌아오므로 여기서 고정한다.

/** 카탈로그에서 해당 역량의 실제 key 를 뽑는다. 테스트가 key 를 하드코딩하면 카탈로그와 어긋난다. */
function firstKey(capability: 'llm' | 'image', provider: 'internal' | 'external'): string {
  const cap = AI_CAPABILITIES.find((c) => c.key === capability);
  const opt = cap?.options.find((o) => o.provider === provider && o.available);
  if (!opt) throw new Error(`카탈로그에 ${capability}/${provider} 모델이 없다`);
  return opt.key;
}

function selection(over: Partial<AiModelSelection> = {}): AiModelSelection {
  return {
    llm: firstKey('llm', 'external'),
    image: firstKey('image', 'external'),
    video: '',
    videoMode: '',
    tts: '',
    ttsVoice: '',
    ttsPitch: '',
    ...over,
  };
}

describe('기획서 구성 선택지와 초기값', () => {
  // 초기값 1: 모달은 열릴 때마다 이 상수로 리셋된다(PlanWizardModal). 기본을 크게 두면 그 값이
  //   기본이라는 이유로 매번 여러 개가 생성되고, 그것이 이 도구에서 가장 비싼 동작이다.
  it('열 때 찍히는 초기값은 기획서 1개, 씬 1개다', () => {
    expect(DEFAULT_PROPOSAL_COUNT).toBe(1);
    expect(DEFAULT_SCENE_COUNT).toBe(1);
  });

  it('초기값은 선택지 안에 있다 (없으면 아무 pill 도 켜지지 않은 화면이 된다)', () => {
    expect(PROPOSAL_COUNT_OPTIONS).toContain(DEFAULT_PROPOSAL_COUNT);
    expect(SCENE_COUNT_OPTIONS).toContain(DEFAULT_SCENE_COUNT);
  });

  it('기획서당 씬 개수는 1~8 을 고를 수 있다', () => {
    expect(SCENE_COUNT_OPTIONS).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // 선택지의 끝이 곧 시작 전 검사의 상한이다. 둘이 갈리면 v1.0 에서 고를 수 있는 수를 v1.5 가 막는다.
    //   값 자체(8)는 커널 스펙이 잠근다.
    expect(SCENE_COUNT_OPTIONS.at(-1)).toBe(MAX_SCENE_COUNT);
  });

  // 기획안 개수를 고정하는 버전의 값은 화면이 정하지 않는다. 화면만 상수로 들면 낡은 탭이 보낸 수를
  //   서버가 그대로 써, 프롬프트는 "정확히 1개" 라는데 출력 토큰 예산이 그 배수로 잡힌다.
  it('고정 기획안 수는 파이프라인 표에서 나온다', () => {
    for (const version of VERSION_MODES) {
      expect(pinnedProposalCount(version)).toBe(pipelineFor(version).pinnedProposalCount);
    }
  });

  // 화면의 '기획서 구성' 섹션 유무와 기획안 수 고정은 서로 다른 축의 사실이다. 전자는 화면
  //   결정이라 versionProfile 이 갖고(파이프라인 표는 화면 구성을 담지 않는다), 후자는 서버도
  //   보는 파이프라인 사실이다. 그래서 한쪽을 다른 쪽에서 파생하지 않고 관계를 잠근다.
  //   어긋나면 조용하다: 아무 일도 하지 않는 선택기가 그려지거나, 위저드가 보낼 값을 지어낸다.
  it('기획서 구성을 고르지 않는 버전은 기획안 수가 고정돼 있다', () => {
    for (const version of VERSION_MODES) {
      if (!versionProfile(version).hasPlanCompose) {
        expect(pinnedProposalCount(version), version).not.toBeNull();
      }
    }
  });

  it('기획서 구성을 고르는 버전은 기획안 수를 고정하지 않는다', () => {
    // 반대 방향. 선택기를 그려 놓고 값을 고정하면 서버가 그 선택을 버리므로, 눌러도 결과가
    //   달라지지 않는 pill 이 남는다(로그에는 warn 이 쌓인다)
    for (const version of VERSION_MODES) {
      if (versionProfile(version).hasPlanCompose) {
        expect(pinnedProposalCount(version), version).toBeNull();
      }
    }
  });
});

describe('기획서 분량 제한 (자체 모델 = 공유 GPU)', () => {
  it('외부 모델만 쓰면 개수를 전부 고를 수 있다', () => {
    const limit = resolvePlanComposeLimit(selection(), 'v1.0');
    expect(limit.limited).toBe(false);
    expect(limit.proposalCounts).toEqual(PROPOSAL_COUNT_OPTIONS);
    expect(limit.internalModelLabels).toEqual([]);
  });

  it('자체 LLM 을 고르면 기획서가 1개로 묶인다', () => {
    // LLM 역량이 있는 버전(v1.0)에서 본다. v1.5 는 별도 언어 모델 호출이 없어 이 역량 자체가 없다.
    const limit = resolvePlanComposeLimit(selection({ llm: firstKey('llm', 'internal') }), 'v1.0');
    expect(limit.limited).toBe(true);
    expect(limit.proposalCounts).toEqual([1]);
    expect(limit.internalModelLabels).toHaveLength(1); // 안내 문구가 이름을 대야 한다
  });

  it('고정 역량이 있는 버전은 저장된 자체 모델로 묶이지 않는다', () => {
    // v1.5 의 기획 LLM 은 고정이라 슬롯에 무엇이 남아 있든 고정 모델이 쓰인다(서버도 그렇게 한다)
    //   저장된 옛 Qwen 값으로 막으면 쓰이지도 않는 모델 때문에 분량이 묶인다.
    const limit = resolvePlanComposeLimit(selection({ llm: 'internal-qwen3' }), 'v1.5');
    expect(limit.limited).toBe(false);
    expect(limit.internalModelLabels).toEqual([]);
  });

  it('고정이 아닌 역량은 노출이 꺼진 자체 모델이라도 저장값으로 묶는다', () => {
    // 화면에서 고를 수 없게 해 둔 모델이라도 저장돼 있으면 서버는 그 모델을 그대로 부른다.
    //   (서버는 카탈로그 노출 여부를 모른다). 노출로 걸러 버리면 사내 GPU 를 쓰는 생성에서
    //   분량 제한이 조용히 풀린다.
    const limit = resolvePlanComposeLimit(selection({ llm: 'internal-qwen3' }), 'v1.0');
    expect(limit.limited).toBe(true);
    expect(limit.proposalCounts).toEqual([1]);
  });

  it('자체 이미지 모델을 고르면 기획서가 1개로 묶인다', () => {
    // 씬 이미지를 만드는 버전(v1.0)에서만 성립한다. 저장값에 남은 자체 이미지 모델도 근거가 된다.
    const limit = resolvePlanComposeLimit(
      selection({ image: firstKey('image', 'internal') }),
      'v1.0',
    );
    expect(limit.limited).toBe(true);
    expect(limit.proposalCounts).toEqual([1]);
  });

  it('씬 이미지를 만들지 않는 버전에서는 자체 이미지 모델이 제한 근거가 아니다', () => {
    // v1.5 는 이미지 단계가 없다. 저장값이 남아 있어도 그 GPU 를 쓰지 않으므로 막을 근거가
    //   없다. 여기서 막으면 사용하지도 않는 모델 때문에 기획서를 1개만 만들 수 있게 된다.
    const limit = resolvePlanComposeLimit(
      selection({ llm: firstKey('llm', 'external'), image: firstKey('image', 'internal') }),
      'v1.5',
    );
    expect(limit.limited).toBe(false);
    expect(limit.internalModelLabels).toEqual([]);
  });

  it('둘 다 자체면 두 모델을 모두 안내한다 (왜 막혔는지 하나만 보이면 오해한다)', () => {
    const limit = resolvePlanComposeLimit(
      selection({ llm: firstKey('llm', 'internal'), image: firstKey('image', 'internal') }),
      'v1.0',
    );
    expect(limit.limited).toBe(true);
    expect(limit.internalModelLabels).toHaveLength(2);
  });

  it('선택을 아직 모르면(로딩/미설정) 막지 않는다', () => {
    // 모르는 걸 근거로 기능을 막으면, 조회가 느린 순간에 선택지가 사라졌다 돌아온다.
    for (const unknown of [undefined, null]) {
      const limit = resolvePlanComposeLimit(unknown, 'v1.0');
      expect(limit.limited).toBe(false);
      expect(limit.proposalCounts).toEqual(PROPOSAL_COUNT_OPTIONS);
    }
  });

  it('카탈로그에 없는 key 는 제한 근거로 쓰지 않는다', () => {
    // 제거된 구 모델이 저장돼 있을 수 있다. 내부인지 알 수 없으므로 막지 않는다.
    const limit = resolvePlanComposeLimit(selection({ llm: 'removed-legacy-model' }), 'v1.0');
    expect(limit.limited).toBe(false);
  });

  it('기획서 생성과 무관한 역량(영상/나레이션)이 자체여도 제한하지 않는다', () => {
    // 영상/나레이션은 기획서 생성 단계에서 호출되지 않는다. 여기서 막으면 근거 없는 제약이다.
    const wanVideo = AI_CAPABILITIES.find((c) => c.key === 'video')?.options.find(
      (o) => o.provider === 'internal',
    );
    expect(wanVideo, '카탈로그에 자체 영상 모델이 있어야 이 테스트가 의미를 가진다').toBeTruthy();
    const limit = resolvePlanComposeLimit(selection({ video: wanVideo!.key }), 'v1.0');
    expect(limit.limited).toBe(false);
  });
});

/**
 * 기획서 구성을 고르지 않는 버전(v1.5)의 씬 개수는 '씬 / 사용자 입력사항' 에서 나온다.
 * 여기가 틀리면 브리프에 적은 씬 수와 모델에 보내는 지시가 어긋나고, 그 사실은 결과물에서만 드러난다.
 */
describe('브리프에서 씬 개수 읽기', () => {
  it('번호를 붙인 줄을 센다', () => {
    const brief = ['씬1: 목욕 후 장면', '씬2: 미스트 클로즈업', '씬3: 잠든 아기'].join('\n');
    expect(sceneCountFromBrief(brief)).toBe(3);
  });

  it('표기가 조금 달라도 센다(공백, 마침표, 괄호)', () => {
    expect(sceneCountFromBrief('씬 1. 하나\n씬2) 둘')).toBe(2);
  });

  it('한 씬을 여러 줄로 적어도 씬 수는 그대로다', () => {
    // 줄 수를 세면 안 되는 이유가 이것이다.
    expect(sceneCountFromBrief('씬1: 목욕 후 장면\n  아기가 웃는다\n씬2: 미스트')).toBe(2);
  });

  it('같은 번호를 두 번 적어도 한 번으로 센다', () => {
    // 고쳐 쓰다 남은 중복이 씬을 늘리지 않게
    expect(sceneCountFromBrief('씬1: 처음\n씬1: 고쳐 쓴 것\n씬2: 둘')).toBe(2);
  });

  it('번호가 없으면 세지 않는다(null)', () => {
    // 줄글로 적었으면 셀 근거가 없다. 틀린 수로 지시하는 것보다 기본값으로 떨어지는 편이 낫다.
    expect(sceneCountFromBrief('아기 목욕 장면부터 잠들 때까지 보여주세요')).toBeNull();
    expect(sceneCountFromBrief('')).toBeNull();
  });

  it("결과물의 이름인 '동영상' 으로 적어도 센다", () => {
    // 세그먼트 하나가 동영상 하나이고 기획안도 그 이름으로 나온다. 입력칸 예시가 그 이름을 쓰므로
    //   그렇게 적은 사람이 세어지지 않으면 고른 적 없는 개수로 만들어진다.
    const brief = ['동영상1: 문제 제기', '동영상2: 해결', '동영상3: 결과'].join('\n');
    expect(sceneCountFromBrief(brief)).toBe(3);
    expect(sceneCountFromBrief('동영상 1. 하나\n동영상2) 둘')).toBe(2);
  });

  it("예전 표기('씬')도 계속 받는다", () => {
    // 이름을 바꿨다고 그렇게 적던 사람의 입력이 갑자기 세어지지 않으면 안 된다.
    expect(sceneCountFromBrief('씬1: 하나\n씬2: 둘')).toBe(2);
  });

  it('두 표기를 섞어 적어도 번호 기준으로 센다', () => {
    // 같은 번호는 표기가 달라도 한 번이다(고쳐 쓰다 표기만 바뀐 줄이 개수를 늘리지 않게)
    expect(sceneCountFromBrief('동영상1: 하나\n씬1: 고쳐 쓴 것\n씬2: 둘')).toBe(2);
  });

  it.each([
    ['컨셉입력', SCENE_BRIEF_PLACEHOLDER],
    ['프롬프트', PROMPT_BRIEF_PLACEHOLDER],
  ])('화면이 보여주는 예시 그대로 적으면 그 개수로 센다 (%s)', (_name, placeholder) => {
    // 예시가 유일한 안내다. 그 예시대로 적었는데 개수가 안 세어지면 사람은 고를 자리도 없이
    //   기본값으로 만들어진 결과를 받는다. 예시는 산출물과 같은 모양이라 한 동영상이 여러 줄이고
    //   (번호 줄 + 장면 구성 + 대화내용), 그 사이에 빈 줄과 안내 문구도 섞여 있다.
    expect(sceneCountFromBrief(placeholder)).toBe(2);
  });
});

/**
 * 씬 형식 판정: 버전이 아니라 값으로 가른다.
 *
 * 화면마다 버전을 prop 으로 나르면 조건이 버전 수만큼 늘고, 그 값을 빠뜨린 화면이 다른 형식으로
 * 그린다. 그 규칙이 조용히 뒤집히지 않게 여기서 고정한다.
 */
describe('씬 형식 판정', () => {
  it('장면 구성이 있으면 세그먼트 형식이다', () => {
    expect(isSegmentFormat({ sceneComposition: '창가에 선 인물을 천천히 줌인' })).toBe(true);
  });

  it('장면 구성이 없으면 씬 이미지 형식이다', () => {
    expect(isSegmentFormat({ sceneComposition: undefined })).toBe(false);
    expect(isSegmentFormat({ sceneComposition: '' })).toBe(false);
    // 공백만 적힌 값은 없는 것과 같다(만들 화면이 없다)
    expect(isSegmentFormat({ sceneComposition: '   ' })).toBe(false);
  });

  it('대화내용은 판정 근거가 아니다', () => {
    // 말이 없는 동영상이 정상이라, 대화내용이 비었다고 형식이 바뀌면 그 씬만 다르게 그려진다.
    expect(isSegmentFormat({ sceneComposition: '제품 클로즈업' })).toBe(true);
  });
});

/**
 * 세그먼트 연결 방식. 값이 곧 렌더 잡 params 로 나가므로 key 를 고정한다(오타는 렌더에서 순차로
 * 접히는데, 그러면 '빠른 생성' 을 골라도 조용히 순차로 도는 상태가 된다)
 */
describe('세그먼트 연결 방식', () => {
  it('두 갈래이고 key 는 렌더가 아는 값이다', () => {
    expect(SEGMENT_MODES.map((m) => m.key)).toEqual(['sequential', 'parallel']);
  });

  it('기본은 순차다', () => {
    // 병렬이 빠르지만 기본으로 두지 않는다. 세그먼트를 동시에 만들면 앞뒤가 서로를 보지 못해
    // 흐름이 끊기고, 그 차이는 영상을 다 만든 뒤에야 보인다.
    expect(DEFAULT_SEGMENT_MODE).toBe('sequential');
    expect(SEGMENT_MODES[0].key).toBe(DEFAULT_SEGMENT_MODE);
  });

  it('모든 방식에 이름과 대가 설명이 있다', () => {
    // 고를 때 봐야 하는 것은 이름이 아니라 대가(빠름 ↔ 흐름)다. 설명이 비면 비교가 안 된다.
    for (const m of SEGMENT_MODES) {
      expect(m.label, m.key).toBeTruthy();
      expect(m.description, m.key).toBeTruthy();
    }
  });
});
