// AI 모델 비용: 표시 계층. 숫자의 단일 출처는 `@csc/pricing` 이다.
//
// 여기가 SSOT 가 아닌 이유: `'$5.00 / 1M 토큰'` 같은 문자열은 곱할 수 없어 실제 비용을 계산하지
// 못하고, 백엔드가 계산하려면 같은 숫자를 따로 들어야 해서 반드시 어긋난다.
// 그래서 숫자는 무의존 공유 커널 `@csc/pricing` 이 갖고 이 파일은 그것을 화면 문자열로 바꾼다.
//
// 새 모델 추가 = aiModelOptions.ts 에 옵션 한 줄 + `@csc/pricing` 의 MODEL_RATE_CARDS 에 카드 한 줄
// (누락은 CI 가 잡는다. scripts/check-pricing-coverage.mjs. 화면은 "단가 확인 필요"로 안전하게 떨어진다.)
//
// 이 도구의 과금 모델
// 외부 모델은 조직이 등록한 자기 API 키로 호출되므로 비용이 조직에서 벤더로 직접 청구된다.
// 우리가 중간에서 청구하지 않는다. 내부(자체) 모델은 사내 GPU 라 외부 과금이 없다.

import { findRateCard, formatUnitRate, pricingAsOf, resolveRateVersion } from '@csc/pricing';
import type { BillingMode } from '@csc/pricing';

export type { BillingMode };

/** 단가 기준일: `@csc/pricing` 의 활성 버전에서 파생된다(손으로 관리하지 않는다) */
export const PRICING_AS_OF = pricingAsOf();

/** 단가 한 줄(표시용) */
export interface PriceRate {
  // 항목 이름: '입력', '이미지 출력' 등
  label: string;
  // 표시 값: '$5.00 / 1M 토큰'. 숫자에서 파생된다.
  value: string;
}

/** 모델 1개의 비용 정보(표시용) */
export interface ModelPricing {
  billing: BillingMode;
  rates: PriceRate[];
  // 과금 단위 보충 설명이나 주의(프로모션, 환산 참고치, 별도 과금 항목 등)
  note?: string;
  // 벤더 공식 가격표: 화면 하단 출처 목록에 벤더별로 한 번만 모아 보여준다.
  sourceUrl?: string;
}

/** 무료 카드는 단가 항목이 없다. 화면에는 한 줄로 그 사실을 보여준다. */
const FREE_RATE: PriceRate = { label: '사용료', value: '추가 비용 없음' };

/**
 * 계량 과금 카드도 단가 항목이 없다. 그러나 무료와 정반대라 문구를 갈라야 한다.
 * 크레딧/플랜 벤더는 요청마다 금액이 달라 정액 단가가 없을 뿐 돈은 나간다.
 */
const METERED_RATE: PriceRate = { label: '사용료', value: '요청마다 다름' };

/**
 * 저장된 모델 key → 표시용 비용. 카탈로그에 없으면 undefined(화면이 "단가 확인 필요"로 표시)
 *
 * `at` 을 받는 이유: 단가에 유효 기간이 있다(프로모션). 기본값은 현재 시각이라 화면은 늘
 * "지금 단가" 를 보여주고, 과거 비용을 재현해야 하는 화면은 그 시점을 넘기면 된다.
 *
 * billing 을 rates 보다 먼저 본다. 단가 항목이 비는 이유가 둘(무료 / 계량 과금)이고 의미가
 * 반대라, 빈 것만 보고 판단하면 유료 모델이 "추가 비용 없음" 으로 표시된다. 이 화면에서 그것이
 * 가장 나쁜 오류다(소액을 4자리로 늘려 표시하는 것과 같은 이유다)
 */
export function findModelPricing(key: string, at: Date = new Date()): ModelPricing | undefined {
  const card = findRateCard(key);
  if (!card) return undefined;

  const version = resolveRateVersion(key, at);
  const rates =
    card.billing === 'metered'
      ? [METERED_RATE]
      : card.billing === 'none' || !version || version.rates.length === 0
        ? [FREE_RATE]
        : version.rates.map((rate) => ({ label: rate.label, value: formatUnitRate(rate) }));

  return { billing: card.billing, rates, note: card.note, sourceUrl: card.sourceUrl };
}
