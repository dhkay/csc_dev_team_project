// 공용 API 자격증명 데이터 접근(브라우저): BFF(/api/api-credentials) frontClient 호출
// org 는 BFF 가 세션에서 주입하므로 클라이언트는 provider/credentials 만 보낸다.
import { frontClient } from '$lib/infrastructure/http/clientInstances';
import { run, type ApiResult } from './result';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import type { ApiCredentialView } from '../types';

const BASE = ROUTES.API_CREDENTIALS;

export function listApiCredentials(): Promise<ApiResult<ApiCredentialView[]>> {
  return run<ApiCredentialView[]>(() => frontClient().GET(BASE));
}

/**
 * 논-시크릿: 조직에 등록된 프로바이더 key 목록(값/필드명 없음)
 * 루트 전용인 목록과 달리 org-member 도 조회 가능(마케팅 AI 모델 게이팅용)
 */
export function listConfiguredProviders(): Promise<ApiResult<string[]>> {
  return run<string[]>(() => frontClient().GET(`${BASE}/configured`));
}

/** 등록/교체: 저장 시 백엔드가 실검증(예: Claude 키 유효성) 후 암호화 저장 */
export function saveApiCredential(
  provider: string,
  credentials: Record<string, string>
): Promise<ApiResult<ApiCredentialView>> {
  return run<ApiCredentialView>(() => frontClient().POST(BASE, { provider, credentials }));
}

/** 등록 해제 */
export function deleteApiCredential(provider: string): Promise<ApiResult<null>> {
  return run<null>(() => frontClient().DELETE(BASE, { provider }));
}
