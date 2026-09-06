/** 자격증명 실검증 결과 */
export interface ApiKeyValidationResult {
  valid: boolean;
  // 실패 사유(사용자 노출용). valid=true 면 생략
  message?: string;
}

/**
 * 프로바이더별 자격증명 실검증 아웃바운드 포트
 * 예: Claude API 키를 Anthropic 에 실호출해 유효성 확인. 검증 대상이 아닌 프로바이더는 valid:true.
 */
export interface ApiKeyValidatorPort {
  validate(
    provider: string,
    credentials: Record<string, string>,
  ): Promise<ApiKeyValidationResult>;
}

export const API_KEY_VALIDATOR_PORT = Symbol('API_KEY_VALIDATOR_PORT');
