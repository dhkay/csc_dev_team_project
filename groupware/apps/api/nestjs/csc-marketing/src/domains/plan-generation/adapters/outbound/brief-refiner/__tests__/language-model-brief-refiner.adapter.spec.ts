/**
 * 입력 정제 어댑터: 전송과 파싱
 *
 * 서비스 스펙은 가짜 정제기를 쓰므로 이 어댑터가 무엇을 보내고 모델 응답을 어떻게 읽는지는 여기서만
 * 검증된다. 조용히 틀릴 수 있는 규칙: 객체 건져 내기, 둘 다 온 말의 처리, 빈 동영상 버리기, 상한 컷,
 * 그리고 하나도 못 읽었을 때의 처리.
 */
import { InternalServerErrorException } from '@nestjs/common';
import {
  LanguageModelBriefRefinerAdapter,
  REQUEST_FULL_WINDOW_TOKENS,
} from '../language-model-brief-refiner.adapter';
import { MAX_SCENE_COUNT } from '../../../../core/domain';
import type { LanguageModelApiClientService } from '../../../../../../shared/adapters/outbound/language-model-api';
import type { BriefRefinementContext } from '../../../../core/application/ports/outbound';

class FakeLmClient {
  lastPath: string | null = null;
  lastBody: unknown = null;
  constructor(
    private readonly text: string,
    private readonly extra: Record<string, unknown> = {},
  ) {}
  async post<T>(path: string, body?: unknown): Promise<T> {
    this.lastPath = path;
    this.lastBody = body;
    return { text: this.text, ...this.extra } as T;
  }
}

function makeAdapter(
  text: string,
  extra: Record<string, unknown> = {},
): { adapter: LanguageModelBriefRefinerAdapter; client: FakeLmClient } {
  const client = new FakeLmClient(text, extra);
  const adapter = new LanguageModelBriefRefinerAdapter(
    client as unknown as LanguageModelApiClientService,
  );
  return { adapter, client };
}

/** 프롬프트는 조립된 채로 온다(조립기가 만든다). 어댑터는 그것을 그대로 보내는 것이 계약이다. */
function ctx(overrides: Partial<BriefRefinementContext> = {}): BriefRefinementContext {
  return {
    organizationId: 7,
    systemPrompt: '정제 규칙',
    userPrompt: '[사용자 입력사항]\n동영상1 (0-8초): 욕조',
    model: 'claude-sonnet-5',
    ...overrides,
  };
}

const ONE_SEGMENT = JSON.stringify({
  segments: [
    {
      sceneComposition: '욕조에 물을 받는 부모',
      dialogue: '',
      narration: '이사하면, 목욕물도 달라질까요',
    },
  ],
  constraints: ['아이 얼굴 클로즈업 금지'],
  notes: ['시간 표기 제거'],
});

describe('LanguageModelBriefRefinerAdapter', () => {
  describe('전송', () => {
    it('받은 프롬프트를 그대로 보낸다(조립하지 않는다)', async () => {
      const { adapter, client } = makeAdapter(ONE_SEGMENT);

      await adapter.refine(ctx({ systemPrompt: 'S', userPrompt: 'U' }));

      expect(client.lastPath).toBe('/inference/generate');
      const body = client.lastBody as Record<string, unknown>;
      expect(body.system).toBe('S');
      expect((body.messages as { content: string }[])[0].content).toBe('U');
      expect(body.organizationId).toBe('7');
      expect(body.model).toBe('claude-sonnet-5');
    });

    it('출력 상한을 이 서버가 정하지 않는다(모델 창 전체를 요청한다)', async () => {
      // 여기서 수를 정하면 그것이 곧 정제본의 글자수 제한이 된다. 원문 길이에 제한이 없으므로 출력에도
      //   없어야 하고, 창은 모델을 아는 language-model 이 깎는다.
      const { adapter, client } = makeAdapter(ONE_SEGMENT);
      await adapter.refine(ctx());
      expect((client.lastBody as Record<string, unknown>).maxTokens).toBe(REQUEST_FULL_WINDOW_TOKENS);
    });

    it('사용량을 결과에 싣는다', async () => {
      const { adapter } = makeAdapter(ONE_SEGMENT, {
        model: 'claude-sonnet-5',
        usage: { prompt: 900, completion: 300, total: 1200 },
      });
      const result = await adapter.refine(ctx());
      expect(result.usage).toEqual({ model: 'claude-sonnet-5', inputTokens: 900, outputTokens: 300 });
    });
  });

  describe('파싱', () => {
    it('JSON 객체를 도메인 구조로 읽는다', async () => {
      const { adapter } = makeAdapter(ONE_SEGMENT);
      const { refined } = await adapter.refine(ctx());
      expect(refined).toEqual({
        segments: [
          {
            sceneComposition: '욕조에 물을 받는 부모',
            dialogue: '',
            narration: '이사하면, 목욕물도 달라질까요',
          },
        ],
        constraints: ['아이 얼굴 클로즈업 금지'],
        notes: ['시간 표기 제거'],
      });
    });

    it('코드펜스나 앞뒤 설명이 붙어도 객체만 건져 낸다', async () => {
      const wrapped = `정제했습니다.\n\`\`\`json\n${ONE_SEGMENT}\n\`\`\`\n도움이 되셨나요?`;
      const { adapter } = makeAdapter(wrapped);
      const { refined } = await adapter.refine(ctx());
      expect(refined.segments).toHaveLength(1);
    });

    it('장면 구성도 말도 없는 항목은 버린다', async () => {
      const { adapter } = makeAdapter(
        JSON.stringify({
          segments: [
            { sceneComposition: '첫 장면' },
            { sceneComposition: '', dialogue: '', narration: '' },
            { dialogue: '말만' },
          ],
        }),
      );
      const { refined } = await adapter.refine(ctx());
      expect(refined.segments).toEqual([
        { sceneComposition: '첫 장면', dialogue: '', narration: '' },
        { sceneComposition: '', dialogue: '말만', narration: '' },
      ]);
    });

    it('대화내용과 나레이션이 둘 다 오면 대화내용만 남긴다', async () => {
      // 기획 파서와 같은 규칙. 어느 쪽을 살릴지 정하지 않으면 같은 입력이 생성마다 다른 화자로 나온다.
      const { adapter } = makeAdapter(
        JSON.stringify({ segments: [{ sceneComposition: 'a', dialogue: '대사', narration: '해설' }] }),
      );
      const { refined } = await adapter.refine(ctx());
      expect(refined.segments[0]).toEqual({ sceneComposition: 'a', dialogue: '대사', narration: '' });
    });

    it('동영상 상한을 넘어도 자르지 않는다(초과 판정은 원문을 아는 서비스의 일)', async () => {
      // 여기서 자르면 작업자가 나눈 단위가 말없이 바뀌고, 서비스는 몇 개가 왔는지 알 수 없어 사유를
      //   알릴 수 없다.
      const many = Array.from({ length: MAX_SCENE_COUNT + 3 }, (_, i) => ({
        sceneComposition: `장면 ${i + 1}`,
      }));
      const { adapter } = makeAdapter(JSON.stringify({ segments: many }));
      const { refined } = await adapter.refine(ctx());
      expect(refined.segments).toHaveLength(MAX_SCENE_COUNT + 3);
    });

    it('제한사항이 문자열 하나로 오면 줄로 나누고, 빈 줄과 문자열이 아닌 값은 버린다', async () => {
      const { adapter } = makeAdapter(
        JSON.stringify({
          segments: [{ sceneComposition: 'a' }],
          constraints: '첫 제한\n\n둘째 제한  ',
          notes: [12, null, '  ', '합쳤다'],
        }),
      );
      const { refined } = await adapter.refine(ctx());
      expect(refined.constraints).toEqual(['첫 제한', '둘째 제한']);
      expect(refined.notes).toEqual(['합쳤다']);
    });

    it('동영상이 없는 객체도 읽는다(제한사항만 적은 경로)', async () => {
      // 비어 있는 것과 못 읽은 것은 다르다. 어느 쪽인지는 원문을 아는 서비스가 판정한다.
      const { adapter } = makeAdapter(JSON.stringify({ segments: [], constraints: ['금지'] }));
      const { refined } = await adapter.refine(ctx());
      expect(refined.segments).toEqual([]);
      expect(refined.constraints).toEqual(['금지']);
    });
  });

  describe('객체를 읽지 못하면 실패로 알린다', () => {
    // 빈 결과를 성공으로 돌려주면 기획 LLM 이 사용자 입력사항 없는 프롬프트를 받는다.
    it.each([
      ['객체가 아님', '죄송합니다, 정제할 수 없습니다.'],
      ['배열', '[{"sceneComposition":"a"}]'],
      ['스키마 밖의 객체', '{"result":"ok"}'],
      ['깨진 JSON', '{"segments": [{"sceneComposition": "a"'],
      ['빈 응답', ''],
    ])('%s → 500', async (_label, text) => {
      const { adapter } = makeAdapter(text);
      await expect(adapter.refine(ctx())).rejects.toThrow(InternalServerErrorException);
    });
  });
});
