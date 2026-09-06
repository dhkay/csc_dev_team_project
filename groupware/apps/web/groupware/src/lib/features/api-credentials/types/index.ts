// 조직 공용 외부 API 자격증명: 프로바이더 카탈로그와 뷰 타입
//
// 카탈로그(프로바이더 식별자, 구분, 입력 필드, 라벨)의 SSOT 는 공유 커널 `@csc/api-providers` 다.
// 등록 화면을 그리는 이 앱과 저장을 판정하는 csc-groupware 가 같은 표를 봐야 하기 때문이다.
// 이 파일은 얇은 재노출이고 이 앱이 실제로 쓰는 것만 담는다. 새 프로바이더는 그 패키지에 한 줄 추가한다.
//
// 자격증명 값은 write-only 다. 뷰 응답엔 값 없이 configuredFields(설정된 필드 키)만 온다.

export {
  API_PROVIDER_CATALOG,
  API_PROVIDER_KIND_META,
  API_PROVIDER_KINDS,
  apiProvidersByKind,
  findApiProvider,
  hasRequiredCredentials,
  isApiProviderKey,
  requiredCredentialFields
} from '@csc/api-providers';
export type {
  ApiProviderKey,
  ApiProviderKind,
  ApiProviderMeta,
  CredentialFieldSpec
} from '@csc/api-providers';

/**
 * 조직별 자격증명 뷰(백엔드 HTTP 응답): 값 없이 설정 상태만
 * 카탈로그와 달리 이것은 응답 형태라 공유 커널이 아니라 여기 둔다.
 */
export interface ApiCredentialView {
  provider: string;
  // 설정된 자격증명 필드 key 목록(예: ['apiKey']). 비어 있으면 미등록
  configuredFields: string[];
  // 비밀이 아닌 필드(`CredentialFieldSpec.secret === false`)의 값. 시크릿은 담기지 않는다.
  // 화면이 이 값을 입력칸에 채워, 다른 필드만 바꿔 저장해도 그대로 유지되게 한다.
  publicValues: Record<string, string>;
  enabled: boolean;
  // 마지막 저장 시각(ISO). 미등록이면 null.
  updatedAt: string | null;
}
