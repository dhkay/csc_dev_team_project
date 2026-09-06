/**
 * 벤더 단가표(숫자 SSOT): 비용 계산과 가격표 화면이 같은 숫자를 쓴다.
 *
 * 표시 문자열이 아니라 숫자를 두는 이유는 곱해야 하기 때문이고, 그 숫자를 백엔드(계산)와
 * 프론트(표시)가 따로 들면 반드시 어긋난다. 그래서 `@csc/entitlements` 와 같은 무의존 공유 커널이다.
 *
 * 금액은 정수 마이크로USD(1e-6 USD)다. 부동소수 위생 때문이 아니라 현재 모든 단가가 µUSD 에서
 * 정수라서 `수량 × 단가` 가 정수 곱셈이 되고 일반 경로에 반올림이 아예 없다. 센트로는
 * $1/1M 토큰을 표현할 수 없다. Number.MAX_SAFE_INTEGER 가 약 $9.0B 이라 BigInt 는 필요 없다.
 *
 * 과금 주체는 셋이다.
 * 'org-key' = 조직이 등록한 자기 API 키로 벤더에 직접 청구된다(우리가 중간에서 청구하지 않는다)
 * 'none'    = 사내 GPU 또는 무료 서비스라 외부 과금 없음
 * 'metered' = 조직 키로 직접 청구되지만 정액 단가표가 없다
 */

import { BillingUnit } from './units';

/**
 * 과금 형태
 *
 * 'metered' 를 따로 둔 이유: 크레딧/플랜 기반 벤더는 `단위 × 단가` 로 계산할 수 있는 정액 단가가
 * 없다. Higgsfield 는 요청 파라미터와 계정 잔액에 따라 크레딧이 정해지고 공식 문서가 "인증된
 * 계정의 견적(POST /estimate/{model})이 authoritative" 라고 못 박는다. ElevenLabs 는 문자 수
 * 과금인데 문자당 단가가 구독 플랜마다 다르다.
 *
 * 그런 벤더에 우리가 숫자를 지어 넣으면 화면은 확실해 보이지만 조직마다 틀린다. 그래서 계산하지
 * 않는다는 사실 자체를 값으로 표현한다('none'(무료)과 섞으면 유료가 무료로 보인다)
 */
export type BillingMode = 'org-key' | 'none' | 'metered';

export interface UnitRate {
  unit: BillingUnit;
  // 1 단위당 마이크로USD. 정수여야 한다(테스트로 강제)
  microUsdPerUnit: number;
  // 표시용 분모: '$5.00 / 1M 토큰' 의 1M. 계산에는 미사용
  displayPer: number;
  // 표시 라벨('입력', '이미지 출력', '영상 생성')
  label: string;
  // 단가의 출처
  //  - 'published' : 벤더 공식 가격표에 있는 값
  //  - 'measured'  : 공식 항목이 없어 청구서 실측으로 추정한 값
  // 감사에서 추정치를 공표가로 오인하지 않게 하는 구분
  basis: 'published' | 'measured';
}

export interface RateCardVersion {
  // 동결 비용 레코드에 함께 저장되는 감사 근거
  id: string;
  // 유효 시작(포함, UTC 날짜 'YYYY-MM-DD'): 벤더 단가가 효력을 갖는 시점
  // 이 값보다 이른 이벤트는 계산 근거가 없어 'rate-unknown' 이 된다(추정하지 않는다)
  // 벤더가 공표하지 않은 과거는 확인한 범위의 시작으로 넉넉히 설정
  effectiveFrom: string;
  // 유효 종료(포함). 없으면 무기한
  effectiveTo?: string;
  // 우리가 벤더 가격표와 마지막으로 대조한 날('YYYY-MM-DD'). effectiveFrom 과 다른 사실이다:
  // 전자는 벤더의 시행일, 이쪽은 확인일. 화면의 "n월 기준" 은 이 값에서 파생
  // 시행일로 표시하면 실제 확인 시점보다 오래돼 보여 신뢰를 잃음
  // 필수 필드로 둔 이유: 새 카드를 넣을 때 확인일을 안 적으면 타입 에러라 잊을 수 없기 때문
  verifiedOn: string;
  rates: UnitRate[];
}

export interface ModelRateCard {
  billing: BillingMode;
  // effectiveFrom 오름차순. 창이 겹치면 안 된다(불변식 테스트가 강제)
  // 프로모션을 "최신 우선" 같은 휴리스틱이 아니라 겹치지 않는 창으로 표현하는 이유:
  // 우선순위 규칙은 미묘하게 틀리기 쉽고, 창이 안 겹치면 해석이 유일해진다.
  versions: RateCardVersion[];
  // 벤더 공식 가격표: 화면 하단 출처 목록
  sourceUrl?: string;
  // 화면에 그대로 나가는 한국어 안내. 가격표와 비용 화면이 같은 문장 사용
  note?: string;
}

const CLAUDE_PRICING_URL = 'https://platform.claude.com/en/docs/about-claude/pricing';

/** 무료(사내 GPU, 무료 서비스) 카드: 단가 항목이 없다는 것이 곧 '과금 단위 없음' 의 표현 */
function freeCard(note: string): ModelRateCard {
  return {
    billing: 'none',
    versions: [{ id: 'internal', effectiveFrom: '2020-01-01', verifiedOn: '2026-07-29', rates: [] }],
    note,
  };
}

/**
 * 계량 과금 카드: 유료인데 정액 단가가 없다(크레딧/플랜 기반)
 *
 * `rates` 가 비는 것은 freeCard 와 같지만 의미가 정반대다. 그래서 표시하는 쪽은 반드시
 * `billing` 을 먼저 보고 갈라야 한다. `rates.length === 0` 만 보고 '무료' 로 처리하면 돈이
 * 나가는 모델이 무료로 표시됨
 *
 * 버전 항목을 두는 이유: 감사 근거(rateVersion id)와 확인일(verifiedOn, 화면의 "n월 기준")이
 * 정액 카드와 같은 방식으로 남아야 함
 */
function meteredCard(id: string, verifiedOn: string, note: string, sourceUrl?: string): ModelRateCard {
  return {
    billing: 'metered',
    versions: [{ id, effectiveFrom: '2026-01-01', verifiedOn, rates: [] }],
    note,
    ...(sourceUrl ? { sourceUrl } : {}),
  };
}

/**
 * Higgsfield 가 중계하는 영상 모델의 공통 카드
 *
 * 모델이 스물 남짓인데 과금 근거가 하나뿐이라(계정 크레딧, 요청별 견적) 카드를 공유한다. 모델마다
 * 같은 문구를 복제하면 벤더가 정책을 바꿀 때 일부만 고쳐진 표가 남음
 */
const HIGGSFIELD_VIDEO_CARD: ModelRateCard = meteredCard(
  'higgsfield-video-2026-08',
  '2026-08-26',
  '크레딧으로 과금되며 고른 모델과 요청 파라미터, 계정 플랜에 따라 금액이 달라집니다. 제출 전 견적 요청으로 그 계정에 청구될 금액을 확인할 수 있습니다. 실패하거나 조정으로 거절된 요청은 청구되지 않으며, 생성된 결과물은 최소 7일간 보관됩니다.',
  'https://docs.higgsfield.ai/docs/concepts/billing-and-retention',
);

/** 모델 key(aiModelOptions.ts 의 AiModelOption.key) → 단가 카드 */
export const MODEL_RATE_CARDS: Record<string, ModelRateCard> = {
  // LLM (기획서 텍스트 생성)
  'claude-opus-4-8': {
    billing: 'org-key',
    versions: [
      {
        id: 'anthropic-opus48-2026-07',
        effectiveFrom: '2026-01-01',
        verifiedOn: '2026-07-29',
        rates: [
          { unit: BillingUnit.TextInputToken, microUsdPerUnit: 5, displayPer: 1_000_000, label: '입력', basis: 'published' },
          { unit: BillingUnit.TextOutputToken, microUsdPerUnit: 25, displayPer: 1_000_000, label: '출력', basis: 'published' },
        ],
      },
    ],
    note: '기획서 1건은 보통 입력이 출력보다 훨씬 큽니다. 품질이 중요한 기획에만 선택하고 반복 생성은 하위 모델을 쓰면 비용이 크게 줄어듭니다.',
    sourceUrl: CLAUDE_PRICING_URL,
  },
  'claude-sonnet-5': {
    billing: 'org-key',
    // 도입 프로모션을 겹치지 않는 두 창으로 표현한다. 경계가 명확해 해석이 유일하다.
    versions: [
      {
        id: 'anthropic-sonnet5-intro',
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-08-31',
        verifiedOn: '2026-07-29',
        rates: [
          { unit: BillingUnit.TextInputToken, microUsdPerUnit: 2, displayPer: 1_000_000, label: '입력', basis: 'published' },
          { unit: BillingUnit.TextOutputToken, microUsdPerUnit: 10, displayPer: 1_000_000, label: '출력', basis: 'published' },
        ],
      },
      {
        id: 'anthropic-sonnet5-list',
        effectiveFrom: '2026-09-01',
        verifiedOn: '2026-07-29',
        rates: [
          { unit: BillingUnit.TextInputToken, microUsdPerUnit: 3, displayPer: 1_000_000, label: '입력', basis: 'published' },
          { unit: BillingUnit.TextOutputToken, microUsdPerUnit: 15, displayPer: 1_000_000, label: '출력', basis: 'published' },
        ],
      },
    ],
    note: '2026-08-31 까지 도입 프로모션가가 적용됩니다(입력 $2.00, 출력 $10.00). Opus 대비 약 1/1.7 비용으로 품질과 속도의 균형이 좋습니다.',
    sourceUrl: CLAUDE_PRICING_URL,
  },
  'claude-haiku-4-5-20251001': {
    billing: 'org-key',
    versions: [
      {
        id: 'anthropic-haiku45-2026-07',
        effectiveFrom: '2026-01-01',
        verifiedOn: '2026-07-29',
        rates: [
          { unit: BillingUnit.TextInputToken, microUsdPerUnit: 1, displayPer: 1_000_000, label: '입력', basis: 'published' },
          { unit: BillingUnit.TextOutputToken, microUsdPerUnit: 5, displayPer: 1_000_000, label: '출력', basis: 'published' },
        ],
      },
    ],
    note: 'Opus 대비 1/5 비용입니다. 대량 초안 생성이나 반복 실험에 적합합니다.',
    sourceUrl: CLAUDE_PRICING_URL,
  },
  'internal-qwen3': freeCard(
    '사내 language-model 서버(자체 GPU)에서 실행됩니다. 외부 과금이 없고 데이터가 조직 밖으로 나가지 않습니다.',
  ),

  // 영상 생성
  'grok-imagine-video': {
    billing: 'org-key',
    versions: [
      {
        id: 'xai-imagine-video-2026-07',
        effectiveFrom: '2026-01-01',
        verifiedOn: '2026-07-29',
        rates: [
          // 공식 가격표는 해상도 구분 없이 정액 $0.050/초다(화질을 낮춰도 요금은 같다)
          { unit: BillingUnit.OutputVideoSecond, microUsdPerUnit: 50_000, displayPer: 1, label: '영상 생성', basis: 'published' },
          // 입력 이미지는 공식 가격표에 항목이 없다. 실측(xAI 콘솔 2026-07-22~28, 21장 $0.04)으로 추정한 값이라
          // basis='measured' 로 표시. 감사에서 공표가로 오인하면 안 됨
          { unit: BillingUnit.InputImageCount, microUsdPerUnit: 2_000, displayPer: 1, label: '입력 이미지', basis: 'measured' },
        ],
      },
    ],
    note: '출력 길이(초)에만 비례하며 해상도를 낮춰도 요금은 같습니다(공식 가격표에 해상도 구분이 없습니다). 씬 길이는 나레이션에 따라 정해지므로 씬당 비용도 그에 비례하고, 영상 1편 비용은 씬 수를 곱한 값입니다. 실측으로는 씬당 약 $0.35(약 7초)라 씬 6개면 약 $2.10 이었습니다. 오디오는 추가 비용 없이 포함되고, 입력 이미지는 공식 가격표에 없지만 청구서에는 장당 약 $0.002 로 잡힙니다. 제한 공개 모델이므로 조직 계정의 사용 가능 여부를 먼저 확인하세요.',
    sourceUrl: 'https://docs.x.ai/docs/pricing',
  },
  // Higgsfield 가 중계하는 텍스트→영상 모델(카탈로그 key = 'higgsfield/' + 엔드포인트 경로)
  //   모델마다 크레딧 소모량이 다르지만 공표된 정액 단가가 없다: 금액은 요청 파라미터와 계정
  //   플랜이 정하고 벤더 문서가 "계정 견적이 authoritative" 라고 못 박는다. 그래서 과금 근거가
  //   같은 이 모델들은 카드 하나를 공유한다(모델별로 같은 문구를 복제하지 않는다)
  //   목록이 늘면 여기 한 줄만 더한다(커버리지 게이트가 빠짐을 잡는다)
  'higgsfield/kling-video/v2.1/master/text-to-video': HIGGSFIELD_VIDEO_CARD,
  'higgsfield/kling-video/v2.5-turbo/pro/text-to-video': HIGGSFIELD_VIDEO_CARD,
  'higgsfield/kling-video/v3.0/std/text-to-video': HIGGSFIELD_VIDEO_CARD,
  'higgsfield/bytedance/seedance-2.0/text-to-video': HIGGSFIELD_VIDEO_CARD,
  'higgsfield/veo3.1/text-to-video': HIGGSFIELD_VIDEO_CARD,
  // Gemini API 로 직접 부르는 Veo(카탈로그 key = 'gemini/' + 모델 id). 위 Higgsfield 경유와
  //   같은 모델이 여기 또 있는 것이 정상이다: 경로가 다르면 과금 계정과 단가가 다르다. 이쪽은
  //   조직의 Google 계정에 초당 정액으로 붙고 금액이 공표돼 있어 카드를 공유하지 않음
  'gemini/veo-3.1-generate-preview': {
    billing: 'org-key',
    versions: [
      {
        id: 'gemini-veo31-2026-09',
        effectiveFrom: '2026-01-01',
        verifiedOn: '2026-09-02',
        rates: [
          // 720p 와 1080p 가 같은 단가(4k 만 $0.60/초). 이 도구는 720p 로만 요청
          { unit: BillingUnit.OutputVideoSecond, microUsdPerUnit: 400_000, displayPer: 1, label: '영상 생성', basis: 'published' },
        ],
      },
    ],
    note: '출력 길이(초)에만 비례합니다. 길이는 4초, 6초, 8초 중 하나로만 만들어지므로 씬 하나는 최소 4초분($1.60)이고 8초면 $3.20 입니다. 오디오(대사, 효과음, 배경음)가 추가 비용 없이 함께 만들어집니다. 무료 등급에서는 사용할 수 없어 조직의 Google 계정이 유료 등급이어야 하며, 안전 필터로 생성이 차단된 요청은 청구되지 않습니다.',
    sourceUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
  },
  'gemini/veo-3.1-fast-generate-preview': {
    billing: 'org-key',
    versions: [
      {
        id: 'gemini-veo31-fast-2026-09',
        effectiveFrom: '2026-01-01',
        verifiedOn: '2026-09-02',
        rates: [
          { unit: BillingUnit.OutputVideoSecond, microUsdPerUnit: 100_000, displayPer: 1, label: '영상 생성', basis: 'published' },
        ],
      },
    ],
    note: '같은 Veo 3.1 의 빠른 등급으로 초당 요금이 표준 등급의 1/4 입니다(8초 $0.80). 길이 선택과 오디오 포함은 표준 등급과 같습니다. 품질이 낮은 대신 빠르고 저렴해, 결과를 먼저 확인하는 데 적합합니다. 무료 등급에서는 사용할 수 없습니다.',
    sourceUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
  },
  'wan2.2-ti2v-5b': freeCard(
    '사내 GPU(ComfyUI)에서 렌더합니다. 외부 과금은 없지만 GPU 대기열에 따라 생성 시간이 길어질 수 있습니다.',
  ),
  // 사용자가 고르는 모델 옵션이 아니라 비주얼 미선택 시의 실효 provider 다(ffmpeg 슬라이드쇼)
  //   원장이 무료 렌더를 'rate-unknown' 이 아니라 '무료' 로 귀속할 수 있게 하는 카드
  slideshow: freeCard('선택한 영상 모델 없이 이미지 슬라이드쇼(ffmpeg)로 만듭니다. 외부 과금이 없습니다.'),

  // 이미지 생성
  'gpt-image-2': {
    billing: 'org-key',
    versions: [
      {
        id: 'openai-gpt-image-2-2026-07',
        effectiveFrom: '2026-01-01',
        verifiedOn: '2026-07-29',
        rates: [
          { unit: BillingUnit.ImageOutputToken, microUsdPerUnit: 30, displayPer: 1_000_000, label: '이미지 출력', basis: 'published' },
          { unit: BillingUnit.ImageInputToken, microUsdPerUnit: 8, displayPer: 1_000_000, label: '이미지 입력', basis: 'published' },
          { unit: BillingUnit.TextInputToken, microUsdPerUnit: 5, displayPer: 1_000_000, label: '텍스트 입력', basis: 'published' },
        ],
      },
    ],
    note: '장당 고정가가 아니라 토큰 과금입니다. 해상도와 품질에 따라 장당 약 $0.005(낮음)에서 $0.17(높음) 수준으로 환산됩니다(참고치이며 실제 청구는 토큰 기준).',
    sourceUrl: 'https://developers.openai.com/api/docs/pricing',
  },
  'flux-schnell': freeCard(
    '사내 GPU(ComfyUI)에서 생성합니다. API 키가 필요 없고 이미지가 조직 밖으로 나가지 않습니다.',
  ),

  // 나레이션(TTS)
  'edge-tts': freeCard('Microsoft Edge 음성 합성을 사용합니다. API 키와 사용료가 없습니다.'),
  // key 를 따옴표로 감싼다: 이 표의 다른 항목과 형태를 맞추고, 커버리지 게이트가 카드 목록을
  //   `'key':` 형태로 읽는다(따옴표를 빼면 카드가 있는데 없다고 실패한다)
  //
  // ElevenLabs 세 모델은 카드를 나눠 둔다(Higgsfield 처럼 하나를 공유하지 않는다). 문자당 단가가
  //   모델마다 갈리고 그 차이가 고를 때의 기준이기 때문이다: Flash 는 문서가 "API 생성 문자당 50%
  //   저렴" 이라고 못박은 등급이라, 그 사실을 한 카드에 묶으면 어느 모델 이야기인지 사라진다.
  'eleven_v3': meteredCard(
    'elevenlabs-v3-2026-08',
    '2026-08-26',
    '나레이션 문자 수로 과금되며 문자당 단가가 구독 플랜마다 달라 정액 단가가 없습니다. 씬 나레이션이 길어지는 만큼 비용이 늘어납니다.',
    'https://elevenlabs.io/pricing',
  ),
  'eleven_multilingual_v2': meteredCard(
    'elevenlabs-multilingual-v2-2026-08',
    '2026-08-25',
    '나레이션 문자 수로 과금되며 문자당 단가가 구독 플랜마다 달라 정액 단가가 없습니다. 씬 나레이션이 길어지는 만큼 비용이 늘어납니다.',
    'https://elevenlabs.io/pricing',
  ),
  'eleven_flash_v2_5': meteredCard(
    'elevenlabs-flash-v2-5-2026-08',
    '2026-08-26',
    '나레이션 문자 수로 과금되며 문자당 단가가 구독 플랜마다 달라 정액 단가가 없습니다. 같은 문자 수를 기준으로 다른 ElevenLabs 모델의 절반 단가입니다.',
    'https://elevenlabs.io/pricing',
  ),
};

/**
 * 별칭 → 정본 key.
 * 벤더가 날짜 접미사 없는 별칭(claude-haiku-4-5)과 전체 id(claude-haiku-4-5-20251001)를 함께
 * 쓰기 때문에, 어느 쪽이 저장돼 있어도 같은 카드를 찾아야 비용이 'rate-unknown' 으로 새지 않음
 *
 * 엔진 배포명(qwen3-14b 등)은 여기 넣지 않는다. language-model 이 응답에 카탈로그 key(=이 표의
 * key 네임스페이스)를 실으므로 환경별 엔진 이름이 이 표에 도달하지 않음
 */
const MODEL_KEY_ALIASES: Record<string, string> = {
  'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
};

/** 모델 key → 단가 카드. 별칭도 해석한다. 없으면 undefined. */
export function findRateCard(modelKey: string): ModelRateCard | undefined {
  return MODEL_RATE_CARDS[modelKey] ?? MODEL_RATE_CARDS[MODEL_KEY_ALIASES[modelKey] ?? ''];
}

/** 그 시점에 유효한 단가 버전. 창이 겹치지 않으므로 최대 하나다. */
export function resolveRateVersion(modelKey: string, at: Date): RateCardVersion | undefined {
  const card = findRateCard(modelKey);
  if (!card) return undefined;
  // UTC 날짜로 비교. 벤더 프로모션 날짜는 벤더 현지 기준이라 경계가 하루 어긋날 수 있음
  // 노출은 한 모델의 하루치 할인분(센트 단위)이라 타임존 기계를 만들 값이 없음
  const day = at.toISOString().slice(0, 10);
  return card.versions.find(
    (v) => day >= v.effectiveFrom && (v.effectiveTo === undefined || day <= v.effectiveTo),
  );
}

/**
 * 단가 1줄을 표시 문자열로: '$5.00 / 1M 토큰'. 표시 로직의 단일 출처
 *
 * 소액은 자릿수를 늘린다: 입력 이미지 단가($0.002/장)를 2자리로 자르면 `$0.00` 이 되어
 * 실제로 돈이 나가는 항목이 무료로 보임. 무료('추가 비용 없음')와 소액은 화면에서 반드시 달라야 함
 */
export function formatUnitRate(rate: UnitRate): string {
  const usd = (rate.microUsdPerUnit * rate.displayPer) / 1_000_000;
  const amount = usd > 0 && usd < 0.01 ? `$${usd.toFixed(3)}` : `$${usd.toFixed(2)}`;
  if (rate.displayPer === 1) {
    // 초와 장 단위는 분모 미사용
    return rate.unit === BillingUnit.OutputVideoSecond ? `${amount} / 초` : `${amount} / 장`;
  }
  const per = rate.displayPer === 1_000_000 ? '1M' : rate.displayPer.toLocaleString('en-US');
  return `${amount} / ${per} 토큰`;
}

/**
 * 단가 기준일: 활성 버전들의 verifiedOn(벤더 가격표와 대조한 날) 최대값에서 파생
 *
 * 손으로 관리하던 PRICING_AS_OF 를 없앤 이유: "단가와 기준일을 함께 고쳐야 한다" 는 규칙은
 * 반드시 한쪽을 잊는다. verifiedOn 이 필수 필드라 새 카드를 넣으면서 잊을 수 없음
 * effectiveFrom(벤더 시행일)이 아니라 verifiedOn 을 쓰는 이유는 그 필드 주석 참고
 */
export function pricingAsOf(at: Date = new Date()): string {
  const days = Object.keys(MODEL_RATE_CARDS)
    .map((key) => resolveRateVersion(key, at)?.verifiedOn)
    .filter((d): d is string => typeof d === 'string');
  if (days.length === 0) return '';
  const latest = days.sort().at(-1) as string;
  const [year, month] = latest.split('-');
  return `${year}년 ${Number(month)}월`;
}
