import { PLAN_PROCESS_VIEW_V10 } from '../view';
import {
  PLAN_SYSTEM_HEADER,
  PLAN_SYSTEM_HEADER_NO_KEYWORD,
  PLAN_SYSTEM_FOOTER,
  DEFAULT_PLAN_INSTRUCTIONS,
  PLAN_SYSTEM_SEGMENTS,
} from '../../../prompt/v10/system';
import { PLAN_USER_SEGMENTS } from '../../../prompt/v10/user';
import { SCENE_IMAGE_SEGMENTS } from '../../../plan-image-prompt';
import { PLAN_PROMPT_ASSEMBLER_V10 } from '../../../prompt';

/**
 * 화면이 그릴 세그먼트는 그 버전 조립기가 준다(실제 조립과 같은 배열이어야 화면이 진짜 나가는
 * 프롬프트를 보여준다)
 *
 * 이 스펙은 v1.0 의 카탈로그로 뷰를 만든다. 아래 단정들이 그 버전의 세그먼트 구성(인포그래픽 배제,
 * 이미지 안전 제약, 브랜드 주제 지시)과 상수를 그대로 가리키기 때문이다. v1.5 에는 여기서 검사하는
 * 세그먼트가 없고 그쪽 구성은 `prompt/__tests__/assembler.spec.ts` 가 잠근다.
 */
const SEGMENTS = PLAN_PROMPT_ASSEMBLER_V10.segments();

describe('프로세스 뷰 (v1.0)', () => {
  it('제작 4단계(키워드/기획서/원천영상/최종영상)로 나누고, 각 단계의 실행 스텝을 순서대로 담는다', () => {
    const view = PLAN_PROCESS_VIEW_V10.build({ segments: SEGMENTS, instructions: '', imageModel: '', briefRefinerLlm: null });

    expect(view.stages.map((s) => s.id)).toEqual(['keyword', 'plan', 'source', 'final']);
    const byStage = Object.fromEntries(view.stages.map((s) => [s.id, s]));

    // 키워드 준비 = 수집(병렬) → 선별(순차) → 보완(조건부 LLM) → 작업자 선택
    //   수집은 여기까지다. 기획서 생성 단계에 데이터 수집 스텝이 없다는 것이 이 변경의 핵심이다.
    expect(byStage.keyword.steps.map((st) => st.id)).toEqual([
      'collect-keyword-pool',
      'filter-keyword-pool',
      'supplement-keyword',
      'select-keyword',
    ]);
    // 기획서 생성 = 기획안생성(순차) → 씬이미지(병렬) → 저장(순차)
    expect(byStage.plan.steps.map((st) => st.id)).toEqual([
      'generate-plan',
      'generate-scene-image',
      'save-plan',
    ]);
    // 원천 영상 = 프로젝트 생성 → 씬 클립 생성(씬 순차) → 이어붙이기+믹스+자막트랙
    expect(byStage.source.steps.map((st) => st.id)).toEqual([
      'create-project',
      'compose-scenes',
      'concat-audio-captions',
    ]);
    // 최종 영상 = 최종 합성 1스텝
    expect(byStage.final.steps.map((st) => st.id)).toEqual(['finalize-composite']);
  });

  it('스텝마다 순차/병렬 실행 특성을 표기한다(실제 파이프라인 반영)', () => {
    const view = PLAN_PROCESS_VIEW_V10.build({ segments: SEGMENTS, instructions: '', imageModel: '', briefRefinerLlm: null });
    const exec: Record<string, 'sequential' | 'parallel'> = {};
    for (const stage of view.stages) for (const st of stage.steps) exec[st.id] = st.execution;

    expect(exec['collect-keyword-pool']).toBe('parallel'); // 키워드 원천 병렬 수집
    expect(exec['filter-keyword-pool']).toBe('sequential');
    expect(exec['supplement-keyword']).toBe('sequential'); // 조건부 단일 LLM 호출
    expect(exec['select-keyword']).toBe('sequential');
    expect(exec['generate-plan']).toBe('sequential'); // 단일 LLM 호출
    expect(exec['generate-scene-image']).toBe('parallel'); // 씬별 팬아웃
    expect(exec['save-plan']).toBe('sequential');
    expect(exec['create-project']).toBe('sequential');
    expect(exec['compose-scenes']).toBe('sequential'); // 씬 순차 루프
    expect(exec['concat-audio-captions']).toBe('sequential');
    expect(exec['finalize-composite']).toBe('parallel'); // 프레임/아웃트로/합성 병렬
  });

  it('프롬프트가 주입되는 스텝만 prompts 를 담고, 나머지 스텝은 note 로 설명한다', () => {
    const view = PLAN_PROCESS_VIEW_V10.build({ segments: SEGMENTS, instructions: '', imageModel: '', briefRefinerLlm: null });
    const byId = Object.fromEntries(
      view.stages.flatMap((s) => s.steps).map((st) => [st.id, st]),
    );

    // 기획안 생성 = 시스템 + 유저 프롬프트
    expect(byId['generate-plan'].usesPrompt).toBe(true);
    expect(byId['generate-plan'].prompts.map((p) => p.id)).toEqual(['plan-system', 'plan-user']);
    // 씬 이미지 = 씬 이미지 프롬프트
    expect(byId['generate-scene-image'].usesPrompt).toBe(true);
    expect(byId['generate-scene-image'].prompts.map((p) => p.id)).toEqual(['scene-image']);
    // 씬 클립 생성 = 씬 모션 프롬프트(조건부): Wan I2V / Grok Imagine 공통, 슬라이드쇼 미사용
    expect(byId['compose-scenes'].usesPrompt).toBe(true);
    expect(byId['compose-scenes'].prompts.map((p) => p.id)).toEqual(['compose-visual']);
    const motion = byId['compose-scenes'].prompts[0].nodes[0];
    expect(motion.kind).toBe('conditional');
    expect(motion.note).toContain('Wan');
    expect(motion.note).toContain('Grok');
    expect(motion.note).toContain('슬라이드쇼');

    // 비프롬프트 스텝 = prompts 비고 note 로 설명
    for (const id of ['collect-keyword-pool', 'filter-keyword-pool', 'select-keyword', 'save-plan', 'create-project', 'concat-audio-captions', 'finalize-composite']) {
      expect(byId[id].usesPrompt).toBe(false);
      expect(byId[id].prompts).toEqual([]);
      expect((byId[id].note ?? '').length).toBeGreaterThan(0);
    }
    // 자막 번인이 최종 합성 스텝임을 밝힌다.
    expect(byId['finalize-composite'].note).toContain('자막');
  });

  it('프롬프트 주입 스텝은 주입 이벤트(injection)로 언제/몇 번/어떻게를 드러낸다', () => {
    const view = PLAN_PROCESS_VIEW_V10.build({ segments: SEGMENTS, instructions: '', imageModel: '', briefRefinerLlm: null });
    const byId = Object.fromEntries(
      view.stages.flatMap((s) => s.steps).map((st) => [st.id, st]),
    );

    // 기획안 생성 = 1회, system + user 를 한 요청에 함께
    const plan = byId['generate-plan'].injection!;
    expect(plan.summary).toContain('1회');
    expect(plan.assembly).toContain('system');
    expect(plan.assembly).toContain('user');
    expect(plan.cardinality).toContain('1회');

    // 씬 이미지 = 씬마다 1회(병렬)
    expect(byId['generate-scene-image'].injection!.cardinality).toContain('씬마다');

    // 씬 클립(모션) = 씬마다, AI 모션일 때만. 슬라이드쇼 미사용 조건 명시
    const motion = byId['compose-scenes'].injection!;
    expect(motion.condition).toContain('슬라이드쇼');
    expect(motion.timing).toContain('비주얼 렌더');

    // 비프롬프트 스텝은 injection 이 없다.
    for (const id of ['collect-keyword-pool', 'filter-keyword-pool', 'select-keyword', 'save-plan', 'create-project', 'concat-audio-captions', 'finalize-composite']) {
      expect(byId[id].injection).toBeUndefined();
    }
  });

  it('시스템 규칙 노드는 참조하는 유저 데이터 노드로 교차참조(links)를 건다', () => {
    const view = PLAN_PROCESS_VIEW_V10.build({ segments: SEGMENTS, instructions: '', imageModel: '', briefRefinerLlm: null });
    const plan = view.stages[1].steps.find((st) => st.id === 'generate-plan')!;
    const nodes = plan.prompts.flatMap((p) => p.nodes);
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

    // 오디오 선택 규칙(system) → BGM/SFX 후보(user)
    expect(byId['audio-selection'].links).toEqual(['available-bgm', 'available-sfx']);
    // 목적 키워드 지시(system) → 목적 키워드(user). 수집 데이터 노드는 더 이상 없다.
    expect(byId['purpose-keyword'].links).toEqual(['purpose-keywords']);
    // 편집 지침(system) → 브랜드/컨셉 + 목적 키워드(user)
    expect(byId['instructions'].links).toContain('brand-concept');
    // 출력 스키마(system) → 후보 목록(user)
    expect(byId['footer'].links).toEqual(['available-bgm', 'available-sfx']);
    // 개수 지시(system) ↔ 최종 지시(user)
    expect(byId['count'].links).toEqual(['final-instruction']);
    // 링크가 가리키는 노드는 모두 실재한다(같은 스텝 안)
    for (const n of nodes) {
      for (const to of n.links ?? []) expect(byId[to]).toBeDefined();
    }

    // 입력→산출 관계도 드러낸다.
    expect(plan.injection!.output).toContain('JSON');
  });

  it('씬 클립 스텝은 하위단계로 모션 프롬프트가 어느 순간 주입되는지 드러낸다', () => {
    const view = PLAN_PROCESS_VIEW_V10.build({ segments: SEGMENTS, instructions: '', imageModel: '', briefRefinerLlm: null });
    const compose = view.stages
      .flatMap((s) => s.steps)
      .find((st) => st.id === 'compose-scenes')!;
    expect((compose.substeps ?? []).map((ss) => ss.id)).toEqual(['tts', 'visual', 'fit', 'mux']);
    // 프롬프트 주입 지점은 「씬 비주얼 렌더」 하위단계 하나뿐
    const injecting = (compose.substeps ?? []).filter((ss) => ss.injectsPrompt);
    expect(injecting.map((ss) => ss.id)).toEqual(['visual']);
  });

  it('기획서 시스템 프롬프트 노드를 조립 순서대로 만든다(고정/편집/조건부/주입 + 번역)', () => {
    const view = PLAN_PROCESS_VIEW_V10.build({ segments: SEGMENTS, instructions: '', imageModel: '', briefRefinerLlm: null });
    const system = view.stages[1].steps[0].prompts[0]; // generate-plan → plan-system
    expect(system.id).toBe('plan-system');
    expect(system.nodes.map((n) => n.id)).toEqual([
      'header',
      'count',
      'exclude-infographic',
      'purpose-keyword',
      'brand-subject',
      'image-safety',
      'instructions',
      'audio-selection',
      'footer',
    ]);
    const byId = Object.fromEntries(system.nodes.map((n) => [n.id, n]));
    // 머리말은 목적 키워드 유무로 갈린다(injected). 뷰는 키워드가 있는 경우를 보여주고, 없을 때의
    //   문구는 note 가 알린다.
    expect(byId.header.kind).toBe('injected');
    expect(byId.header.content).toBe(PLAN_SYSTEM_HEADER);
    expect(byId.header.note).toContain(PLAN_SYSTEM_HEADER_NO_KEYWORD);
    // 주제 지시 두 갈래는 둘 다 노드로 보이고, 어느 쪽이 언제 실리는지는 note 가 말한다.
    expect(byId['purpose-keyword'].kind).toBe('conditional');
    expect(byId['brand-subject'].kind).toBe('conditional');
    expect(byId.instructions.kind).toBe('editable');
    expect(byId['audio-selection'].kind).toBe('fixed');
    expect(byId.footer.content).toBe(PLAN_SYSTEM_FOOTER);
    // 모든 노드에 한국어 번역/설명이 있다(원문과 나란히 표시)
  });

  it('편집 지침 노드는 기본 지침(원문+번역)을 기준으로 보여주고, 커스텀 여부는 note 로 알린다', () => {
    const def = PLAN_PROCESS_VIEW_V10.build({ segments: SEGMENTS, instructions: '', imageModel: '', briefRefinerLlm: null });
    const defNode = def.stages[1].steps[0].prompts[0].nodes.find((n) => n.id === 'instructions')!;
    expect(defNode.kind).toBe('editable');
    expect(defNode.content).toBe(DEFAULT_PLAN_INSTRUCTIONS); // 기본 모드('기본으로 되돌리기') 기준
    expect(defNode.note).toContain('기본 지침을 사용');

    // 커스텀 저장 시에도 원문/번역은 기본 지침 기준(번역 가능 텍스트), 커스텀 사용 사실만 note 로
    const custom = PLAN_PROCESS_VIEW_V10.build({ segments: SEGMENTS, instructions: '무조건 유머러스하게', imageModel: '', briefRefinerLlm: null });
    const cNode = custom.stages[1].steps[0].prompts[0].nodes.find((n) => n.id === 'instructions')!;
    expect(cNode.content).toBe(DEFAULT_PLAN_INSTRUCTIONS);
    expect(cNode.note).toContain('커스텀');
  });

  /**
   * 이 화면의 핵심 계약: 프롬프트 노드는 실제 조립에 쓰이는 세그먼트 정의에서 파생된다.
   * 세그먼트를 추가/삭제/재배치하거나 문구를 고치면 화면이 자동으로 따라온다. 누군가 뷰에만 노드를
   * 손으로 끼워 넣거나(또는 세그먼트를 추가하고 뷰에 반영하지 않으면) 여기서 깨진다.
   */
  describe('세그먼트 파생', () => {
    const view = PLAN_PROCESS_VIEW_V10.build({ segments: SEGMENTS, instructions: '', imageModel: '', briefRefinerLlm: null });
    const byId = Object.fromEntries(
      view.stages.flatMap((s) => s.steps).map((st) => [st.id, st]),
    );
    const phase = (stepId: string, phaseId: string) =>
      byId[stepId].prompts.find((p) => p.id === phaseId)!;

    it.each([
      ['plan-system', () => phase('generate-plan', 'plan-system'), PLAN_SYSTEM_SEGMENTS],
      ['plan-user', () => phase('generate-plan', 'plan-user'), PLAN_USER_SEGMENTS],
      ['scene-image', () => phase('generate-scene-image', 'scene-image'), SCENE_IMAGE_SEGMENTS],
    ])('%s 노드는 세그먼트 정의의 id/원문/종류를 그대로 따른다', (_name, getPhase, segments) => {
      const nodes = getPhase().nodes;
      expect(nodes.map((n) => n.id)).toEqual(segments.map((s) => s.id));
      expect(nodes.map((n) => n.content)).toEqual(segments.map((s) => s.template));
      expect(nodes.map((n) => n.kind)).toEqual(segments.map((s) => s.kind));
    });

    /**
     * 주제 지시는 둘 중 하나만 실린다: 목적 키워드가 있으면 키워드 지시, 없으면 브랜드 지시
     * 그래서 '전 세그먼트가 동시에 실린다' 는 성립하지 않는다. 대신 각 갈래에서 나머지 전부가
     * 실리고 그 둘 중 정확히 하나가 실리는지를 본다(둘 다 실리면 상반된 주제 지시가 함께 나간다)
     */
    const EXCLUSIVE_SUBJECT_IDS = ['purpose-keyword', 'brand-subject'];

    it.each([[true], [false]])(
      '시스템 프롬프트 조립에서 어떤 세그먼트도 누락되지 않는다(조건부 전부 켠 경우, 목적 키워드 %s)',
      (hasPurposeKeywords) => {
        // 조건부(배제 지시/이미지 안전)를 모두 활성화해 전 세그먼트가 실제로 실리는지 확인한다.
        const ctx = {
          instructions: DEFAULT_PLAN_INSTRUCTIONS,
          proposalCount: 5,
          sceneCount: 6,
          excludeInfographic: true,
          imageModel: 'gpt-image-2',
          hasPurposeKeywords,
          // 이 버전은 브랜드가 늘 있다. 연출 축 유무는 이 버전의 세그먼트가 읽지 않는다.
          hasBrand: true,
          hasConcepts: true,
        };
        // 조립은 프로덕션이 쓰는 경로로 한다(버전별 조립기). 도메인 함수를 따로 부르면 조립기가
        //   갈리는 날 이 검사는 통과하는데 화면과 실제 프롬프트는 어긋난다.
        const assembled = PLAN_PROMPT_ASSEMBLER_V10.systemPrompt(ctx);
        let subjectCount = 0;
        for (const seg of PLAN_SYSTEM_SEGMENTS) {
          const rendered = seg.render(ctx);
          if (EXCLUSIVE_SUBJECT_IDS.includes(seg.id)) {
            if (rendered.length > 0) subjectCount += 1;
          } else {
            expect(rendered.length).toBeGreaterThan(0); // 전부 켠 조건에선 빠지는 세그먼트가 없다
          }
          for (const line of rendered) expect(assembled).toContain(line);
        }
        expect(subjectCount).toBe(1);
      },
    );
  });

  /**
   * 원천 영상 단계 프롬프트의 원문 주인은 video-model 이다. 여기서 값을 복제하지 않고 받아 쓴다.
   */
  describe('씬 모션 프롬프트(video-model 서술)', () => {
    function motionNode(input: Parameters<typeof PLAN_PROCESS_VIEW_V10.build>[0]) {
      return PLAN_PROCESS_VIEW_V10.build(input)
        .stages.flatMap((s) => s.steps)
        .find((st) => st.id === 'compose-scenes')!
        .prompts[0].nodes[0];
    }

    it('video-model 이 내려준 값을 그대로 보여준다', () => {
      const node = motionNode({
        segments: SEGMENTS,
        instructions: '',
        imageModel: '',
        briefRefinerLlm: null,
        videoModel: {
          sceneMotion: { content: '새 모션 힌트' },
        },
      });
      expect(node.content).toBe('새 모션 힌트');
    });

    it('조회 실패(null)면 마지막으로 알려진 값으로 폴백해 화면이 비지 않는다', () => {
      const node = motionNode({ segments: SEGMENTS, instructions: '', imageModel: '', briefRefinerLlm: null, videoModel: null });
      expect(node.content.length).toBeGreaterThan(0);
    });
  });

  it('이미지 안전 제약 노드는 gpt-image 계열이면 적용 중, 아니면 미적용으로 note 를 바꾼다', () => {
    const on = PLAN_PROCESS_VIEW_V10.build({ segments: SEGMENTS, instructions: '', imageModel: 'gpt-image-2', briefRefinerLlm: null });
    const onNode = on.stages[1].steps[0].prompts[0].nodes.find((n) => n.id === 'image-safety')!;
    expect(onNode.note).toContain('적용 중');

    const off = PLAN_PROCESS_VIEW_V10.build({ segments: SEGMENTS, instructions: '', imageModel: 'flux-schnell', briefRefinerLlm: null });
    const offNode = off.stages[1].steps[0].prompts[0].nodes.find((n) => n.id === 'image-safety')!;
    expect(offNode.note).toContain('미적용');
  });
});
