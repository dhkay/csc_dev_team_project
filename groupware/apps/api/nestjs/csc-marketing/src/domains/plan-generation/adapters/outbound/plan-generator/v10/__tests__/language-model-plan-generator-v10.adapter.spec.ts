import { InternalServerErrorException } from '@nestjs/common';
import { LanguageModelPlanGeneratorV10Adapter } from '../language-model-plan-generator-v10.adapter';
import { PlanGenerationContext } from '../../../../../core/application/ports/outbound';
import { PLAN_PROMPT_ASSEMBLER_V10 } from '../../../../../core/domain/prompt';
import { LanguageModelApiClientService } from '../../../../../../../shared/adapters/outbound/language-model-api';

/** LanguageModelApiClientService 가짜: 반환 텍스트를 주입하고 마지막 요청 body 를 캡처한다. */
class FakeLmClient {
  lastPath: string | null = null;
  lastBody: unknown = null;
  constructor(private readonly text: string) {}
  async post<T>(path: string, body?: unknown): Promise<T> {
    this.lastPath = path;
    this.lastBody = body;
    return { text: this.text } as T;
  }
}

function makeAdapter(text: string): {
  adapter: LanguageModelPlanGeneratorV10Adapter;
  client: FakeLmClient;
} {
  const client = new FakeLmClient(text);
  const adapter = new LanguageModelPlanGeneratorV10Adapter(
    client as unknown as LanguageModelApiClientService,
  );
  return { adapter, client };
}

function ctx(
  model = 'claude-sonnet-5',
  instructions = '',
  imageModel = 'flux-schnell',
  audio: Partial<Pick<PlanGenerationContext, 'bgmCandidates' | 'sfxCandidates'>> = {},
): PlanGenerationContext {
  const base = {
    channelName: '유튜브',
    brand: {
      name: '촉촉연구소',
      description: '보습 전문',
      concepts: [
        // 저장값은 작업자가 화면에서 고른 그 문구(brandConceptOptions.resolveConcept)
        { axis: 'style', option: 'live-action-closeup', label: '실사 클로즈업 필름룩', note: '아기 피부, 물방울을 근접 촬영, 연약함 강조' },
        { axis: 'mood', option: 'warm-cozy', label: '웜 & 코지(따뜻한 자연광)', note: '노을빛, 주광의 포근한 가정 분위기' },
      ],
    },
    purposeKeywords: ['수분크림'],
    sceneBrief: '',
    constraints: '',
    model,
    instructions,
    // 선택 개수: 작업자가 위저드에서 고른 값(어댑터가 이 개수로 파싱 결과를 자른다)
    proposalCount: 5,
    sceneCount: 6,
    // 오디오 후보: 기본은 빈 풀(대부분 테스트는 오디오 무관). 오디오 테스트만 주입한다.
    bgmCandidates: audio.bgmCandidates ?? [],
    sfxCandidates: audio.sfxCandidates ?? [],
  };
  // 프롬프트는 서비스가 버전 조립기로 만들어 컨텍스트에 실어 준다(어댑터는 조립하지 않는다)
  //   이 스펙이 v1.0 의 조립기를 쓰는 이유: 어댑터가 받은 것을 그대로 보내는지가 관심사이고, 아래
  //   문자열 단정들이 그 버전의 프롬프트 조각(인포그래픽 스키마, 이미지 안전 제약, 효과음 후보)을
  //   가리키기 때문이다. 어댑터 자체는 버전을 모른다(조립된 문자열만 받는다)
  const prompts = PLAN_PROMPT_ASSEMBLER_V10;
  return {
    ...base,
    organizationId: 7,
    systemPrompt: prompts.systemPrompt({
      instructions,
      proposalCount: base.proposalCount,
      sceneCount: base.sceneCount,
      excludeInfographic: false,
      imageModel,
      hasPurposeKeywords: base.purposeKeywords.length > 0,
      hasBrand: base.brand.name.length > 0,
      hasConcepts: base.brand.concepts.length > 0,
    }),
    userPrompt: prompts.userPrompt(base),
  };
}

/** 오디오 후보 케이스: BGM 2개(sortOrder 순), SFX 1개 */
const BGM_CANDIDATES = [
  { id: 11, name: '잔잔한 피아노', uploadId: 'up-bgm-11', tags: [{ axisKey: 'mood', value: 'calm' }] },
  { id: 12, name: '신나는 EDM', uploadId: 'up-bgm-12', tags: [{ axisKey: 'genre', value: 'edm' }] },
];
const SFX_CANDIDATES = [
  { id: 91, name: '전환 휙', uploadId: 'up-sfx-91', tags: [{ axisKey: 'type', value: 'whoosh' }] },
];

const TWO_PLANS = JSON.stringify([
  {
    id: 'a',
    title: 'A',
    summary: 'sa',
    scenes: [
      { index: 9, sourceDirection: 'sd1', subtitle: 'sub1', narration: 'nar1' },
      {
        index: 9,
        sourceDirection: 'sd2',
        subtitle: 'sub2',
        narration: 'nar2',
        infographic: { title: 'IG', items: ['i1', 'i2', 'i3'] },
      },
    ],
  },
  { id: 'b', title: 'B', summary: 'sb', scenes: [{ index: 1, sourceDirection: 'sd', subtitle: 'su', narration: 'na' }] },
]);

describe('LanguageModelPlanGeneratorV10Adapter', () => {
  it('JSON 배열을 파싱하고 씬 index 를 1-base 로 재부여한다', async () => {
    const { adapter } = makeAdapter(TWO_PLANS);
    const { proposals: plans } = await adapter.generate(ctx());

    expect(plans).toHaveLength(2);
    expect(plans[0].id).toBe('a');
    expect(plans[1].id).toBe('b');
    // LLM 이 준 index(9,9)를 무시하고 순서대로 1,2 재부여
    expect(plans[0].scenes.map((s) => s.index)).toEqual([1, 2]);
    // type 없는 레거시 {title, items} → list 로 폴백
    expect(plans[0].scenes[1].infographic).toEqual({
      type: 'list',
      title: 'IG',
      items: ['i1', 'i2', 'i3'],
    });
    // 인포그래픽 없는 씬은 필드 미포함
    expect(plans[0].scenes[0].infographic).toBeUndefined();
  });

  it('코드펜스/서두 텍스트가 있어도 배열만 추출해 파싱한다', async () => {
    const wrapped = '설명입니다.\n```json\n' + TWO_PLANS + '\n```';
    const { adapter } = makeAdapter(wrapped);
    const { proposals: plans } = await adapter.generate(ctx());
    expect(plans).toHaveLength(2);
  });

  it('요청 개수(proposalCount=5)를 초과하면 그 개수로 자른다', async () => {
    const many = JSON.stringify(
      Array.from({ length: 7 }, (_, i) => ({
        id: `p${i}`,
        title: `T${i}`,
        summary: 's',
        scenes: [{ index: 1, sourceDirection: 'a', subtitle: 'b', narration: 'c' }],
      })),
    );
    const { adapter } = makeAdapter(many);
    const { proposals: plans } = await adapter.generate(ctx());
    expect(plans).toHaveLength(5);
  });

  it('출력 토큰 예산은 요청한 분량에 따라 커진다 (고정 상수가 4개 이상을 잘라 깨뜨렸다)', async () => {
    // 실측: 고정 6000 이던 시절 기획안 3개는 성공, 4개부터 출력이 잘려 JSON 파싱 실패(500)
    // 씬마다 imagePrompt 가 붙어 씬당 출력이 커진 것이 결정타였다. 예산이 분량을 따라가야 한다.
    const budget = async (proposalCount: number, sceneCount: number) => {
      const { adapter, client } = makeAdapter(TWO_PLANS);
      await adapter.generate({ ...ctx(), proposalCount, sceneCount });
      return (client.lastBody as Record<string, unknown>).maxTokens as number;
    };

    expect(await budget(5, 6)).toBeGreaterThan(await budget(1, 6)); // 기획안이 많을수록
    expect(await budget(1, 8)).toBeGreaterThan(await budget(1, 6)); // 씬이 많을수록
    // 실제로 깨졌던 조합은 옛 상수를 넘어야 한다(그래야 잘리지 않는다)
    expect(await budget(4, 6)).toBeGreaterThan(6000);
  });

  it('벤더 창을 여기서 추측하지 않는다: 필요한 만큼 그대로 요청한다', async () => {
    // 모델이 낼 수 있는 한계로 깎는 일은 모델을 아는 language-model 의 몫이다.
    //   (`_clamp_output_tokens` + 카탈로그의 max_output_tokens). 여기에 고정 천장을 두면
    //   모델이 늘 때마다 두 곳이 어긋나고, 큰 요청이 이유 없이 작은 예산을 받는다.
    const budget = async (proposalCount: number, sceneCount: number) => {
      const { adapter, client } = makeAdapter(TWO_PLANS);
      await adapter.generate({ ...ctx(), proposalCount, sceneCount });
      return (client.lastBody as Record<string, unknown>).maxTokens as number;
    };

    // 분량이 커지면 예산도 계속 커진다(천장에서 평평해지지 않는다)
    expect(await budget(10, 6)).toBeGreaterThan(await budget(5, 6));
    // 기획안 5개 × 씬 6개는 옛 고정 천장(16,000)을 넘어야 한다. 그 천장 때문에 이 조합이
    //   오래 모자란 예산을 받았고, 부분 복구가 몇 개를 조용히 버리고 있었다.
    expect(await budget(5, 6)).toBeGreaterThan(16_000);
  });

  it('기획안 1개도 잘리지 않을 예산을 받는다', async () => {
    // 영상 한 편이 목적지인 구성은 늘 기획안 1개다. 그때는 부분 복구가 듣지 않는다(복구는
    //   완결된 마지막 기획안까지를 살리는 것이라 하나뿐이면 살릴 것이 없다). 그래서 이 조합이
    //   가장 빠듯하면 안 되는데, 예전 계수로는 2340 토큰이라 한국어 본문이 절반쯤 잘렸다.
    const { adapter, client } = makeAdapter(TWO_PLANS);
    await adapter.generate({ ...ctx(), proposalCount: 1, sceneCount: 3 });
    // 원장 실측에서 기획안 1개가 6,068 토큰까지 나왔다. 평균이 아니라 그 위쪽을 담아야 한다.
    expect((client.lastBody as Record<string, unknown>).maxTokens as number).toBeGreaterThan(6500);
  });

  it('LLM 요청 body 를 계약대로 구성한다(organizationId 문자열/모델/시스템/유저 메시지)', async () => {
    const { adapter, client } = makeAdapter(TWO_PLANS);
    await adapter.generate(ctx('claude-opus-4-8'));

    expect(client.lastPath).toBe('/inference/generate');
    const body = client.lastBody as Record<string, unknown>;
    expect(body.organizationId).toBe('7'); // 문자열로 전달
    expect(body.model).toBe('claude-opus-4-8');
    expect(typeof body.system).toBe('string');
    expect((body.system as string).length).toBeGreaterThan(0);
    // 상수가 아니라 요청 분량에 따라 커져야 한다. 고정 6000 이던 시절 기획안 4개부터 출력이 잘려
    // JSON 파싱이 깨졌다(실측: 3개 성공 / 4개부터 500). 모델 창에 맞춰 깎는 건 language-model 몫
    expect(body.maxTokens).toBeGreaterThan(6000); // 5개 x 6씬 은 옛 상수로는 모자랐다
    // 다양성 노브도 계약이다. 이 버전은 서로 다른 기획안 여러 개를 한 번에 받으므로 높게 둔다.
    //   아무도 못박지 않던 값이라, 옮기거나 정리하다 조용히 바뀔 수 있었다. 실제로 프로세스 화면의
    //   서술이 이 숫자를 사본으로 들고 있어 한쪽만 바뀌면 화면이 거짓을 말한다(그래서 그 사본을 걷었다)
    expect(body.temperature).toBe(0.9);
    const messages = body.messages as { role: string; content: string }[];
    expect(messages[0].role).toBe('user');
    // 유저 프롬프트에 브랜드/목적 키워드 + 컨셉(라벨 + 감독 노트)이 포함된다.
    expect(messages[0].content).toContain('촉촉연구소');
    expect(messages[0].content).toContain('수분크림');
    // 수집 데이터는 들어가지 않는다(키워드 단계에서 끝난다)
    expect(messages[0].content).not.toContain('[수집 데이터]');
    // 축 라벨 + 저장된 라벨/노트: 고른 그 문구가 손대지 않고 그대로 실린다.
    expect(messages[0].content).toContain('표현 형식: 실사 클로즈업 필름룩, 아기 피부, 물방울을 근접 촬영, 연약함 강조');
    expect(messages[0].content).toContain('무드: 웜 & 코지(따뜻한 자연광), 노을빛, 주광의 포근한 가정 분위기');
    // 값(브랜드명/키워드)도 원문 그대로 실린다.
    expect(messages[0].content).toContain('브랜드명: 촉촉연구소');
  });

  it('토큰 한도로 잘린 배열은 마지막 완결 기획안까지 복구한다', async () => {
    const truncated =
      '[{"id":"a","title":"A","summary":"s","scenes":[{"index":1,"sourceDirection":"sd","subtitle":"su","narration":"na"}]},{"id":"b","title":"B","summ';
    const { adapter } = makeAdapter(truncated);
    const { proposals: plans } = await adapter.generate(ctx());
    expect(plans).toHaveLength(1);
    expect(plans[0].id).toBe('a');
  });

  it('작업자 편집 지침(instructions)이 시스템 프롬프트 중간에 들어간다', async () => {
    const { adapter, client } = makeAdapter(TWO_PLANS);
    await adapter.generate(ctx('claude-sonnet-5', '무조건 유머러스하게, 반전 엔딩 필수'));
    const body = client.lastBody as Record<string, unknown>;
    const system = body.system as string;
    expect(system).toContain('무조건 유머러스하게, 반전 엔딩 필수'); // 편집분 반영
    expect(system).toContain('JSON 스키마:'); // 고정 FOOTER 유지(파싱 계약)
    expect(system).toContain('마케팅 영상 기획안을 만든다'); // 고정 HEADER 유지
  });

  it('목적 키워드를 씬 연출에 직접/간접으로 드러내라는 지시가 항상 들어간다', async () => {
    // 이미지 프롬프트는 목적 키워드를 직접 주입하지 않는다. 캠페인 주제가 화면에 담기는 경로는
    // 기획 LLM 이 sourceDirection 에 녹이는 것뿐이라, 이 지시가 빠지면 이미지가 주제를 잃는다.
    const { adapter, client } = makeAdapter(TWO_PLANS);
    await adapter.generate(ctx());
    const system = (client.lastBody as Record<string, unknown>).system as string;
    expect(system).toContain('직접 또는 간접으로 드러낸다');
    expect(system).toContain('키워드가 여럿이면'); // 다중 키워드 분배
    expect(system).toContain('거기 쓰지 않은 것은 화면에 나오지 않는다'); // 이유를 LLM 에 알린다
  });

  it('키워드 지시는 작업자가 지침을 덮어써도 유지된다(고정 지시부)', async () => {
    const { adapter, client } = makeAdapter(TWO_PLANS);
    await adapter.generate(ctx('claude-sonnet-5', '무조건 유머러스하게'));
    const system = (client.lastBody as Record<string, unknown>).system as string;
    expect(system).toContain('무조건 유머러스하게');
    expect(system).toContain('직접 또는 간접으로 드러낸다');
  });

  it('OpenAI 이미지 모델이면 영유아 신체 연출 금지 제약이 들어간다', async () => {
    // OpenAI 는 영유아 신체를 사실적으로 묘사하는 요청을 거부한다. 그런 씬을 애초에 쓰지 않게 막는다.
    const { adapter, client } = makeAdapter(TWO_PLANS);
    await adapter.generate(ctx('claude-sonnet-5', '', 'gpt-image-2'));
    const system = (client.lastBody as Record<string, unknown>).system as string;
    expect(system).toContain('영유아나 미성년의 신체를 컷의 주제로 삼지 않는다');
    expect(system).toContain('기저귀 교체, 목욕');
  });

  it('자체 이미지 모델(FLUX)이면 그 제약을 걸지 않는다', async () => {
    // 자체 호스팅은 그 필터가 없다. 육아 브랜드의 창작 폭을 불필요하게 줄이지 않는다.
    const { adapter, client } = makeAdapter(TWO_PLANS);
    await adapter.generate(ctx('claude-sonnet-5', '', 'flux-schnell'));
    const system = (client.lastBody as Record<string, unknown>).system as string;
    expect(system).not.toContain('infant');
  });

  it('안전 제약은 작업자가 지침을 덮어써도 유지된다(고정 지시부)', async () => {
    // 벤더 제약이라 편집 가능한 중간 지침이 아니라 고정부에 있어야 한다.
    const { adapter, client } = makeAdapter(TWO_PLANS);
    await adapter.generate(ctx('claude-sonnet-5', '아기 목욕 장면을 꼭 넣어라', 'gpt-image-2'));
    const system = (client.lastBody as Record<string, unknown>).system as string;
    expect(system).toContain('아기 목욕 장면을 꼭 넣어라'); // 편집분은 그대로 반영되고
    expect(system).toContain('영유아나 미성년의 신체를 컷의 주제로 삼지 않는다'); // 제약도 남는다
  });

  it('기본(배제 off)에서는 시스템 프롬프트에 infographic 스키마가 들어간다', async () => {
    const { adapter, client } = makeAdapter(TWO_PLANS);
    await adapter.generate(ctx());
    const system = (client.lastBody as Record<string, unknown>).system as string;
    expect(system).toContain('"infographic"'); // FOOTER 스키마 키
    expect(system).toContain('"type": "timeline"'); // 7종 형태 가이드 포함
    expect(system).toContain('기획안당 인포그래픽은 최대 1개다'); // 기획안당 1개 지침(기본 instructions)
    expect(system).not.toContain('인포그래픽을 만들지 않는다');
  });

  it('받은 프롬프트를 그대로 보낸다(조립하지 않는다)', async () => {
    // 조립 규칙은 버전마다 갈리므로 조립기가 소유한다(core/domain/prompt/{v10,v15}). 어댑터가
    //   손대면 그 규칙이 전송 계층으로 새어 들고, 어댑터가 버전을 알아야 한다.
    //   인포그래픽 배제 같은 조립 규칙의 검증은 조립기 스펙에 있다.
    const { adapter, client } = makeAdapter(TWO_PLANS);
    const context = { ...ctx(), systemPrompt: 'SYS-XYZ', userPrompt: 'USR-XYZ' };
    await adapter.generate(context);

    const body = client.lastBody as Record<string, unknown>;
    expect(body.system).toBe('SYS-XYZ');
    expect((body.messages as { content: string }[])[0].content).toBe('USR-XYZ');
  });

  it('JSON 이 아니면 예외를 던진다', async () => {
    const { adapter } = makeAdapter('죄송하지만 생성할 수 없습니다.');
    await expect(adapter.generate(ctx())).rejects.toThrow(InternalServerErrorException);
  });

  it('빈 배열이면 예외를 던진다', async () => {
    const { adapter } = makeAdapter('[]');
    await expect(adapter.generate(ctx())).rejects.toThrow(InternalServerErrorException);
  });
});

describe('인포그래픽 다형 파싱 + 캡(기획안당 1개)', () => {
  /** infographic 하나를 단일 씬 기획안에 넣어 파싱 결과를 돌려준다. */
  async function parseInfographic(infographic: unknown) {
    const plan = JSON.stringify([
      {
        id: 'p',
        title: 'T',
        summary: 's',
        scenes: [{ index: 1, sourceDirection: 'sd', subtitle: 'su', narration: 'na', infographic }],
      },
    ]);
    const { adapter } = makeAdapter(plan);
    const { proposals: plans } = await adapter.generate(ctx());
    return plans[0].scenes[0].infographic;
  }

  it('list', async () => {
    expect(await parseInfographic({ type: 'list', title: 'T', items: ['a', 'b'] })).toEqual({
      type: 'list',
      title: 'T',
      items: ['a', 'b'],
    });
  });
  it('table', async () => {
    expect(
      await parseInfographic({ type: 'table', title: 'T', columns: ['c1', 'c2'], rows: [['a', 'b']] }),
    ).toEqual({ type: 'table', title: 'T', columns: ['c1', 'c2'], rows: [['a', 'b']] });
  });
  it('bar: value 를 숫자로 강제하고 unit 을 보존', async () => {
    expect(
      await parseInfographic({ type: 'bar', title: 'T', unit: '%', bars: [{ label: 'A', value: '70' }] }),
    ).toEqual({ type: 'bar', title: 'T', unit: '%', bars: [{ label: 'A', value: 70 }] });
  });
  it('comparison', async () => {
    expect(
      await parseInfographic({
        type: 'comparison',
        title: 'T',
        left: { heading: 'L', points: ['a'] },
        right: { heading: 'R', points: ['b'] },
      }),
    ).toEqual({
      type: 'comparison',
      title: 'T',
      left: { heading: 'L', points: ['a'] },
      right: { heading: 'R', points: ['b'] },
    });
  });
  it('steps', async () => {
    expect(await parseInfographic({ type: 'steps', title: 'T', steps: ['1', '2'] })).toEqual({
      type: 'steps',
      title: 'T',
      steps: ['1', '2'],
    });
  });
  it('stat', async () => {
    expect(
      await parseInfographic({ type: 'stat', title: 'T', stats: [{ value: '87%', label: '만족도' }] }),
    ).toEqual({ type: 'stat', title: 'T', stats: [{ value: '87%', label: '만족도' }] });
  });
  it('timeline', async () => {
    expect(
      await parseInfographic({ type: 'timeline', title: 'T', events: [{ time: '1주', label: '런칭' }] }),
    ).toEqual({ type: 'timeline', title: 'T', events: [{ time: '1주', label: '런칭' }] });
  });
  it('미지 type 또는 빈 값이면 인포그래픽 없음', async () => {
    expect(await parseInfographic({ type: 'pie', title: 'T', slices: [1] })).toBeUndefined();
    expect(await parseInfographic({ type: 'list', title: 'T', items: [] })).toBeUndefined();
  });

  it('기획안당 인포그래픽 최대 1개: 첫 인포그래픽 씬만 유지', async () => {
    const plan = JSON.stringify([
      {
        id: 'p',
        title: 'T',
        summary: 's',
        scenes: [
          { index: 1, sourceDirection: 'a', subtitle: '', narration: '', infographic: { type: 'list', title: 'A', items: ['x'] } },
          { index: 2, sourceDirection: 'b', subtitle: '', narration: '', infographic: { type: 'steps', title: 'B', steps: ['y'] } },
        ],
      },
    ]);
    const { adapter } = makeAdapter(plan);
    const { proposals: plans } = await adapter.generate(ctx());
    expect(plans[0].scenes[0].infographic).toEqual({ type: 'list', title: 'A', items: ['x'] });
    expect(plans[0].scenes[1].infographic).toBeUndefined(); // 두 번째는 캡으로 제거
  });
});

describe('BGM/효과음 선택(오디오 후보)', () => {
  /** 단일 기획안(1씬): 주어진 bgm/sfx 원본을 넣어 파싱 결과의 첫 기획안을 돌려준다. */
  async function parseWithAudio(
    bgm: unknown,
    sfx: unknown,
    candidates: Partial<Pick<PlanGenerationContext, 'bgmCandidates' | 'sfxCandidates'>>,
  ) {
    const plan = JSON.stringify([
      {
        id: 'p',
        title: 'T',
        summary: 's',
        ...(bgm !== undefined ? { bgm } : {}),
        scenes: [
          { index: 1, sourceDirection: 'sd', subtitle: 'su', narration: 'na', ...(sfx !== undefined ? { sfx } : {}) },
        ],
      },
    ]);
    const { adapter } = makeAdapter(plan);
    const { proposals } = await adapter.generate(
      ctx('claude-sonnet-5', '', 'flux-schnell', candidates),
    );
    return proposals[0];
  }

  it('유효한 BGM id 를 스냅샷({assetId,uploadId,name})으로 채운다', async () => {
    const p = await parseWithAudio({ assetId: 12 }, undefined, { bgmCandidates: BGM_CANDIDATES });
    expect(p.bgm).toEqual({ assetId: 12, uploadId: 'up-bgm-12', name: '신나는 EDM' });
  });

  it('BGM 이 무효/누락이어도 후보가 있으면 첫 후보(sortOrder 최소)로 폴백한다(필수 보장)', async () => {
    const invalid = await parseWithAudio({ assetId: 999 }, undefined, { bgmCandidates: BGM_CANDIDATES });
    expect(invalid.bgm).toEqual({ assetId: 11, uploadId: 'up-bgm-11', name: '잔잔한 피아노' });
    const missing = await parseWithAudio(undefined, undefined, { bgmCandidates: BGM_CANDIDATES });
    expect(missing.bgm).toEqual({ assetId: 11, uploadId: 'up-bgm-11', name: '잔잔한 피아노' });
  });

  it('BGM 후보가 하나도 없으면 bgm 은 null 이다(렌더에서 강제)', async () => {
    const p = await parseWithAudio({ assetId: 12 }, undefined, { bgmCandidates: [] });
    expect(p.bgm).toBeNull();
  });

  it('유효한 SFX 배열을 씬에 스냅샷 + offsetSec 으로 배치한다(0..N)', async () => {
    const p = await parseWithAudio(undefined, [{ assetId: 91, offsetSec: 0.5 }], { sfxCandidates: SFX_CANDIDATES });
    expect(p.scenes[0].sfx).toEqual([{ assetId: 91, uploadId: 'up-sfx-91', name: '전환 휙', offsetSec: 0.5 }]);
  });

  it('레거시 단일 객체 sfx 도 배열로 정규화한다', async () => {
    const p = await parseWithAudio(undefined, { assetId: 91, offsetSec: 0.5 }, { sfxCandidates: SFX_CANDIDATES });
    expect(p.scenes[0].sfx).toEqual([{ assetId: 91, uploadId: 'up-sfx-91', name: '전환 휙', offsetSec: 0.5 }]);
  });

  it('후보에 없는 SFX id 는 드롭한다(전부 무효면 씬에 효과음 없음)', async () => {
    const p = await parseWithAudio(undefined, [{ assetId: 999, offsetSec: 1 }], { sfxCandidates: SFX_CANDIDATES });
    expect(p.scenes[0].sfx).toBeUndefined();
  });

  it('SFX offsetSec 은 부호 있는 값 그대로 보존한다(음수=전환 걸침), 비정상만 0', async () => {
    const neg = await parseWithAudio(undefined, [{ assetId: 91, offsetSec: -0.5 }], { sfxCandidates: SFX_CANDIDATES });
    expect(neg.scenes[0].sfx?.[0].offsetSec).toBe(-0.5); // 음수 보존 → 렌더가 전환에 걸치게 배치
    const bad = await parseWithAudio(undefined, [{ assetId: 91, offsetSec: 'x' }], { sfxCandidates: SFX_CANDIDATES });
    expect(bad.scenes[0].sfx?.[0].offsetSec).toBe(0); // 비정상만 0
  });

  it('유저 프롬프트에 BGM/SFX 후보 목록(id | name | tags)이 실린다', async () => {
    const { adapter, client } = makeAdapter(TWO_PLANS);
    await adapter.generate(ctx('claude-sonnet-5', '', 'flux-schnell', { bgmCandidates: BGM_CANDIDATES, sfxCandidates: SFX_CANDIDATES }));
    const content = (client.lastBody as Record<string, unknown>).messages as { content: string }[];
    const prompt = content[0].content;
    expect(prompt).toContain('[사용 가능한 BGM]');
    expect(prompt).toContain('12 | 신나는 EDM | genre=edm');
    expect(prompt).toContain('[사용 가능한 효과음]');
    expect(prompt).toContain('91 | 전환 휙 | type=whoosh');
  });

  it('후보가 비면 프롬프트에 (없음) 으로 표기된다', async () => {
    const { adapter, client } = makeAdapter(TWO_PLANS);
    await adapter.generate(ctx());
    const content = (client.lastBody as Record<string, unknown>).messages as { content: string }[];
    expect(content[0].content).toContain('[사용 가능한 BGM] (기획안 전체에 쓸 하나를 id 로 고른다)\n(없음)');
  });
});
