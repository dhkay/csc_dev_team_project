/**
 * 전송 계층의 공유분. 사용량 매핑이 이 파일의 이유다.
 *
 * `prompt→inputTokens` / `completion→outputTokens` 는 이름이 서로 안 비슷해서 거꾸로 써도 눈으로
 * 걸리지 않는다. 그 함수의 주석이 "리뷰에서 반드시 이 두 줄을 확인할 것" 이라고 적어 두었는데,
 * 정작 아무 테스트도 그것을 못박지 않고 있었다. 서비스 스펙은 가짜 생성기에 사용량을 완성된
 * 채로 주입해 매핑을 건너뛰고, 어댑터 스펙의 가짜 클라이언트는 `usage` 를 아예 주지 않는다.
 *
 * 뒤집히면 조용하다. 금액은 계속 나오고 숫자만 틀리며, 입력 단가와 출력 단가가 다르므로
 * (예: Sonnet 5 는 3 대 15) 청구 근거가 5배까지 어긋난다. 그리고 이 함수는 이제 두 버전이
 * 공유하므로 한 번 뒤집히면 두 버전의 원장이 함께 틀린다.
 */
import { GenerateResult, toUsage } from '../text-generate-call';

const res = (usage: GenerateResult['usage'], model?: string): GenerateResult => ({
  text: '[]',
  ...(model === undefined ? {} : { model }),
  usage,
});

describe('toUsage', () => {
  describe('토큰 매핑', () => {
    it('prompt 는 입력이고 completion 은 출력이다', async () => {
      // 값을 크게 다르게 둔 이유: 두 필드를 맞바꾸어도 통과하는 테스트가 되지 않게
      const usage = toUsage(res({ prompt: 1_000_000, completion: 7 }), 'claude-sonnet-5');
      expect(usage?.inputTokens).toBe(1_000_000);
      expect(usage?.outputTokens).toBe(7);
    });

    it('total 은 읽지 않는다(두 값의 합을 우리가 다시 세지 않는다)', async () => {
      const usage = toUsage(res({ prompt: 10, completion: 20, total: 999 }), 'm');
      expect(usage).toEqual({ model: 'm', inputTokens: 10, outputTokens: 20 });
    });

    it('문자열로 온 숫자도 읽는다(구 서버가 그렇게 보낸다)', async () => {
      const usage = toUsage(res({ prompt: '10', completion: '20' }), 'm');
      expect(usage?.inputTokens).toBe(10);
      expect(usage?.outputTokens).toBe(20);
    });
  });

  describe('숫자가 아니면 전체를 버린다', () => {
    // 0 으로 위장하지 않는다. NaN 이 비용 계산에 흘러가면 금액이 NaN 이 되고, 0 으로 바꾸면
    //   화면이 "무료" 라고 거짓말한다. 모름은 모름으로 남겨야 원장이 그것을 모름으로 적는다.
    it.each([
      ['prompt 가 숫자가 아님', { prompt: 'abc', completion: 20 }],
      ['completion 이 null', { prompt: 10, completion: null }],
      ['completion 이 빈 문자열', { prompt: 10, completion: '' }],
      ['completion 이 배열', { prompt: 10, completion: [] }],
      ['둘 다 없음', {}],
    ])('%s → null', async (_label, usage) => {
      expect(toUsage(res(usage as GenerateResult['usage']), 'm')).toBeNull();
    });

    it('usage 자체가 없으면 null(구 버전 서버, 롤링 배포 중)', async () => {
      expect(toUsage(res(null), 'm')).toBeNull();
      expect(toUsage(res(undefined), 'm')).toBeNull();
      expect(toUsage(null, 'm')).toBeNull();
    });
  });

  describe('비용을 귀속할 모델', () => {
    it('서버가 resolve 한 모델을 우선한다', async () => {
      // 요청 모델과 응답 모델이 다를 수 있다(고정 key 오타, 카탈로그 폴백). 실제로 답을 쓴 쪽에
      //   금액이 붙어야 원장이 맞다.
      const usage = toUsage(res({ prompt: 1, completion: 1 }, 'internal-qwen3'), 'claude-sonnet-5');
      expect(usage?.model).toBe('internal-qwen3');
    });

    it('응답이 모델을 밝히지 않으면 요청 모델로 귀속한다', async () => {
      expect(toUsage(res({ prompt: 1, completion: 1 }), 'claude-sonnet-5')?.model).toBe(
        'claude-sonnet-5',
      );
      expect(toUsage(res({ prompt: 1, completion: 1 }, ''), 'claude-sonnet-5')?.model).toBe(
        'claude-sonnet-5',
      );
    });
  });
});
