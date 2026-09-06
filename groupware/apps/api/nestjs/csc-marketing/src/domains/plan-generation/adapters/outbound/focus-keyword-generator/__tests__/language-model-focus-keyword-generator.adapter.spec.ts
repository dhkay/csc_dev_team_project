/**
 * 키워드 보완 어댑터: 전송과 파싱
 *
 * 이 파일이 생기기 전까지 이 파서는 무검증이었다. 유일한 그물은 서비스 스펙의 보완 케이스였고,
 * 그것은 가짜 생성기를 쓰므로 어댑터가 무엇을 보내고 모델 응답을 어떻게 읽는지는 아무도 보지 않았다.
 * 그 사이 이 파서에는 조용히 틀릴 수 있는 규칙이 넷 있다: 배열 건져 내기, 길이 컷, 중복 제거,
 * 그리고 하나도 못 건졌을 때의 처리(빈 목록을 성공으로 돌려주면 화면이 "후보 없음" 과 "모델이
 * 헛소리를 했다" 를 구분하지 못한다)
 */
import { InternalServerErrorException } from '@nestjs/common';
import { LanguageModelFocusKeywordGeneratorAdapter } from '../language-model-focus-keyword-generator.adapter';
import { FOCUS_KEYWORD_MAX_LENGTH } from '../../../../core/domain';
import type { LanguageModelApiClientService } from '../../../../../../shared/adapters/outbound/language-model-api';
import type { FocusKeywordContext } from '../../../../core/application/ports/outbound';

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
  adapter: LanguageModelFocusKeywordGeneratorAdapter;
  client: FakeLmClient;
} {
  const client = new FakeLmClient(text);
  const adapter = new LanguageModelFocusKeywordGeneratorAdapter(
    client as unknown as LanguageModelApiClientService,
  );
  return { adapter, client };
}

/** 프롬프트는 조립된 채로 온다(조립기가 만든다). 어댑터는 그것을 그대로 보내는 것이 계약이다. */
function ctx(overrides: Partial<FocusKeywordContext> = {}): FocusKeywordContext {
  return {
    organizationId: 7,
    systemPrompt: '시스템 규칙',
    userPrompt: '주제: 아기 발진',
    needed: 3,
    model: 'claude-sonnet-5',
    ...overrides,
  };
}

describe('LanguageModelFocusKeywordGeneratorAdapter', () => {
  describe('전송', () => {
    it('받은 프롬프트를 그대로 보낸다(조립하지 않는다)', async () => {
      const { adapter, client } = makeAdapter('["아기 발진 연고"]');

      await adapter.suggest(ctx({ systemPrompt: 'S', userPrompt: 'U' }));

      expect(client.lastPath).toBe('/inference/generate');
      const body = client.lastBody as Record<string, unknown>;
      expect(body.system).toBe('S');
      expect((body.messages as { content: string }[])[0].content).toBe('U');
      expect(body.organizationId).toBe('7'); // 문자열로 전달
      expect(body.model).toBe('claude-sonnet-5');
    });

    it('다양성을 기획 생성보다 높게 둔다', async () => {
      // 같은 씨앗으로 다시 눌렀을 때 같은 목록만 나오면 '생성' 이 의미가 없다. 기획 생성은 반대다.
      //   (결과가 곧 결과물이라 흔들림을 줄인다)
      const { adapter, client } = makeAdapter('["아기 발진 연고"]');
      await adapter.suggest(ctx());
      expect((client.lastBody as Record<string, unknown>).temperature).toBe(1);
    });

    it('예산은 요청 개수로 곱하지 않는다', async () => {
      // 후보 하나가 짧아(개당 10~20 토큰) 15개도 이 안에 넉넉히 든다. 곱하면 쓰지도 않는 상한이
      //   커지고, 창이 작은 모델에서 이유 없이 거절될 수 있다.
      const budget = async (needed: number): Promise<number> => {
        const { adapter, client } = makeAdapter('["아기 발진 연고"]');
        await adapter.suggest(ctx({ needed }));
        return (client.lastBody as Record<string, unknown>).maxTokens as number;
      };
      expect(await budget(15)).toBe(await budget(1));
    });
  });

  describe('파싱', () => {
    it('JSON 배열을 읽는다', async () => {
      const { adapter } = makeAdapter('["아기 발진 연고", "신생아 아기 발진"]');
      expect(await adapter.suggest(ctx())).toEqual(['아기 발진 연고', '신생아 아기 발진']);
    });

    it('코드펜스나 앞뒤 설명이 붙어도 배열만 건져 낸다', async () => {
      const wrapped = '알겠습니다.\n```json\n["아기 발진 연고"]\n```\n도움이 되셨나요?';
      const { adapter } = makeAdapter(wrapped);
      expect(await adapter.suggest(ctx())).toEqual(['아기 발진 연고']);
    });

    it('요청 개수를 넘으면 그만큼만 취한다', async () => {
      // 초과분은 아무도 고르지 않은 후보다(목표를 이미 채웠으므로)
      const { adapter } = makeAdapter('["a", "b", "c", "d", "e"]');
      expect(await adapter.suggest(ctx({ needed: 2 }))).toEqual(['a', 'b']);
    });

    it('같은 말은 한 번만 남긴다', async () => {
      // 모델이 같은 값을 반복해도 목록이 부풀지 않아야 한다(재시도 판정이 그 길이를 본다)
      const { adapter } = makeAdapter('["아기 발진 연고", "아기 발진 연고", "신생아 아기 발진"]');
      expect(await adapter.suggest(ctx())).toEqual(['아기 발진 연고', '신생아 아기 발진']);
    });

    it('공백만 있는 값과 문자열이 아닌 값은 버린다', async () => {
      const { adapter } = makeAdapter('["  ", 12, null, "아기 발진 연고"]');
      expect(await adapter.suggest(ctx())).toEqual(['아기 발진 연고']);
    });

    it('너무 긴 값은 자른다(검색어가 아니라 문장이다)', async () => {
      const long = 'ㄱ'.repeat(FOCUS_KEYWORD_MAX_LENGTH + 50);
      const { adapter } = makeAdapter(JSON.stringify([long]));
      const out = await adapter.suggest(ctx());
      expect(out[0]).toHaveLength(FOCUS_KEYWORD_MAX_LENGTH);
    });

    it('앞뒤 공백을 정리한다', async () => {
      const { adapter } = makeAdapter('["  아기 발진 연고  "]');
      expect(await adapter.suggest(ctx())).toEqual(['아기 발진 연고']);
    });
  });

  describe('하나도 못 건지면 실패로 알린다', () => {
    // 빈 목록을 성공으로 돌려주면 화면이 "후보가 없다" 와 "모델이 헛소리를 했다" 를 구분하지 못한다.
    it.each([
      ['배열이 아님', '죄송합니다, 만들 수 없습니다.'],
      ['빈 배열', '[]'],
      ['쓸 값이 없는 배열', '[12, null, "  "]'],
      ['깨진 JSON', '["아기 발진 연고",'],
    ])('%s → 500', async (_label, text) => {
      const { adapter } = makeAdapter(text);
      await expect(adapter.suggest(ctx())).rejects.toThrow(InternalServerErrorException);
    });
  });
});
