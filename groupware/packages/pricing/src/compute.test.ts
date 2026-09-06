/**
 * 비용 계산 잠금: 이 파일이 지키는 건 돈이다.
 *
 * 두 종류를 잠근다:
 *  1. 산수가 정확한가(반올림이 0 인가, 실측 청구서와 맞는가)
 *  2. 모르는 것을 0 으로 위장하지 않는가('무료라서 0' vs '사용량 없어서 모름')
 */

import { describe, expect, it } from 'vitest';
import { BillingUnit } from './units';
import { computeCost, formatMicroUsd } from './compute';
import {
  MODEL_RATE_CARDS,
  findRateCard,
  formatUnitRate,
  pricingAsOf,
  resolveRateVersion,
} from './rates';

const AT = new Date('2026-07-29T00:00:00Z');

describe('산수 정확성', () => {
  it('Opus 입력 1M + 출력 1k = 정확히 5,025,000 µUSD (반올림 0)', () => {
    const r = computeCost({
      modelKey: 'claude-opus-4-8',
      units: {
        [BillingUnit.TextInputToken]: 1_000_000,
        [BillingUnit.TextOutputToken]: 1_000,
      },
      at: AT,
    });
    expect(r.status).toBe('computed');
    // 1,000,000 × 5 + 1,000 × 25 = 5,000,000 + 25,000
    expect(r.costMicroUsd).toBe(5_025_000);
    expect(r.rateVersionId).toBe('anthropic-opus48-2026-07');
  });

  it('실측 앵커: 씬 6개 × 7초 + 입력 이미지 6장 = 2,112,000 µUSD ($2.112)', () => {
    // 레포 주석의 실측("씬당 약 $0.35(약 7초)라 씬 6개면 약 $2.10")과 맞아야 한다.
    const r = computeCost({
      modelKey: 'grok-imagine-video',
      units: {
        [BillingUnit.OutputVideoSecond]: 42,
        [BillingUnit.InputImageCount]: 6,
      },
      at: AT,
    });
    // 42 × 50,000 + 6 × 2,000 = 2,100,000 + 12,000
    expect(r.costMicroUsd).toBe(2_112_000);
    expect(formatMicroUsd(r.costMicroUsd as number)).toBe('$2.11');
    expect(r.breakdown).toHaveLength(2);
  });

  it('gpt-image 는 토큰 과금이고 문서화된 장당 환산 범위 안에 들어온다', () => {
    const r = computeCost({
      modelKey: 'gpt-image-2',
      units: {
        [BillingUnit.TextInputToken]: 20,
        [BillingUnit.ImageOutputToken]: 1_056,
      },
      at: AT,
    });
    // 20 × 5 + 1,056 × 30 = 100 + 31,680
    expect(r.costMicroUsd).toBe(31_780);
    const usd = (r.costMicroUsd as number) / 1_000_000;
    expect(usd).toBeGreaterThan(0.005); // note 의 '낮음' 하한
    expect(usd).toBeLessThan(0.17); // note 의 '높음' 상한
  });

  it('소수 수량은 µUSD 경계에서 정수로 반올림된다', () => {
    const r = computeCost({
      modelKey: 'grok-imagine-video',
      units: { [BillingUnit.OutputVideoSecond]: 7.4 },
      at: AT,
    });
    expect(Number.isInteger(r.costMicroUsd)).toBe(true);
    expect(r.costMicroUsd).toBe(370_000);
  });
});

describe('프로모션 경계 (겹치지 않는 창)', () => {
  it('2026-08-31 은 도입가(입력 $2)', () => {
    const r = computeCost({
      modelKey: 'claude-sonnet-5',
      units: { [BillingUnit.TextInputToken]: 1_000_000 },
      at: new Date('2026-08-31T23:59:59Z'),
    });
    expect(r.rateVersionId).toBe('anthropic-sonnet5-intro');
    expect(r.costMicroUsd).toBe(2_000_000);
  });

  it('2026-09-01 은 정가(입력 $3)', () => {
    const r = computeCost({
      modelKey: 'claude-sonnet-5',
      units: { [BillingUnit.TextInputToken]: 1_000_000 },
      at: new Date('2026-09-01T00:00:00Z'),
    });
    expect(r.rateVersionId).toBe('anthropic-sonnet5-list');
    expect(r.costMicroUsd).toBe(3_000_000);
  });

  it('비교는 UTC 날짜 기준이다. 벤더 현지 기준과 하루 어긋날 수 있음을 문서화한 대로', () => {
    // +09:00 자정은 UTC 로 전날 15:00 이라 도입가 창에 남는다.
    const r = computeCost({
      modelKey: 'claude-sonnet-5',
      units: { [BillingUnit.TextInputToken]: 1_000_000 },
      at: new Date('2026-09-01T00:00:00+09:00'),
    });
    expect(r.rateVersionId).toBe('anthropic-sonnet5-intro');
  });
});

describe('0 의 의미를 섞지 않는다', () => {
  it('사내 모델은 사용량이 없어도 free/0 이다', () => {
    const r = computeCost({ modelKey: 'flux-schnell', units: {}, at: AT });
    expect(r.status).toBe('free');
    expect(r.costMicroUsd).toBe(0);
    expect(r.billing).toBe('none');
  });

  it('계량 과금은 metered 이고 금액이 null 이다. free 와 섞이지 않는다', () => {
    // 크레딧/플랜 벤더는 곱할 단가가 없다. 무료로 처리하면 돈이 나가는 모델이 0원으로 기록된다.
    for (const key of ['higgsfield/kling-video/v3.0/std/text-to-video', 'eleven_multilingual_v2']) {
      const r = computeCost({ modelKey: key, units: {}, at: AT });
      expect(r.status, key).toBe('metered');
      expect(r.costMicroUsd, key).toBeNull();
      expect(r.billing, key).toBe('metered');
      // 감사 근거는 남긴다(어느 카드 버전을 보고 계량으로 판정했는지)
      expect(r.rateVersionId, key).not.toBeNull();
    }
  });

  it('계량 과금은 사용량이 있어도 계산하지 않고 수량만 보존한다', () => {
    // usage-missing 과 갈라야 하는 지점. 사용량을 못 받은 것이 아니라 단가가 없는 것이다.
    const r = computeCost({
      modelKey: 'higgsfield/kling-video/v3.0/std/text-to-video',
      units: { [BillingUnit.OutputVideoSecond]: 7 },
      at: AT,
    });
    expect(r.status).toBe('metered');
    expect(r.costMicroUsd).toBeNull();
    expect(r.units).toEqual({ [BillingUnit.OutputVideoSecond]: 7 });
    expect(r.breakdown).toEqual([]);
  });

  it('유료 모델인데 사용량이 없으면 usage-missing 이고 금액은 null 이다', () => {
    const r = computeCost({ modelKey: 'gpt-image-2', units: {}, at: AT });
    expect(r.status).toBe('usage-missing');
    expect(r.costMicroUsd).toBeNull();
    // 근거는 남긴다. 어느 단가 창에서 못 구했는지 알 수 있어야 한다.
    expect(r.rateVersionId).toBe('openai-gpt-image-2-2026-07');
  });

  it('사내 모델이 사용량을 갖고 있어도 금액은 0, 수량은 보존한다(가동률 관측용)', () => {
    const r = computeCost({
      modelKey: 'wan2.2-ti2v-5b',
      units: { [BillingUnit.OutputVideoSecond]: 42 },
      at: AT,
    });
    expect(r.status).toBe('free');
    expect(r.costMicroUsd).toBe(0);
    expect(r.units[BillingUnit.OutputVideoSecond]).toBe(42);
  });
});

describe('절대 throw 하지 않는다', () => {
  it('단가표에 없는 모델은 rate-unknown 으로 degrade 한다', () => {
    expect(() =>
      computeCost({ modelKey: 'gpt-9-nonexistent', units: {}, at: AT }),
    ).not.toThrow();
    const r = computeCost({ modelKey: 'gpt-9-nonexistent', units: {}, at: AT });
    expect(r.status).toBe('rate-unknown');
    expect(r.costMicroUsd).toBeNull();
  });

  it('빈 모델 key(채널 미선택)도 rate-unknown 이다', () => {
    const r = computeCost({ modelKey: '', units: {}, at: AT });
    expect(r.status).toBe('rate-unknown');
  });

  it('NaN/음수 수량은 계산에서 제외돼 금액이 NaN 이 되지 않는다', () => {
    const r = computeCost({
      modelKey: 'claude-opus-4-8',
      units: {
        [BillingUnit.TextInputToken]: Number.NaN,
        [BillingUnit.TextOutputToken]: -5,
      },
      at: AT,
    });
    // 유효 수량이 하나도 없으니 '모름' 이어야 한다(0 이 아니다)
    expect(r.status).toBe('usage-missing');
    expect(r.costMicroUsd).toBeNull();
  });

  it('카드가 덮지 않는 과거 시각은 rate-unknown 이다', () => {
    const r = computeCost({
      modelKey: 'claude-opus-4-8',
      units: { [BillingUnit.TextInputToken]: 1_000 },
      at: new Date('2019-01-01T00:00:00Z'),
    });
    expect(r.status).toBe('rate-unknown');
  });
});

describe('별칭', () => {
  it('claude-haiku-4-5 는 날짜 접미사 id 와 같은 카드다', () => {
    expect(findRateCard('claude-haiku-4-5')).toBe(findRateCard('claude-haiku-4-5-20251001'));
    const r = computeCost({
      modelKey: 'claude-haiku-4-5',
      units: { [BillingUnit.TextInputToken]: 1_000_000 },
      at: AT,
    });
    expect(r.costMicroUsd).toBe(1_000_000);
  });
});

describe('단가표 불변식', () => {
  it('모든 단가는 정수 µUSD 다. 아니면 곱셈에 반올림이 생긴다', () => {
    for (const [key, card] of Object.entries(MODEL_RATE_CARDS)) {
      for (const version of card.versions) {
        for (const rate of version.rates) {
          expect(Number.isInteger(rate.microUsdPerUnit), `${key}/${rate.unit}`).toBe(true);
          expect(rate.microUsdPerUnit, `${key}/${rate.unit}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('어떤 카드도 버전 창이 겹치지 않는다. 겹치면 해석이 모호해진다', () => {
    for (const [key, card] of Object.entries(MODEL_RATE_CARDS)) {
      const sorted = [...card.versions].sort((a, b) =>
        a.effectiveFrom.localeCompare(b.effectiveFrom),
      );
      for (let i = 1; i < sorted.length; i += 1) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        // 앞 창은 반드시 끝이 있어야 하고, 그 끝이 다음 창 시작보다 앞이어야 한다.
        expect(prev.effectiveTo, `${key}: ${prev.id} 에 effectiveTo 가 없어 다음 창과 겹친다`).toBeDefined();
        // 날짜는 'YYYY-MM-DD' 라 문자열 비교가 곧 시간 순서다(toBeLessThan 은 숫자 전용)
        expect(
          (prev.effectiveTo as string) < curr.effectiveFrom,
          `${key}: ${prev.id}(~${prev.effectiveTo}) 와 ${curr.id}(${curr.effectiveFrom}~) 창이 겹친다`,
        ).toBe(true);
      }
      // 선언 순서도 오름차순이어야 한다(읽는 사람이 순서를 신뢰할 수 있게)
      expect(card.versions.map((v) => v.effectiveFrom)).toEqual(sorted.map((v) => v.effectiveFrom));
    }
  });

  it("billing='none' 카드는 단가 항목이 없다. 항목 없음이 곧 과금 단위 없음의 표현이다", () => {
    for (const [key, card] of Object.entries(MODEL_RATE_CARDS)) {
      if (card.billing !== 'none') continue;
      for (const version of card.versions) {
        expect(version.rates, `${key}`).toHaveLength(0);
      }
    }
  });

  it('버전 id 는 전역 유일하다. 동결 비용의 감사 근거라 중복이면 추적이 깨진다', () => {
    // 카드 단위로 센다. 여러 모델이 한 카드를 공유하는 것은 정상이다: 계량 과금 벤더는 과금
    // 근거가 모델마다 다르지 않아 정책 문장이 하나뿐이고, 그것을 복제하면 벤더가 정책을 바꿀 때
    // 일부만 고쳐진 표가 남는다. 잡아야 하는 것은 서로 다른 카드가 같은 id 를 쓰는 것(복사 실수)이다.
    const cards = [...new Set(Object.values(MODEL_RATE_CARDS))];
    const ids = cards.flatMap((c) => c.versions.map((v) => v.id)).filter((id) => id !== 'internal');
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('표시 형식', () => {
  it('토큰 단가는 1M 분모로 표시한다', () => {
    const version = resolveRateVersion('claude-opus-4-8', AT);
    expect(formatUnitRate(version!.rates[0])).toBe('$5.00 / 1M 토큰');
    expect(formatUnitRate(version!.rates[1])).toBe('$25.00 / 1M 토큰');
  });

  it('영상은 초 단위, 입력 이미지는 장 단위로 표시한다', () => {
    const version = resolveRateVersion('grok-imagine-video', AT);
    expect(formatUnitRate(version!.rates[0])).toBe('$0.05 / 초');
    // 소액이 '$0.00' 으로 보이면 유료 항목이 무료로 읽힌다. 자릿수를 늘려 구분한다.
    expect(formatUnitRate(version!.rates[1])).toBe('$0.002 / 장');
  });

  it('활성 단가 중 어떤 것도 $0.00 으로 표시되지 않는다. 유료가 무료로 보이면 안 된다', () => {
    for (const [key, card] of Object.entries(MODEL_RATE_CARDS)) {
      if (card.billing === 'none') continue;
      for (const version of card.versions) {
        for (const rate of version.rates) {
          expect(formatUnitRate(rate), `${key}/${rate.unit}`).not.toMatch(/\$0\.00(?!\d)/);
        }
      }
    }
  });

  it('소액은 0 으로 보이지 않게 4자리로 표시한다', () => {
    expect(formatMicroUsd(31_780)).toBe('$0.0318');
    expect(formatMicroUsd(2_112_000)).toBe('$2.11');
    expect(formatMicroUsd(0)).toBe('$0');
  });

  it('기준일은 확인일(verifiedOn)에서 파생된다. 벤더 시행일이 아니다', () => {
    // effectiveFrom(2026-01-01)이 아니라 카드들의 verifiedOn 최대값(2026-09-02)을 써야 한다.
    // 시행일로 표시하면 실제 확인 시점보다 반년 오래돼 보여 표의 신뢰를 깎는다.
    // 카드를 추가하며 그날 확인했다면 이 값이 따라 올라간다(손으로 맞추는 상수가 아니다)
    expect(pricingAsOf(AT)).toBe('2026년 9월');
  });
});
