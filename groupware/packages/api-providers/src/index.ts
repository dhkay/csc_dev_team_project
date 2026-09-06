/**
 * `@csc/api-providers`: 조직 외부 API 프로바이더 카탈로그 공유 커널(런타임 의존성 0)
 *
 * 여기 두는 것은 어떤 키를 등록할 수 있는가다. 프로바이더 식별자, 성격 구분, 자격증명 입력 필드,
 * 등록 완료 판정. 프론트가 등록 화면을 그리고 백엔드가 같은 표로 저장을 판정해야 하는 값들이다.
 *
 * 여기 두지 않는 것:
 *  - 검증 프로브(호출 URL/헤더) → csc-groupware `api-key-validator.adapter.ts`
 *  - 그 키로 열리는 모델 목록 → 도구별 모델 카탈로그(예: `aiModelOptions.ts`)
 *  - 벤더 단가 → `@csc/pricing`
 *  - 조직이 무엇에 접근하는가 → `@csc/entitlements`
 *
 * language-model(Python)의 `credential_provider` 는 언어가 달라 이 표를 공유할 수 없다. 문자열만
 * 맞추며 어긋남은 `scripts/check-api-provider-keys.mjs` 가 잡는다.
 */

export {
  API_PROVIDER_CATALOG,
  API_PROVIDER_KEYS,
  API_PROVIDER_KIND_META,
  API_PROVIDER_KINDS,
  apiProvidersByKind,
  findApiProvider,
  hasRequiredCredentials,
  isApiProviderKey,
  requiredCredentialFields,
} from './providers';
export type {
  ApiProviderKey,
  ApiProviderKind,
  ApiProviderMeta,
  CredentialFieldSpec,
} from './providers';
