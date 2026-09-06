import { describe, it, expect } from 'vitest';
import { SagaContextError, assertStorableSagaData } from '../saga-context';

/**
 * 사가 데이터 저장 규칙
 *
 * 이 검사가 없으면 두 실수가 테스트를 통과하고 나중에 다른 곳에서 드러난다. 자격증명은 DB 에 남아
 * 아무 증상도 없이 유출 표면이 되고, Date 는 재개한 뒤에만 문자열로 바뀌어 그 경로에서만 터진다.
 */
describe('assertStorableSagaData', () => {
  it('스칼라와 리터럴은 통과한다', () => {
    expect(() =>
      assertStorableSagaData(
        {
          organizationId: 10,
          title: '영상',
          done: false,
          missing: null,
          scenes: [{ order: 1, imageUploadId: 'u-1' }],
        },
        'context',
      ),
    ).not.toThrow();
  });

  it('자격증명으로 보이는 키를 막는다', () => {
    // 실제로 있었던 실수의 모양: 렌더 스펙을 편의로 컨텍스트에 담으면 조직 API 키가 함께 저장된다.
    expect(() =>
      assertStorableSagaData({ sceneVisualApiKey: 'sk-live-...' }, 'context'),
    ).toThrow(SagaContextError);
    expect(() => assertStorableSagaData({ spec: { apiKey: 'x' } }, 'context')).toThrow(
      /자격증명/,
    );
  });

  it('식별자나 개수는 비밀값이 아니다', () => {
    // 접미사만 보고 막으면 정상 필드가 걸린다. 규칙이 과하면 사람이 규칙을 우회하기 시작한다.
    expect(() =>
      assertStorableSagaData({ apiKeyId: 12, tokenCount: 300 }, 'context'),
    ).not.toThrow();
  });

  it('DTO 인스턴스는 통과한다(왕복해도 필드가 그대로다)', () => {
    // 이 규칙이 과했을 때 기획안 저장이 500 으로 막혔다. HTTP 어댑터가 넘기는 값은 대개 검증
    //   파이프가 만든 클래스 인스턴스이고, 잃는 것은 프로토타입뿐이다(데이터가 아니다)
    class SceneImageDto {
      constructor(
        readonly index: number,
        readonly uploadId: string,
        readonly caption?: string,
      ) {}
    }

    expect(() =>
      assertStorableSagaData(
        { input: { sceneImages: [new SceneImageDto(0, 'u-1')] } },
        'payload',
      ),
    ).not.toThrow();
  });

  it('undefined 는 통과한다(키가 사라져도 읽으면 undefined 다)', () => {
    expect(() => assertStorableSagaData({ channelId: undefined }, 'payload')).not.toThrow();
  });

  it('JSON 왕복이 안전하지 않은 값을 막는다', () => {
    // 재개는 저장된 jsonb 를 되살려 시작한다: Date 는 그때 문자열이 되어 .getTime() 이 터진다.
    expect(() => assertStorableSagaData({ createdAt: new Date() }, 'context')).toThrow(
      /JSON 왕복/,
    );
    expect(() => assertStorableSagaData({ seen: new Set([1]) }, 'context')).toThrow(
      SagaContextError,
    );
    expect(() => assertStorableSagaData({ fn: () => 1 }, 'payload')).toThrow(
      SagaContextError,
    );
    expect(() => assertStorableSagaData({ ratio: Number.NaN }, 'payload')).toThrow(
      SagaContextError,
    );
  });

  it('어긴 자리를 메시지가 가리킨다', () => {
    // 사가는 단계가 여러 개라 "어느 값" 인지가 없으면 찾는 데 시간이 걸린다.
    expect(() =>
      assertStorableSagaData({ scenes: [{ at: new Date() }] }, 'context'),
    ).toThrow(/context\.scenes\[0\]\.at/);
  });
});