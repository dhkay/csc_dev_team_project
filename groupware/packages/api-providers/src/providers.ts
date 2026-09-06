/**
 * 조직이 등록하는 외부 API 프로바이더 카탈로그(SSOT)
 *
 * 소비자 셋이 같은 표를 쓰게 하는 것이 존재 이유다. web-groupware 는 등록 화면을 그리고,
 * csc-groupware 는 저장을 받을 provider 를 판정하고, 도구 카탈로그는 모델이 요구하는 키를
 * `ApiProviderKey` 로 지시한다.
 *
 * 표를 따로 들면 반드시 어긋나고 그 어긋남이 조용하다. 오타 난 provider 는 저장은 되지만 어느
 * 모델도 그 키를 찾지 못해 영원히 미등록 취급이 되고 아무 에러도 나지 않는다.
 *
 * 새 프로바이더 추가 = `API_PROVIDER_KEYS` 에 key 하나 + `API_PROVIDER_CATALOG` 에 한 줄.
 */

/**
 * 프로바이더의 성격. 등록하는 사람이 알아야 하는 차이라 표시까지 갈림
 *  - VENDOR: 모델을 만든 회사가 직접 파는 키. 그 회사 모델만 개방
 *  - PLATFORM: 여러 회사 모델을 자기 API 하나로 중계하는 플랫폼의 키. 키 하나로 여러 회사
 *    모델이 열리고 과금은 그 플랫폼 계정에서 발생
 */
export type ApiProviderKind = 'VENDOR' | 'PLATFORM';

/** 표시 순서를 겸한 구분 목록. 등록 화면의 섹션 순서가 이 배열 */
export const API_PROVIDER_KINDS = ['VENDOR', 'PLATFORM'] as const satisfies readonly ApiProviderKind[];

/** 구분별 표시 메타. 화면 문구를 여기 모아 두 앱이 같은 말을 하게 함 */
export const API_PROVIDER_KIND_META: Record<
  ApiProviderKind,
  { label: string; description: string }
> = {
  VENDOR: {
    label: 'AI 회사',
    description: '모델을 만든 회사에서 직접 발급받은 키다. 그 회사 모델만 사용할 수 있다.',
  },
  PLATFORM: {
    label: '플랫폼',
    description:
      '여러 회사 모델을 한 API 로 중계하는 플랫폼 키다. 키 하나로 그 플랫폼이 제공하는 모델을 쓰고, 사용료는 플랫폼 계정으로 청구된다.',
  },
};

/**
 * 프로바이더 식별자 전체. DB `organization_api_credentials.provider` 에 그대로 저장되고,
 * 저장 DTO 의 허용 목록(`@IsIn`)으로도 사용
 *
 * key 는 안정적이다. 이미 등록된 조직 자격증명 행이 이 문자열로 붙어 있어, 개명하면 그 조직의
 * 키가 아무도 찾지 못하는 행이 됨. 개명이 꼭 필요하면 데이터 이전을 함께
 */
export const API_PROVIDER_KEYS = [
  'ANTHROPIC',
  'OPENAI',
  'XAI',
  'GEMINI',
  'ELEVENLABS',
  'HIGGSFIELD',
  'CURSOR',
] as const;

export type ApiProviderKey = (typeof API_PROVIDER_KEYS)[number];

/**
 * 프로바이더를 쓰는 데 필요한 입력 필드. 필수 필드가 하나라도 비면 그 조직은 이 프로바이더를
 * 못 쓰는 것으로 본다(`hasRequiredCredentials`). 선택 필드는 그 판정에 들지 않는다.
 *
 * 시크릿이 기본이지만 전부는 아니다. 벤더가 요구하는 값 중에는 비밀이 아닌 것도 있고(음성 id),
 * 그런 값은 저장한 뒤 무엇이 등록됐는지 보여야 한다. 안 보여 주면 확인할 방법이 재입력밖에
 * 없다. 그래서 비시크릿 필드는 값이 뷰 응답에 함께 실린다(`ApiCredentialView.publicValues`)
 *
 * 한도(분당 요청 상한) 같은 값이 키와 같은 자리에 있는 이유: 벤더가 한도를 재는 단위가 그 키의
 * 프로젝트라, 한도는 벤더의 속성이 아니라 이 조직 키의 속성이다. 전역 설정으로 두면 티어가 높은
 * 조직이 낮은 조직의 값으로 느리게 돈다.
 */
export interface CredentialFieldSpec {
  // 백엔드 credentials 맵의 key. 벤더의 헤더 이름이 아니라 우리 저장 키다.
  key: string;
  label: string;
  placeholder?: string;
  // 값을 서버 밖으로 되돌려주지 않는가. 미지정 = true(시크릿)
  //
  // false 면 저장된 값이 뷰에 실려 입력칸에 그대로 보이고, 다른 필드만 바꿔 저장해도 이 값은
  // 유지됨. 비밀이 아닌 값을 시크릿으로 두면 키를 교체할 때마다 함께 다시 입력해야 함
  secret?: boolean;
  // 비워도 저장되는가. 미지정 = false(필수). 선택 필드는 등록 완료 판정과 저장 버튼 조건에서 빠진다
  optional?: boolean;
  // 값의 형태. 미지정 = 'text'. 'number' 는 양수만 받고 입력칸도 숫자로 그린다
  kind?: 'text' | 'number';
  // 입력칸 아래 한 줄 안내. 값을 어디서 가져오는지가 라벨만으로 분명하지 않을 때 기재
  hint?: string;
}

/** 등록 완료 판정에 드는 필드(선택 필드 제외). 화면의 저장 조건과 서버의 필수 검사가 같은 목록을 본다 */
export function requiredCredentialFields(meta: ApiProviderMeta): readonly CredentialFieldSpec[] {
  return meta.credentialFields.filter((f) => !f.optional);
}

/** 프로바이더 메타: 카탈로그 1행 */
export interface ApiProviderMeta {
  key: ApiProviderKey;
  kind: ApiProviderKind;
  // 표시 이름
  label: string;
  // 한 줄 설명(무엇에 쓰는 키인지)
  description: string;
  // 발급/관리 콘솔 링크. 확인된 주소가 없으면 넣지 않는다(404 링크는 없느니만 못하다)
  docsUrl?: string;
  credentialFields: readonly CredentialFieldSpec[];
  // 저장 시 무엇까지 확인하는가
  //  - live: 발급처에 실호출해 키가 실제로 유효한지 확인
  //  - format: 확인용 호출 경로가 정해지지 않아 필수 필드가 찼는지만 확인
  //
  // 화면 문구가 여기서 갈린다. 확인하지 않은 키를 "검증되었습니다" 라고 말하면, 등록한 사람은
  // 생성이 실패할 때까지 키가 맞다고 믿게 됨
  //
  // 백엔드 프로브 표와 짝이다(프로브가 있으면 live, 없으면 format). 그 일치는 csc-groupware
  // 테스트가 보장
  verification: 'live' | 'format';
}

/** API 키 한 개짜리 프로바이더의 공통 필드(대부분이 이 형태다) */
const apiKeyOnly = (placeholder?: string): readonly CredentialFieldSpec[] => [
  { key: 'apiKey', label: 'API 키', ...(placeholder ? { placeholder } : {}) },
];

/**
 * 영상 생성 벤더의 분당 제출 상한(선택). 비우면 렌더 서버 기본값으로 보낸다.
 * 렌더 워커는 이 값으로 같은 키의 제출 간격을 벌리고, 그래도 429 를 받으면 기다렸다 다시 보낸다.
 * 값의 출처는 벤더 콘솔이라 힌트가 벤더마다 다르다.
 */
const submitsPerMinute = (hint: string): CredentialFieldSpec => ({
  key: 'submitsPerMinute',
  label: '분당 영상 생성 요청 상한',
  placeholder: '예: 4',
  secret: false,
  optional: true,
  kind: 'number',
  hint,
});

/**
 * 프로바이더 카탈로그. 등록 화면의 표시 순서가 이 배열 순서다(구분별로 다시 묶인다)
 *
 * 플랫폼 둘(Higgsfield, Cursor)은 자격증명 필드 이름과 확인용 엔드포인트가 공식 문서로
 * 확정되기 전이라 `verification: 'format'` 으로 시작한다. 확정되면 이 행의 필드를 맞추고
 * verification 을 'live' 로 바꾼 뒤 백엔드 프로브 표에 한 줄을 넣는다. 그 전에 그럴듯한 URL 을
 * 넣어 두지 않음. 틀린 주소로 검증하면 유효한 키가 거부됨
 */
export const API_PROVIDER_CATALOG: readonly ApiProviderMeta[] = [
  {
    key: 'ANTHROPIC',
    kind: 'VENDOR',
    label: 'Claude API',
    description: 'Anthropic Claude 모델을 호출하는 조직 공용 API 키.',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    credentialFields: apiKeyOnly('sk-ant-...'),
    verification: 'live',
  },
  {
    key: 'OPENAI',
    kind: 'VENDOR',
    label: 'OpenAI API',
    description: 'OpenAI(GPT) 모델을 호출하는 조직 공용 API 키.',
    docsUrl: 'https://platform.openai.com/api-keys',
    credentialFields: apiKeyOnly('sk-...'),
    verification: 'live',
  },
  {
    key: 'XAI',
    kind: 'VENDOR',
    label: 'Grok API',
    description: 'xAI Grok 모델을 호출하는 조직 공용 API 키.',
    docsUrl: 'https://console.x.ai/',
    credentialFields: [
      ...apiKeyOnly('xai-...'),
      submitsPerMinute(
        'xAI 콘솔의 분당 요청 한도입니다. 비우면 간격 조절 없이 보내고, 한도에 걸리면 자동으로 기다렸다 다시 보냅니다.',
      ),
    ],
    verification: 'live',
  },
  {
    key: 'GEMINI',
    kind: 'VENDOR',
    label: 'Gemini API',
    description: 'Google Gemini 모델을 호출하는 조직 공용 API 키.',
    docsUrl: 'https://aistudio.google.com/apikey',
    // 접두사를 placeholder 로 못 박지 않는다. 발급 시기에 따라 형태가 갈리고(구 'AIza...',
    // 신 'AQ....'), 한쪽만 적어 두면 다른 형태를 받은 사람이 제 키를 의심하게 됨
    credentialFields: [
      {
        key: 'apiKey',
        label: 'API 키',
        hint: 'Google AI Studio 에서 발급한 키입니다. 발급 시기에 따라 AIza 또는 AQ 로 시작합니다.',
      },
      // Veo 의 한도는 문서에 없고 이 키의 프로젝트 대시보드에만 보인다. 그래서 등록하는 사람이 적는다.
      submitsPerMinute(
        'AI Studio 의 rate-limit 페이지에서 Veo 모델의 RPM 값을 적습니다. 비우면 서버 기본값(분당 4회)으로 보내고, 한도에 걸리면 자동으로 기다렸다 다시 보냅니다.',
      ),
    ],
    verification: 'live',
  },
  {
    key: 'ELEVENLABS',
    kind: 'VENDOR',
    label: 'ElevenLabs',
    description: 'ElevenLabs 음성 합성(TTS) 모델을 호출하는 조직 공용 API 키와 나레이션 음성.',
    docsUrl: 'https://elevenlabs.io/app/developers/api-keys',
    // 음성이 키와 같은 자리에 있는 이유: ElevenLabs 는 음성을 요청 경로로 받으므로
    //   (POST /v1/text-to-speech/{voice_id}) 키만으로는 한 번도 호출할 수 없다. 즉 이 값은
    //   "무엇으로 만들까" 가 아니라 "이 조직이 이 벤더를 쓸 수 있는가" 쪽이고, 그래서 등록
    //   완료 판정(hasRequiredCredentials)에 함께 포함
    //   그리고 음성 목록은 이 키를 가진 사람만 볼 수 있다. 도구 화면에서 개인이 고르게 하면
    //   값을 구할 방법이 없는 사람 앞에 필수 입력을 놓는 셈이 됨
    credentialFields: [
      { key: 'apiKey', label: 'API 키', placeholder: 'sk_...' },
      {
        key: 'voiceId',
        label: '나레이션 음성 ID',
        placeholder: 'JBFqnCBsd6RMkjVDRZzb',
        secret: false,
        hint: 'ElevenLabs 계정의 음성 목록(elevenlabs.io/app/voice-library)에서 음성 ID 를 복사합니다. 안정성과 속도 같은 세부 설정은 그 음성에 저장된 값을 따릅니다.',
      },
    ],
    verification: 'live',
  },
  {
    key: 'HIGGSFIELD',
    kind: 'PLATFORM',
    label: 'Higgsfield',
    description: '여러 회사의 영상/이미지 생성 모델을 중계하는 플랫폼 키.',
    // 키와 시크릿 두 값을 요구한다. 두 값의 정확한 이름과 전달 방식은 공식 문서 확인 대상이며,
    // 저장 키(apiKey/apiSecret)는 이 맵의 이름이라 헤더 이름이 무엇이든 프로브에서 맞추면 끝
    credentialFields: [
      { key: 'apiKey', label: 'API 키' },
      { key: 'apiSecret', label: 'API 시크릿' },
      submitsPerMinute(
        'Higgsfield 계정의 분당 요청 한도입니다. 비우면 간격 조절 없이 보내고, 한도에 걸리면 자동으로 기다렸다 다시 보냅니다.',
      ),
    ],
    verification: 'format',
  },
  {
    key: 'CURSOR',
    kind: 'PLATFORM',
    label: 'Cursor',
    description: 'Cursor 플랫폼이 제공하는 API 키.',
    credentialFields: apiKeyOnly(),
    verification: 'format',
  },
];

/** 저장된 provider 문자열 → 카탈로그 행. 카탈로그에 없으면 undefined(내린 구 프로바이더 등) */
export function findApiProvider(key: string): ApiProviderMeta | undefined {
  return API_PROVIDER_CATALOG.find((m) => m.key === key);
}

/** 그 구분의 프로바이더(카탈로그 순서 유지). 등록 화면의 섹션 하나가 이 목록 */
export function apiProvidersByKind(kind: ApiProviderKind): readonly ApiProviderMeta[] {
  return API_PROVIDER_CATALOG.filter((m) => m.kind === kind);
}

/** 카탈로그에 있는 provider 인가. 저장 요청을 받을지 정하는 판정 */
export function isApiProviderKey(value: string): value is ApiProviderKey {
  return (API_PROVIDER_KEYS as readonly string[]).includes(value);
}

/**
 * 필수 자격증명 필드가 모두 설정됐는가(= 등록 완료). 선택 필드(한도 등)는 보지 않는다.
 *
 * 프론트의 "등록됨" 배지와 백엔드 `listConfiguredProviders`(모델 게이팅)가 같은 규칙을 써야 함
 * "필드가 하나라도 있으면 등록됨" 으로 두면 필드가 둘인 플랫폼에서 한쪽만 채워진 키가 사용 가능으로 보인다.
 */
export function hasRequiredCredentials(
  meta: ApiProviderMeta,
  configuredFields: readonly string[],
): boolean {
  return requiredCredentialFields(meta).every((f) => configuredFields.includes(f.key));
}
