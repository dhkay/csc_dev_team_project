import { TOOL_VERSIONS, type ToolVersion } from '../../../../../../shared/domain/tool-version';
import type { PlanPromptAssembler } from '../../../application/ports/outbound';
import { MAX_SCENE_COUNT } from '../../plan-counts';
import { PLAN_PROMPT_ASSEMBLER_V10 } from '../v10/assembler';
import { PLAN_PROMPT_ASSEMBLER_V15 } from '../v15/assembler';
import { V15_SEGMENT_MAX_SECONDS, V15_SPEECH_MAX_CHARS } from '../v15/limits';
import { V15_DEFAULT_PLAN_INSTRUCTIONS } from '../v15/system';

/**
 * 버전별 프롬프트 조립기(파이프라인 이음새 1/3)
 *
 * 두 버전은 산출물의 모양이 갈린다(v1.5 의 씬은 장면 구성과 대화내용 둘뿐이다)
 * 그래서 이 스펙이 잠그는 것은 둘이 같다는 사실이 아니라 무엇이 갈렸는가다.
 */
const ASSEMBLERS: Record<ToolVersion, PlanPromptAssembler> = {
  'v1.5': PLAN_PROMPT_ASSEMBLER_V15,
  'v1.0': PLAN_PROMPT_ASSEMBLER_V10,
};

const SYSTEM_CTX = {
  instructions: '',
  proposalCount: 5,
  sceneCount: 6,
  excludeInfographic: false,
  imageModel: 'flux-schnell',
  hasPurposeKeywords: true,
  hasBrand: true,
  hasConcepts: true,
};

const USER_CTX = {
  channelName: '블로그',
  brand: { name: '촉촉연구소', description: '보습 전문', concepts: [] },
  purposeKeywords: ['아기 보습'],
  sceneBrief: '',
  constraints: '',
  bgmCandidates: [],
  sfxCandidates: [],
  proposalCount: 1,
};

/** 키워드 보완 컨텍스트. 조건부 세그먼트(채널, 이미 있는 후보)가 실제로 렌더되게 값을 채운다. */
const FOCUS_KEYWORD_CTX = {
  seed: '아기 발진',
  channelName: '블로그',
  existing: ['아기 발진 연고'],
  needed: 3,
};

/** 입력 정제 컨텍스트. 두 절이 다 조건부라 둘 다 채워 렌더되게 한다. */
const REFINER_CTX = {
  sceneBrief: '동영상1 (0-8초) [훅]\n장면 구성: 욕조에 물을 받는 부모\n대화내용: 없음',
  constraints: '아이 얼굴 클로즈업 금지',
};

describe('프롬프트 조립기', () => {
  it('모든 버전에 조립기가 있다', () => {
    for (const v of TOOL_VERSIONS) {
      expect(ASSEMBLERS[v]).toBeDefined();
    }
  });

  describe.each(TOOL_VERSIONS)('%s', (version) => {
    const prompts = ASSEMBLERS[version];

    it('시스템 프롬프트에 편집 지침과 고정 계약이 함께 들어간다', () => {
      const system = prompts.systemPrompt({ ...SYSTEM_CTX, instructions: '무조건 유머러스하게' });
      expect(system).toContain('무조건 유머러스하게'); // 편집분 반영
      expect(system).toContain('JSON 스키마:'); // 고정 FOOTER(파싱 계약)
    });

    it('프로세스 뷰가 쓸 세그먼트가 실제 조립과 같은 정의다', () => {
      // 화면이 자기 목록을 따로 들면 프롬프트를 고칠 때 한쪽만 바뀌어 조용히 거짓말한다.
      const { system, user } = prompts.segments();
      const assembledSystem = prompts.systemPrompt(SYSTEM_CTX);
      for (const def of system) {
        for (const line of def.render(SYSTEM_CTX)) {
          expect(assembledSystem).toContain(line);
        }
      }
      const assembledUser = prompts.userPrompt(USER_CTX);
      for (const def of user) {
        for (const line of def.render(USER_CTX)) {
          expect(assembledUser).toContain(line);
        }
      }
    });

    it('키워드 보완 프롬프트도 같은 계약을 지킨다', () => {
      // 이 프롬프트가 조립기를 우회하면 `segments().focusKeyword` 가 실제 조립과 같다는 보장이
      //   없어지고, 한 버전이 자기 문구를 갖는 순간 프로세스 화면이 나가지 않는 프롬프트를 그린다.
      const { focusKeyword } = prompts.segments();
      const assembled = prompts.focusKeywordUserPrompt(FOCUS_KEYWORD_CTX);
      for (const def of focusKeyword) {
        for (const line of def.render(FOCUS_KEYWORD_CTX)) {
          expect(assembled).toContain(line);
        }
      }
    });

    it('기본 지침이 편집 화면 뷰와 같은 값이다', () => {
      // 서비스는 뷰를 만들지 않고 이 값을 직접 읽는다(저장 정규화와 폴백). 둘이 갈리면 기본 지침을
      //   저장했는데 커스텀으로 굳는다.
      expect(prompts.promptView('', 'flux-schnell').defaultInstructions).toBe(
        prompts.defaultInstructions,
      );
    });

    it('목적 키워드가 없으면 그 절이 빠지고 주제 지시가 갈린다', () => {
      const withKeywords = prompts.systemPrompt(SYSTEM_CTX);
      const withoutKeywords = prompts.systemPrompt({ ...SYSTEM_CTX, hasPurposeKeywords: false });
      expect(withKeywords).not.toBe(withoutKeywords);
    });
  });

  /**
   * 두 버전이 다르다는 것을 잠근다.
   *
   * 여기가 깨진다면 둘 중 하나다. 갈라 둔 정의가 실수로 다시 합쳐졌거나(공용 배열을 가리키게 됐거나),
   * 한 버전의 형식이 다른 버전의 것으로 바뀌었거나. 어느 쪽이든 산출물의 모양이 조용히 달라진다.
   */
  describe('두 버전의 출력 형식이 갈려 있다', () => {
    const v10 = PLAN_PROMPT_ASSEMBLER_V10.systemPrompt(SYSTEM_CTX);
    const v15 = PLAN_PROMPT_ASSEMBLER_V15.systemPrompt(SYSTEM_CTX);

    it('시스템 프롬프트가 서로 다르다', () => {
      expect(v10).not.toBe(v15);
    });

    it('v1.5 의 씬은 장면 구성과 대화내용 둘뿐이다', () => {
      expect(v15).toContain('"sceneComposition"');
      expect(v15).toContain('"dialogue"');
      // 이 버전은 자막을 만들지 않고 씬 이미지도 만들지 않는다. 인포그래픽도 그 형식 밖이다.
      expect(v15).not.toContain('"subtitle"');
      expect(v15).not.toContain('"imagePrompt"');
      expect(v15).not.toContain('"infographic"');
    });

    it('v1.0 의 씬은 소스 방향, 자막, 나레이션, 씬 이미지 브리프를 갖는다', () => {
      expect(v10).toContain('"sourceDirection"');
      expect(v10).toContain('"subtitle"');
      expect(v10).toContain('"narration"');
      expect(v10).toContain('"imagePrompt"');
      expect(v10).not.toContain('"sceneComposition"');
    });

    it('v1.5 는 씬 이미지 프롬프트를 만들지 않는다(v1.0 것으로 대신하지 않는다)', () => {
      // 서비스가 이 버전의 씬 이미지 요청을 400 으로 막으므로 이 함수는 도달하지 않는다. 그 자리를
      //   v1.0 빌더로 채우면 가드가 사라지는 날 이 버전에 없는 형식의 프롬프트가 조용히 나간다.
      //   (v1.0 의 씬은 소스 방향과 자막을 갖는다). 던지는 것이 계약이다.
      expect(() =>
        PLAN_PROMPT_ASSEMBLER_V15.sceneImagePrompt(
          { name: '브랜드', description: '', concepts: [] },
          { imagePrompt: '한 컷', aspectLabel: 'vertical (4:5)' },
        ),
      ).toThrow();
      // v1.0 은 반대다: 그 버전의 정상 경로라 문자열을 만든다.
      expect(
        PLAN_PROMPT_ASSEMBLER_V10.sceneImagePrompt(
          { name: '브랜드', description: '', concepts: [] },
          { imagePrompt: '한 컷', aspectLabel: 'vertical (4:5)' },
        ),
      ).toBeTruthy();
    });

    it('기본 편집 지침이 서로 다르다', () => {
      // 기본 지침은 그 버전 출력 형식을 전제로 쓰인 문장이다. 같으면 한쪽이 없는 필드를 만들라고
      //   지시하고 있다는 뜻이다.
      expect(PLAN_PROMPT_ASSEMBLER_V10.defaultInstructions).not.toBe(
        PLAN_PROMPT_ASSEMBLER_V15.defaultInstructions,
      );
    });

    it('v1.0 은 입력을 정제하지 않는다(세그먼트가 비고 조립은 던진다)', () => {
      // 그 버전에는 직접 적는 칸이 없다. 빈 배열이어야 프로세스 화면이 한 번도 나가지 않는
      //   프롬프트를 그리지 않고, 던져야 서비스의 표 판정이 사라지는 날 그 사실이 즉시 드러난다.
      const { briefRefinerSystem, briefRefinerUser } = PLAN_PROMPT_ASSEMBLER_V10.segments();
      expect(briefRefinerSystem).toEqual([]);
      expect(briefRefinerUser).toEqual([]);
      expect(() => PLAN_PROMPT_ASSEMBLER_V10.briefRefinerSystemPrompt(REFINER_CTX)).toThrow();
      expect(() => PLAN_PROMPT_ASSEMBLER_V10.briefRefinerUserPrompt(REFINER_CTX)).toThrow();
    });
  });

  /**
   * v1.5 의 입력 정제 프롬프트. 기획 LLM 앞에서 작업자 원문을 파이프라인 형식으로 다시 쓰는 호출이다.
   *
   * 여기가 지키는 것은 정제기가 기획 시스템 프롬프트와 같은 한계를 말한다는 사실이다. 한쪽만 바뀌면
   * 정제기가 통과시킨 문장을 기획 LLM 이 다시 줄이거나, 정제기가 이유 없이 줄인다.
   */
  describe('v1.5: 입력 정제 프롬프트', () => {
    const prompts = PLAN_PROMPT_ASSEMBLER_V15;

    it('프로세스 뷰가 쓸 세그먼트가 실제 조립과 같은 정의다', () => {
      const { briefRefinerSystem, briefRefinerUser } = prompts.segments();
      const system = prompts.briefRefinerSystemPrompt(REFINER_CTX);
      for (const def of briefRefinerSystem) {
        for (const line of def.render(REFINER_CTX)) expect(system).toContain(line);
      }
      const user = prompts.briefRefinerUserPrompt(REFINER_CTX);
      for (const def of briefRefinerUser) {
        for (const line of def.render(REFINER_CTX)) expect(user).toContain(line);
      }
    });

    it('파이프라인의 한계를 기획 프롬프트와 같은 상수로 말한다', () => {
      // 글자 수와 초와 동영상 수 상한이 두 프롬프트에서 같은 수여야 한다.
      const system = prompts.briefRefinerSystemPrompt(REFINER_CTX);
      expect(system).toContain(`${V15_SPEECH_MAX_CHARS}자 이내`);
      expect(system).toContain(`최대 ${V15_SEGMENT_MAX_SECONDS}초`);
      expect(system).toContain(`${MAX_SCENE_COUNT}개`);
      expect(prompts.systemPrompt(SYSTEM_CTX)).toContain(`${V15_SPEECH_MAX_CHARS}자 이내`);
    });

    it('시간과 화면 글자를 받지 않는다고 말하고, 창작하지 말라고 못박는다', () => {
      // 예시 입력의 실패 양상 그대로다: (0-8초) 구간, [훅] 태그, 따로 모은 전체 나레이션, 로고 컷.
      const system = prompts.briefRefinerSystemPrompt(REFINER_CTX);
      expect(system).toContain('시간은 받지 않는다');
      expect(system).toContain('단계 태그');
      expect(system).toContain('전체 나레이션');
      expect(system).toContain('로고');
      expect(system).toContain('새로 짓지 않는다');
      expect(system).toContain('JSON 스키마:');
    });

    it('유저 프롬프트에 원문 두 절이 그대로 실리고, 적지 않은 절은 빠진다', () => {
      const both = prompts.briefRefinerUserPrompt(REFINER_CTX);
      expect(both).toContain(`[사용자 입력사항]\n${REFINER_CTX.sceneBrief}`);
      expect(both).toContain(`[제한사항]\n${REFINER_CTX.constraints}`);

      const briefOnly = prompts.briefRefinerUserPrompt({ ...REFINER_CTX, constraints: '' });
      expect(briefOnly).not.toContain('[제한사항]');
      const limitsOnly = prompts.briefRefinerUserPrompt({ ...REFINER_CTX, sceneBrief: '' });
      expect(limitsOnly).not.toContain('[사용자 입력사항]');
      expect(limitsOnly).toContain('[제한사항]');
    });

    it('예시가 출력 계약과 어긋나지 않는다', () => {
      // 기획 시스템 프롬프트와 같은 규칙. 가운뎃점을 금지하면서 예시에 쓰면 금지가 무너진다.
      const system = prompts.briefRefinerSystemPrompt(REFINER_CTX);
      expect(system).toContain('가운뎃점 문자를 쓰지 않는다');
      expect(system).not.toContain('·');
    });
  });

  describe('v1.0: 인포그래픽 배제', () => {
    it('excludeInfographic=true 면 스키마에서 infographic 을 빼고 배제 지시를 넣는다', () => {
      // 이 규칙의 주인은 조립기다(어댑터가 아니다)
      const off = PLAN_PROMPT_ASSEMBLER_V10.systemPrompt(SYSTEM_CTX);
      expect(off).toContain('"infographic"');
      expect(off).not.toContain('인포그래픽을 만들지 않는다');

      const on = PLAN_PROMPT_ASSEMBLER_V10.systemPrompt({
        ...SYSTEM_CTX,
        excludeInfographic: true,
      });
      expect(on).not.toContain('"infographic"');
      expect(on).toContain('인포그래픽을 만들지 않는다');
      expect(on).toContain('JSON 스키마:'); // FOOTER 자체는 유지
    });
  });

  describe('v1.5: 대화내용과 나레이션', () => {
    it('대사와 나레이션을 각각 지시하고 누가 말하는지를 밝힌다', () => {
      // 구분을 적지 않으면 모델이 나레이션까지 인물의 대사로 써, 화면 밖 목소리로 의도한 문장이
      //   등장인물의 말이 된다. 결과물을 봐야만 드러난다.
      const prompt = PLAN_PROMPT_ASSEMBLER_V15.systemPrompt(SYSTEM_CTX);
      expect(prompt).toContain('화면 속 인물이 직접 하는 말');
      expect(prompt).toContain('화면 밖에서 읽는 문장');
      expect(prompt).toContain('화면 속 인물은 이 문장을 말하지 않는다');
    });

    it('한 동영상의 말은 둘 중 하나라고 못박는다', () => {
      // 둘을 함께 쓰면 10초 안에서 두 문장이 다 급해지고, 작업자가 입력에서 한쪽을 '없음' 으로
      //   비워 둔 뜻도 결과에서 사라진다.
      const prompt = PLAN_PROMPT_ASSEMBLER_V15.systemPrompt(SYSTEM_CTX);
      expect(prompt).toContain('대화내용과 나레이션 중 하나다');
      expect(prompt).toContain('한 동영상에 둘을 함께 쓰지 않는다');
    });

    it('둘 다 적어 온 입력은 대화내용을 살린다', () => {
      // 어느 쪽을 살릴지 정하지 않으면 같은 입력이 생성할 때마다 다른 화자로 나온다.
      //   같은 규칙을 파서도 강제한다(프롬프트는 지시일 뿐 계약이 아니다)
      const prompt = PLAN_PROMPT_ASSEMBLER_V15.systemPrompt(SYSTEM_CTX);
      expect(prompt).toContain('둘 다 적혀 있으면 대화내용만 살리고');
    });

    it("입력의 '없음' 을 말할 문장으로 옮겨 적지 않게 한다", () => {
      // 화면 예시가 쓰지 않는 쪽을 '없음' 으로 적게 하므로 그 두 글자가 그대로 올라온다. 지시가
      //   없으면 모델이 그것을 말할 문장으로 읽어 영상에서 "없음" 이라고 말한다.
      const prompt = PLAN_PROMPT_ASSEMBLER_V15.systemPrompt(SYSTEM_CTX);
      expect(prompt).toContain('"없음" 이라고 적힌 항목');
    });

    it('분량 예산 40자와 그 근거를 함께 적는다', () => {
      // 근거가 없으면 모델이 길이를 창작 여지로 읽는다. 넘치면 말이 끝나기 전에 클립이 끝난다.
      const prompt = PLAN_PROMPT_ASSEMBLER_V15.systemPrompt(SYSTEM_CTX);
      expect(prompt).toContain('40자 이내');
      expect(prompt).toContain('최대 10초');
    });

    it('스키마가 두 필드를 모두 요구한다', () => {
      const prompt = PLAN_PROMPT_ASSEMBLER_V15.systemPrompt(SYSTEM_CTX);
      expect(prompt).toContain('"dialogue"');
      expect(prompt).toContain('"narration"');
    });

    it('장면 구성의 밀도를 못박는다(항목 나열만으로는 한 문장으로 끝난다)', () => {
      // 담을 항목만 나열하면 모델이 한 문장으로 써도 전부 형식적으로 만족한다. 그래서 분량과
      //   순서, 형태 예시 셋을 함께 못박는다. 누가 이것을 다시 불릿 목록으로 줄이면 여기서 깨진다.
      const system = PLAN_PROMPT_ASSEMBLER_V15.systemPrompt(SYSTEM_CTX);
      expect(system).toContain('세 문장 이상');
      for (const axis of ['배경과 화면 형식', '조명과 색감', '카메라', '동작과 전환', '질감과 마감']) {
        expect(system).toContain(axis);
      }
      // 밀도는 설명보다 보여 주는 편이 정확하다. 예시가 빠지면 그 기준이 사라진다.
      expect(system).toContain('형태 예시');
      expect(system).toContain('이 소재를 따라 쓰지 않는다');
    });

    it('예시가 출력 계약과 어긋나지 않는다', () => {
      // 예시는 모델이 그대로 흉내 내는 글이다. 푸터가 금지한 문자가 예시에 있으면 그 금지가
      //   스스로 무너진다(가운뎃점이 그 경우다)
      const system = PLAN_PROMPT_ASSEMBLER_V15.systemPrompt(SYSTEM_CTX);
      expect(system).toContain('가운뎃점 문자를 쓰지 않는다');
      expect(system).not.toContain('·');
    });

    it('사용자가 적어 온 장면 구성과 대화내용, 나레이션을 살려 쓰라고 지시한다', () => {
      // 화면의 입력 예시가 산출물과 같은 모양이라(`동영상N:` + 세 항목) 사람이 그 모양으로 적어
      //   온다. 살려 쓰라고 말하지 않으면 모델이 참고만 하고 자기 문장으로 다시 쓴다.
      //   주제 갈래와 무관하게 늘 들어가야 한다(개수 지시에 붙인 이유가 그것이다)
      for (const subject of [
        { hasPurposeKeywords: true, hasBrand: true },
        { hasPurposeKeywords: false, hasBrand: true },
        { hasPurposeKeywords: false, hasBrand: false },
      ]) {
        const system = PLAN_PROMPT_ASSEMBLER_V15.systemPrompt({ ...SYSTEM_CTX, ...subject });
        expect(system).toContain('그 순서와 개수를 그대로 따른다');
        expect(system).toContain('장면 구성이나 대화내용, 나레이션이 적혀 있으면 그 내용을 살려 쓰고');
      }
    });

    it('브랜드가 없으면 사용자 입력사항이 주제가 된다', () => {
      const brandless = PLAN_PROMPT_ASSEMBLER_V15.systemPrompt({
        ...SYSTEM_CTX,
        hasPurposeKeywords: false,
        hasBrand: false,
      });
      expect(brandless).toContain('사용자 입력사항');
    });

    it('브랜드가 없으면 유저 프롬프트에서 브랜드 절이 통째로 빠진다', () => {
      const brandless = PLAN_PROMPT_ASSEMBLER_V15.userPrompt({
        ...USER_CTX,
        brand: { name: '', description: '', concepts: [] },
      });
      expect(brandless).not.toContain('[브랜드]');
      // 빈 브랜드명 줄을 남기면 모델이 채워야 할 빈자리로 읽는다.
      expect(brandless).not.toContain('브랜드명:');
    });

    describe('연출 성격 반영 지시(고정부)', () => {
      const CONCEPT_RULE = 'sceneComposition 에 드러나야 한다';
      const NO_CONCEPT_RULE = '이번 생성에는 연출 성격이 없다';

      it('연출 성격을 골랐으면 편집 지침을 통째로 바꿔도 지시가 들어간다', () => {
        // 컨셉입력에서 고른 연출이 영상에 닿는 유일한 연결이다. 편집 지침에 있으면 채널이 지침을
        //   고치는 순간 빠질 수 있어 고정부로 둔다. 그 사실을 여기서 못박는다.
        const system = PLAN_PROMPT_ASSEMBLER_V15.systemPrompt({
          ...SYSTEM_CTX,
          instructions: '핵심 원칙:\n- 재미있게 만든다.',
          hasConcepts: true,
        });
        expect(system).toContain(CONCEPT_RULE);
        expect(system).toContain('일관되게 적용한다');
        expect(system).not.toContain(NO_CONCEPT_RULE);
      });

      it('축 이름은 카탈로그의 것이다(유저 프롬프트의 [연출 성격] 줄과 같은 이름)', () => {
        const system = PLAN_PROMPT_ASSEMBLER_V15.systemPrompt(SYSTEM_CTX);
        for (const label of ['표현 형식', '무드', '톤앤매너', '사운드 스타일', '콘텐츠 구조', '타겟 오디언스', '목적 유형']) {
          expect(system).toContain(label);
        }
      });

      it('브랜드만 고르고 축을 비웠으면 스스로 정하되 일관되게 하라고 말한다', () => {
        const system = PLAN_PROMPT_ASSEMBLER_V15.systemPrompt({
          ...SYSTEM_CTX,
          hasBrand: true,
          hasConcepts: false,
        });
        expect(system).toContain(NO_CONCEPT_RULE);
        expect(system).not.toContain(CONCEPT_RULE);
      });

      it('프롬프트 방식(브랜드 없음)에서는 둘 다 빠진다(주제 지시가 그 자리를 맡는다)', () => {
        const system = PLAN_PROMPT_ASSEMBLER_V15.systemPrompt({
          ...SYSTEM_CTX,
          hasPurposeKeywords: false,
          hasBrand: false,
          hasConcepts: false,
        });
        expect(system).not.toContain(CONCEPT_RULE);
        expect(system).not.toContain(NO_CONCEPT_RULE);
        expect(system).toContain('적히지 않은 것은 전부 네가 정한다');
      });

      it('기본 편집 지침은 그 연결을 다시 말하지 않는다(한 곳에만 둔다)', () => {
        expect(V15_DEFAULT_PLAN_INSTRUCTIONS).not.toContain('연출 성격');
      });
    });
  });
});
