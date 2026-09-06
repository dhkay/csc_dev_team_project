import { PLAN_PROCESS_VIEW_V15 } from '../view';
import { PLAN_PROMPT_ASSEMBLER_V15 } from '../../../prompt';

/**
 * v1.5(텍스트→영상) 파이프라인 서술
 *
 * 형제 스펙(v10/__tests__/view.spec.ts)이 v1.0 을 잠근다. 이 파일이 지키는 것은 두 버전이 갈린다는
 * 사실 자체다. 한 벌을 두 버전에 보여주면 이 화면이 서버가 400 으로 막는 씬 이미지 스텝과 일어날 수
 * 없는 최종 합성 단계를 설명하게 되고, 그 종류의 거짓은 화면이 멀쩡히 그려져 눈으로만 드러난다.
 */
const SEGMENTS = PLAN_PROMPT_ASSEMBLER_V15.segments();

/** 서비스가 파이프라인 표에서 읽어 넘기는 정제 모델. 뷰는 표를 다시 읽지 않는다. */
const REFINER_LLM = 'refiner-model-key';

function view() {
  return PLAN_PROCESS_VIEW_V15.build({
    segments: SEGMENTS,
    instructions: '',
    imageModel: '',
    briefRefinerLlm: REFINER_LLM,
  });
}

describe('프로세스 뷰 (v1.5)', () => {
  it('제작 3단계(키워드/기획서/영상)다: 최종 영상 단계가 없다', () => {
    // 그 버전에는 에셋 화면이 없어 세트(배경프레임 + 아웃트로)를 만들 수 없다. 만들 수 없는 것을
    //   단계로 그리면 없는 기능을 기다리게 된다.
    expect(view().stages.map((s) => s.id)).toEqual(['keyword', 'plan', 'source']);
  });

  it('기획서 단계는 입력 정제로 시작하고 씬 이미지 스텝이 없다', () => {
    // 이 버전은 이미지를 만들지 않는다(서버가 그 경로를 400 으로 막는다). 대신 직접 적는 칸이
    //   있어 그 원문을 기획 LLM 앞에서 정제한다. 그 스텝이 빠지면 화면이 유료 호출 하나를 감춘다.
    const plan = view().stages.find((s) => s.id === 'plan')!;
    expect(plan.steps.map((st) => st.id)).toEqual(['refine-brief', 'generate-plan', 'save-plan']);
  });

  describe('입력 정제 스텝', () => {
    function refine() {
      const plan = view().stages.find((s) => s.id === 'plan')!;
      return plan.steps.find((st) => st.id === 'refine-brief')!;
    }

    it('시스템과 유저 프롬프트를 조립기의 정제 세그먼트에서 그린다', () => {
      // 화면이 자기 목록을 따로 들면 프롬프트를 고칠 때 한쪽만 바뀌어 조용히 거짓말한다.
      const step = refine();
      expect(step.usesPrompt).toBe(true);
      expect(step.prompts.map((p) => p.id)).toEqual(['brief-refiner-system', 'brief-refiner-user']);
      expect(step.prompts[0].nodes.map((n) => n.id)).toEqual(
        SEGMENTS.briefRefinerSystem.map((d) => d.id),
      );
      expect(step.prompts[1].nodes.map((n) => n.id)).toEqual(
        SEGMENTS.briefRefinerUser.map((d) => d.id),
      );
    });

    it('언제 나가고 언제 나가지 않는지를 조건으로 밝힌다', () => {
      // 두 칸이 비면 호출이 없다. 그 사실이 없으면 가격표의 "최대 2회" 를 읽는 사람이 늘 두 번
      //   나가는 것으로 읽는다.
      const inj = refine().injection!;
      expect(inj.condition).toContain('하나라도 적었을 때만');
      expect(inj.condition).toContain('원문을 그대로 넘겨');
    });

    it('정제 모델은 서비스가 넘긴 값을 그대로 적는다', () => {
      // 뷰가 표를 다시 읽거나 이름을 손으로 적으면 표가 바뀔 때 화면만 옛 모델을 말한다.
      expect(refine().injection!.target).toContain(REFINER_LLM);
    });

    it('무엇을 걷어내는지 말한다(시간 표기, 단계 태그, 따로 적힌 나레이션)', () => {
      const note = refine().note!;
      for (const token of ['시간 표기', '단계 태그', '나레이션']) {
        expect(note).toContain(token);
      }
    });
  });

  it('기획 LLM 단계는 남는다', () => {
    // 영상 모델의 텍스트 인코더는 문장 하나를 클립 하나로 바꿀 뿐이고, 씬이 몇 개인지와 각 씬의
    //   장면 구성/대화내용이 무엇인지는 정하지 못한다. 그것을 쓰는 것이 기획 LLM 이다.
    const plan = view().stages.find((s) => s.id === 'plan')!;
    const generate = plan.steps.find((st) => st.id === 'generate-plan')!;
    expect(generate.usesPrompt).toBe(true);
    expect(generate.prompts.map((p) => p.id)).toEqual(['plan-system', 'plan-user']);
  });

  it('영상 단계는 텍스트→영상이라고 말한다', () => {
    const source = view().stages.find((s) => s.id === 'source')!;
    expect(source.title).toBe('영상 생성');
    expect(source.subtitle).toContain('텍스트→영상');
    expect(source.subtitle).not.toContain('이미지→영상');
  });

  it('비주얼 프롬프트가 장면 구성이다: 씬 모션은 나오지 않는다', () => {
    // 씬 모션은 씬 이미지가 있을 때만 나가는 프롬프트라 이 버전에서는 한 번도 나가지 않는다.
    //   그것을 나가는 것과 같은 무게로 보여주면 화면이 거짓말한다.
    const source = view().stages.find((s) => s.id === 'source')!;
    const compose = source.steps.find((st) => st.id === 'compose-scenes')!;
    const nodeIds = compose.prompts.flatMap((p) => p.nodes.map((n) => n.id));
    expect(nodeIds).toEqual(['scene-composition', 'scene-dialogue', 'scene-narration']);
    expect(nodeIds).not.toContain('scene-motion');
  });

  it('비주얼 주입 설명에 "있으면/없으면" 헤지가 없다', () => {
    // 한 문장이 두 버전을 다 설명하려 하면 어느 쪽 독자도 자기 파이프라인을 읽지 못한다.
    const source = view().stages.find((s) => s.id === 'source')!;
    const compose = source.steps.find((st) => st.id === 'compose-scenes')!;
    expect(compose.injection?.assembly).not.toContain('씬 이미지가 있으면');
    expect(compose.injection?.assembly).toContain('장면 구성');
  });

  it('키워드 단계가 컨셉입력 전용임을 밝힌다', () => {
    // 그 버전은 입력 방식이 둘이고 프롬프트 방식은 이 단계를 밟지 않는다. 단계를 빼면 컨셉입력
    //   경로가 화면에서 사라지므로, 빼는 대신 조건을 적는다.
    const keyword = view().stages.find((s) => s.id === 'keyword')!;
    expect(keyword.subtitle).toContain('컨셉입력');
  });

  it('마지막 스텝이 만드는 일의 끝이라고 말한다', () => {
    // 뒤에 최종 단계가 없으므로 이어붙이기 결과가 곧 완성본이다.
    const source = view().stages.find((s) => s.id === 'source')!;
    const concat = source.steps.find((st) => st.id === 'concat-audio-captions')!;
    expect(concat.note).toContain('마지막');
    expect(concat.note).not.toContain('다음 최종 단계');
  });

  it('완성본이 저절로 워크스페이스에 놓인다고 말하지 않는다', () => {
    // 그 버전의 워크스페이스는 사람이 결과 화면에서 확정한 영상만 담는다(placed_at). 예전 문구는
    //   "나온 영상이 워크스페이스에 놓입니다" 였는데, 그러면 창을 닫아도 남는 것으로 읽힌다.
    const source = view().stages.find((s) => s.id === 'source')!;
    const concat = source.steps.find((st) => st.id === 'concat-audio-captions')!;
    expect(concat.note).toContain('영상 생성');
    expect(concat.note).toContain('결과 화면');
  });

  // 소리를 누가 만드는가
  //
  // 이 버전은 영상 모델이 말까지 만든다(pipelineFor('v1.5').synthesizesSpeech === false). 그래서 TTS 와
  // 그 뒤에 딸린 두 단계가 한 번도 돌지 않는다. 셋을 늘 그려 두고 "나레이션을 쓸 때만 돕니다" 라고
  // 적으면 거짓이다. 그 값은 고르는 값이 아니라 버전이 정하는 사실이다.
  describe('세그먼트 하위단계', () => {
    function substepIds() {
      const source = view().stages.find((s) => s.id === 'source')!;
      const compose = source.steps.find((st) => st.id === 'compose-scenes')!;
      return (compose.substeps ?? []).map((s) => s.id);
    }

    it('발화 길이 산정과 비주얼 렌더 둘뿐이다', () => {
      expect(substepIds()).toEqual(['speech-duration', 'visual']);
    });

    it('TTS 와 길이 맞춤과 오디오 합치기가 없다', () => {
      // 붙일 음성이 없고, 받아온 클립은 자르지도 늘리지도 않는다(자르면 문장이 잘린다)
      for (const gone of ['tts', 'fit', 'mux']) {
        expect(substepIds()).not.toContain(gone);
      }
    });

    it('영상 단계 부제가 나레이션 TTS 를 말하지 않는다', () => {
      const source = view().stages.find((s) => s.id === 'source')!;
      expect(source.subtitle).not.toContain('나레이션 TTS');
      expect(source.subtitle).toContain('영상 모델이 화면과 함께');
    });
  });
});
