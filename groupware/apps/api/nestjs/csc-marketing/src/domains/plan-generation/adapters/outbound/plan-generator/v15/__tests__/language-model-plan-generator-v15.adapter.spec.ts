/**
 * v1.5 기획 생성 어댑터의 벤더 계약
 *
 * 이 파일이 지키는 것은 둘이다.
 *
 * 하나. 이 버전의 스키마만 읽는다. v1.0 어휘가 응답에 섞여 와도 결과에 닿지 않아야 한다.
 * 한 어댑터가 두 스키마를 다 읽으면 v1.0 의 `imagePrompt` 폴백이 이 버전 결과에도 걸린다.
 * 그래서 검사를 "그 필드가 없다" 가 아니라 "있어도 무시한다" 로 쓴다(전자는 그 상태에서도 통과한다)
 *
 * 둘. 전송 노브가 이 버전의 것이다. 예산은 기획안 수로 곱하지 않고(늘 한 편이다) 세그먼트
 * 수로만 커진다. 다양성은 v1.0 보다 낮다(한 편이 곧 결과물이라 흔들림이 값이 아니다)
 */
import { InternalServerErrorException } from '@nestjs/common';
import { LanguageModelPlanGeneratorV15Adapter } from '../language-model-plan-generator-v15.adapter';
import { PlanGenerationContext } from '../../../../../core/application/ports/outbound';
import { PLAN_PROMPT_ASSEMBLER_V15 } from '../../../../../core/domain/prompt';
import { LanguageModelApiClientService } from '../../../../../../../shared/adapters/outbound/language-model-api';

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
  adapter: LanguageModelPlanGeneratorV15Adapter;
  client: FakeLmClient;
} {
  const client = new FakeLmClient(text);
  const adapter = new LanguageModelPlanGeneratorV15Adapter(
    client as unknown as LanguageModelApiClientService,
  );
  return { adapter, client };
}

/**
 * 컨텍스트. 프롬프트는 이 버전의 조립기로 만든다(손으로 적으면 프롬프트가 바뀌어도 이 스펙이
 * 옛 문장을 계속 검사한다). 어댑터는 받은 프롬프트를 그대로 보내는 것이 계약이므로 내용이 무엇인지는
 * 이 파일의 관심이 아니고, 실제 조립 결과가 흐른다는 사실만 필요하다.
 */
function ctx(overrides: Partial<PlanGenerationContext> = {}): PlanGenerationContext {
  const base = {
    instructions: '',
    proposalCount: 1,
    sceneCount: 3,
    excludeInfographic: false,
    imageModel: '',
    channelName: '인스타그램',
    brand: { name: '촉촉연구소', description: '', concepts: [] },
    purposeKeywords: ['수분크림'],
    sceneBrief: '',
    constraints: '',
    bgmCandidates: [
      { id: 11, name: '잔잔', uploadId: 'bgm-11', tags: [{ axisKey: 'mood', value: 'calm' }] },
    ],
    // 효과음 후보를 일부러 채운다. 이 버전이 그것을 쓰지 않는다는 것이 검사할 사실이라,
    //   비워 두면 "안 실렸다" 가 후보가 없어서인지 이 버전이 안 읽어서인지 구분되지 않는다.
    sfxCandidates: [
      { id: 91, name: '휙', uploadId: 'sfx-91', tags: [{ axisKey: 'type', value: 'whoosh' }] },
    ],
  };
  return {
    ...base,
    organizationId: 7,
    model: 'claude-sonnet-5',
    systemPrompt: PLAN_PROMPT_ASSEMBLER_V15.systemPrompt({
      ...base,
      hasPurposeKeywords: base.purposeKeywords.length > 0,
      hasBrand: base.brand.name.length > 0,
      hasConcepts: base.brand.concepts.length > 0,
    }),
    userPrompt: PLAN_PROMPT_ASSEMBLER_V15.userPrompt(base),
    ...overrides,
  };
}

/** 이 버전의 정상 응답 하나. 세그먼트 둘, 말은 동영상마다 한 쪽만 찬다. */
const ONE_VIDEO = JSON.stringify([
  {
    id: 'v-1',
    title: '파우더가 날리지 않는 이유',
    summary: '한 줄 요약',
    bgm: { assetId: 11 },
    scenes: [
      {
        index: 9,
        sceneComposition: '욕실 세면대 앞, 여성이 파우더 뚜껑을 여는 순간을 클로즈업으로 담는다.',
        dialogue: '이거 왜 이렇게 날려요?',
        narration: '',
      },
      {
        index: 9,
        sceneComposition: '제품을 바르고 웃는 얼굴을 미디엄샷으로 담는다.',
        dialogue: '',
        narration: '이제는 다릅니다',
      },
    ],
  },
]);

describe('LanguageModelPlanGeneratorV15Adapter', () => {
  describe('이 버전의 스키마', () => {
    it('장면 구성과 대사, 나레이션을 읽고 씬 index 를 1부터 재부여한다', async () => {
      const { adapter } = makeAdapter(ONE_VIDEO);

      const { proposals } = await adapter.generate(ctx());

      expect(proposals).toHaveLength(1);
      const scenes = proposals[0].scenes;
      expect(scenes.map((s) => s.index)).toEqual([1, 2]); // LLM 이 준 9,9 를 무시한다
      expect(scenes[0].sceneComposition).toContain('욕실 세면대');
      expect(scenes[0].dialogue).toBe('이거 왜 이렇게 날려요?');
      expect(scenes[0].narration).toBe('');
      // 대사가 빈 씬은 그 필드를 싣지 않는다: 부재가 곧 "그 씬에는 대사가 없다" 이다.
      expect(scenes[1].dialogue).toBeUndefined();
      expect(scenes[1].narration).toBe('이제는 다릅니다');
    });

    it('둘 다 온 세그먼트는 대화내용을 남기고 나레이션을 비운다', async () => {
      // 프롬프트가 하나만 쓰라고 지시하지만 지시는 계약이 아니다. 그대로 실으면 한 동영상에서
      //   화면 속 인물과 화면 밖 목소리가 함께 말하고, 최대 10초 안에서 둘 다 잘린다.
      //   어느 쪽을 살릴지는 사용자 입력 규칙과 같다(둘 다 적으면 대화내용)
      const both = JSON.stringify([
        {
          id: 'v-1',
          title: 't',
          summary: 's',
          bgm: { assetId: 11 },
          scenes: [
            {
              index: 1,
              sceneComposition: '말하는 인물을 클로즈업으로 담는다.',
              dialogue: '이거 하나면 끝나요',
              narration: '아직도 파우더 쓰세요?',
            },
          ],
        },
      ]);
      const { adapter } = makeAdapter(both);

      const { proposals } = await adapter.generate(ctx());

      const scene = proposals[0].scenes[0];
      expect(scene.dialogue).toBe('이거 하나면 끝나요');
      expect(scene.narration).toBe('');
    });

    it('기획안 레벨 BGM 은 이 버전도 쓴다(후보로 검증해 스냅샷)', async () => {
      const { adapter } = makeAdapter(ONE_VIDEO);
      const { proposals } = await adapter.generate(ctx());
      expect(proposals[0].bgm).toEqual({ assetId: 11, uploadId: 'bgm-11', name: '잔잔' });
    });

    it('BGM 이 무효여도 후보가 있으면 첫 후보로 폴백한다', async () => {
      const raw = JSON.stringify([
        { id: 'v', title: 't', summary: 's', bgm: { assetId: 999 }, scenes: [] },
      ]);
      const { adapter } = makeAdapter(raw);
      const { proposals } = await adapter.generate(ctx());
      expect(proposals[0].bgm).toEqual({ assetId: 11, uploadId: 'bgm-11', name: '잔잔' });
    });
  });

  describe('v1.0 어휘는 응답에 있어도 무시한다', () => {
    /** v1.0 필드를 전부 실은 응답. 이 버전의 프롬프트는 그것을 요구하지 않는다. */
    const WITH_V10_FIELDS = JSON.stringify([
      {
        id: 'v-1',
        title: 't',
        summary: 's',
        bgm: { assetId: 11 },
        scenes: [
          {
            index: 1,
            sceneComposition: '장면 구성 문장',
            dialogue: '대사',
            narration: '나레이션',
            // ↓ 여기부터 전부 v1.0 의 것
            sourceDirection: '원천 영상 연출',
            subtitle: '자막',
            imagePrompt: 'a close-up of powder',
            infographic: { type: 'list', title: 'IG', items: ['i1', 'i2'] },
            sfx: [{ assetId: 91, offsetSec: 0.5 }],
          },
        ],
      },
    ]);

    it('이미지 프롬프트를 싣지 않는다(연출문으로 메꾸는 폴백이 걸리지 않는다)', async () => {
      const { adapter } = makeAdapter(WITH_V10_FIELDS);
      const { proposals } = await adapter.generate(ctx());
      // 모델이 값을 줬어도 키가 없어야 한다. 이 버전은 씬 이미지를 만들지 않는다.
      //   빈 문자열로 두면 "없다" 가 유효한 값처럼 보여 읽는 쪽이 오독한다(그 사고가 실제로 있었다)
      expect(proposals[0].scenes[0]).not.toHaveProperty('imagePrompt');
    });

    it('원천 영상 연출과 자막을 싣지 않는다', async () => {
      const { adapter } = makeAdapter(WITH_V10_FIELDS);
      const { proposals } = await adapter.generate(ctx());
      expect(proposals[0].scenes[0]).not.toHaveProperty('sourceDirection');
      expect(proposals[0].scenes[0]).not.toHaveProperty('subtitle');
    });

    it('세그먼트가 갖는 키는 이 버전의 것뿐이다', async () => {
      // 위 셋을 하나씩 확인하는 것과 다르다. 새 v1.0 어휘가 엔티티에 늘어나도 이 단정이 잡는다.
      //   그 확장은 실제로 일어나고(인포그래픽이 그랬다), 하나씩 세는 방식은 늘어난 것을 놓친다.
      const { adapter } = makeAdapter(WITH_V10_FIELDS);
      const { proposals } = await adapter.generate(ctx());
      // 효과음(sfx)도 없다: 이 버전의 세그먼트에는 그 자리가 없어 후보 맵조차 만들지 않는다.
      expect(Object.keys(proposals[0].scenes[0]).sort()).toEqual([
        'dialogue',
        'index',
        'narration',
        'sceneComposition',
      ]);
    });

    it('인포그래픽을 읽지 않는다', async () => {
      const { adapter } = makeAdapter(WITH_V10_FIELDS);
      const { proposals } = await adapter.generate(ctx());
      expect(proposals[0].scenes[0].infographic).toBeUndefined();
    });

    it('씬 효과음을 읽지 않는다(후보에 그 id 가 있어도)', async () => {
      // 후보 맵에 91 이 있으므로, 예전 파서라면 스냅샷으로 실었다. 이 버전의 씬에는 그 자리가 없다.
      const { adapter } = makeAdapter(WITH_V10_FIELDS);
      const { proposals } = await adapter.generate(ctx());
      expect(proposals[0].scenes[0].sfx).toBeUndefined();
    });
  });

  describe('전송 노브', () => {
    it('요청 body 를 계약대로 구성한다', async () => {
      const { adapter, client } = makeAdapter(ONE_VIDEO);

      await adapter.generate(ctx());

      expect(client.lastPath).toBe('/inference/generate');
      const body = client.lastBody as Record<string, unknown>;
      expect(body.organizationId).toBe('7'); // 문자열로 전달
      expect(body.model).toBe('claude-sonnet-5');
      expect(typeof body.system).toBe('string');
      const messages = body.messages as { role: string; content: string }[];
      expect(messages[0].role).toBe('user');
    });

    it('다양성은 v1.0 보다 낮다', async () => {
      // 한 편이 곧 결과물이라 같은 입력에 결과가 크게 흔들리면 다시 만들기가 도박이 된다.
      // 그리고 장면 구성 문장은 영상 모델에 그대로 나가는 지시문이라 문장이 튀면 화면이 튄다.
      const { adapter, client } = makeAdapter(ONE_VIDEO);
      await adapter.generate(ctx());
      const temperature = (client.lastBody as Record<string, unknown>).temperature as number;
      expect(temperature).toBeLessThan(0.9);
    });

    it('예산은 세그먼트 수로 커지고, 기획안 수로는 커지지 않는다', async () => {
      const budget = async (proposalCount: number, sceneCount: number): Promise<number> => {
        const { adapter, client } = makeAdapter(ONE_VIDEO);
        await adapter.generate(ctx({ proposalCount, sceneCount }));
        return (client.lastBody as Record<string, unknown>).maxTokens as number;
      };

      // 세그먼트가 늘면 예산이 커진다.
      expect(await budget(1, 8)).toBeGreaterThan(await budget(1, 3));
      // 기획안 수는 이 버전에서 늘 1 이다. 그 값이 예산을 흔들면 서버 규칙이 무너진 날 예산이
      //   함께 부푼다(그리고 그 요금은 실제로 나간다)
      expect(await budget(6, 3)).toBe(await budget(1, 3));
    });

    it('세그먼트 3개에도 한국어 본문이 잘리지 않을 만큼 잡는다', async () => {
      // 빠듯하게 잡았던 값이 실제로 사고를 냈다: 예산 2340 토큰에서 약 절반의 요청이 문장 중간에서
      //   끊겼고, 기획안이 하나뿐인 이 버전은 부분 복구도 듣지 않는다(복구는 완결된 마지막
      //   기획안까지를 살리는 것이라 살릴 것이 없다)
      const { adapter, client } = makeAdapter(ONE_VIDEO);
      await adapter.generate(ctx({ proposalCount: 1, sceneCount: 3 }));
      expect((client.lastBody as Record<string, unknown>).maxTokens as number).toBeGreaterThan(6500);
    });
  });

  describe('해석 실패', () => {
    it('배열이 아니면 500 으로 알린다', async () => {
      const { adapter } = makeAdapter('죄송합니다, 만들 수 없습니다.');
      await expect(adapter.generate(ctx())).rejects.toThrow(InternalServerErrorException);
    });

    it('빈 배열도 실패로 본다(만든 것이 없다)', async () => {
      const { adapter } = makeAdapter('[]');
      await expect(adapter.generate(ctx())).rejects.toThrow(InternalServerErrorException);
    });

    it('잘린 응답은 마지막 완결 기획안까지 복구한다', async () => {
      // 이 버전은 기획안이 하나라 복구가 듣는 경우가 드물지만, 복구 엔진은 공유물이라 여기서도
      //   같은 방식으로 동작해야 한다(닫는 괄호가 없어도 완결된 객체까지는 살린다)
      const truncated = ONE_VIDEO.slice(0, ONE_VIDEO.lastIndexOf(']'));
      const { adapter } = makeAdapter(truncated);
      const { proposals } = await adapter.generate(ctx());
      expect(proposals).toHaveLength(1);
      expect(proposals[0].id).toBe('v-1');
    });
  });
});
