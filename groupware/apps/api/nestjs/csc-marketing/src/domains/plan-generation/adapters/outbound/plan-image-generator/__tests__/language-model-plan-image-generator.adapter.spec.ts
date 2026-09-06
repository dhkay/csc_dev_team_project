import { InternalServerErrorException } from '@nestjs/common';
import { LanguageModelPlanImageGeneratorAdapter } from '../language-model-plan-image-generator.adapter';
import { PlanImageContext } from '../../../../core/application/ports/outbound';
import { LanguageModelApiClientService } from '../../../../../../shared/adapters/outbound/language-model-api';

/** LanguageModelApiClientService 가짜: 반환 페이로드를 주입하고 마지막 요청을 캡처한다. */
class FakeLmClient {
  lastPath: string | null = null;
  lastBody: unknown = null;
  constructor(private readonly payload: unknown) {}
  async post<T>(path: string, body?: unknown): Promise<T> {
    this.lastPath = path;
    this.lastBody = body;
    return this.payload as T;
  }
}

function makeAdapter(payload: unknown): {
  adapter: LanguageModelPlanImageGeneratorAdapter;
  client: FakeLmClient;
} {
  const client = new FakeLmClient(payload);
  const adapter = new LanguageModelPlanImageGeneratorAdapter(
    client as unknown as LanguageModelApiClientService,
  );
  return { adapter, client };
}

function ctx(): PlanImageContext {
  return {
    organizationId: 7,
    model: 'gpt-image-2',
    prompt: '정사각 포스터',
    size: '1024x1024',
    quality: 'medium',
    seed: 424242,
  };
}

describe('LanguageModelPlanImageGeneratorAdapter', () => {
  it('images[0] 의 b64/mime 를 반환한다', async () => {
    const { adapter } = makeAdapter({ images: [{ b64: 'IMG', mime: 'image/png' }], model: 'gpt-image-1' });
    const result = await adapter.generate(ctx());
    // 구 버전 LLM 서버(usage 없음)를 대변하는 케이스: null 이어야 한다(0 이 아니다)
    expect(result).toEqual({ b64: 'IMG', mimeType: 'image/png', usage: null });
  });

  it('요청 body 를 계약대로 구성한다(organizationId 문자열/모델/프롬프트/size/quality)', async () => {
    const { adapter, client } = makeAdapter({ images: [{ b64: 'IMG', mime: 'image/png' }] });
    await adapter.generate(ctx());

    expect(client.lastPath).toBe('/inference/images');
    const body = client.lastBody as Record<string, unknown>;
    expect(body.organizationId).toBe('7'); // 문자열로 전달
    expect(body.model).toBe('gpt-image-2');
    expect(body.prompt).toBe('정사각 포스터');
    expect(body.size).toBe('1024x1024');
    expect(body.quality).toBe('medium');
    expect(body.seed).toBe(424242); // seed 전달(내장 FLUX 일관성)
  });

  it('mime 이 없으면 image/png 로 기본 채운다', async () => {
    const { adapter } = makeAdapter({ images: [{ b64: 'IMG' }] });
    const result = await adapter.generate(ctx());
    expect(result.mimeType).toBe('image/png');
  });

  it('이미지가 비어 있으면 예외를 던진다', async () => {
    const { adapter } = makeAdapter({ images: [] });
    await expect(adapter.generate(ctx())).rejects.toThrow(InternalServerErrorException);
  });
});
