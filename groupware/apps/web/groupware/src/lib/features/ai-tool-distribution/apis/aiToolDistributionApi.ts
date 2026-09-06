// AI도구 배포 데이터 접근(브라우저): 타입 계약(aiToolDistributionContract) 기반 bff() 로 BFF 호출
// 쓰기(팀/멤버 부여)만 여기서. 현황(매트릭스)은 SSR(+page.server.ts)에서 authUserClient 로
import { bff } from '$lib/infrastructure/http/bffClient';
import { aiToolDistributionContract } from '../aiToolDistributionContract';
import type { AiToolKey } from '../types';

export type AiToolResult =
  | { success: true }
  | { success: false; errorCode?: string; error?: string };

/** 팀(부서) AI도구 설정(desired key 전체 집합) */
export function setDepartmentAiTools(
  departmentId: number,
  aiToolKeys: AiToolKey[],
): Promise<AiToolResult> {
  return bff(aiToolDistributionContract.set, { action: 'department', id: departmentId, aiToolKeys });
}

/** 멤버(일반관리자) 직접 AI도구 설정(desired key 전체 집합) */
export function setMemberAiTools(memberId: number, aiToolKeys: AiToolKey[]): Promise<AiToolResult> {
  return bff(aiToolDistributionContract.set, { action: 'member', id: memberId, aiToolKeys });
}
