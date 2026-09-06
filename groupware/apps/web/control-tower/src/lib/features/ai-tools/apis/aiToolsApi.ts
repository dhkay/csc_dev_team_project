// AI 도구 카탈로그 데이터 접근 (브라우저): 타입 계약(aiToolsContract) 기반 bff() 로 BFF 호출
// BFF 는 실패 시 실제 상태코드(409/400/404…)를 반환하므로, 컴포넌트가 쓰던 봉투로 정규화한다.
// (SLUG_TAKEN 등 인라인 처리 보존). 목록 조회는 SSR(+page.server.ts 의 authControlClient)에서 직접
import { bff } from '$lib/infrastructure/http/bffClient';
import type { ApiResult } from '$lib/infrastructure/http/apiResult';
import { aiToolsContract } from '../aiToolsContract';
import type { AiToolCatalogItem, UpdateAiToolInput } from '../types';

/** 컴포넌트 소비용 결과 봉투 */
export type AiToolResult<T = unknown> = ApiResult<T>;

export function updateAiTool(
  key: string,
  patch: UpdateAiToolInput,
): Promise<AiToolResult<AiToolCatalogItem>> {
  return bff(aiToolsContract.update, patch, { key });
}
