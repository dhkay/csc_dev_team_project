// AI도구 배포 도메인 타입: SSOT 는 공유 커널 @csc/entitlements.
// 조직 보유(플랫폼 인가) 도구를 조직이 팀(부서)/개인에 부여. 팀 부여는 하위 소속 조직원이 상속
export { AiToolKey, AI_TOOL_LABELS, ALL_AI_TOOL_KEYS } from '@csc/entitlements';
import type { AiToolKey } from '@csc/entitlements';

/** 조직 AI도구 배포 현황: user 서버 /user-api/org/ai-tools/distribution 응답과 동형 */
export interface AiToolDistributionMatrix {
  // 조직이 플랫폼에서 부여받은(availability) 도구
  tools: { key: AiToolKey; name: string }[];
  // 팀(부서)별 직접 부여된 도구 key.
  departmentGrants: { departmentId: number; aiToolKeys: AiToolKey[] }[];
  // 멤버별 직접 부여된 도구 key.
  memberGrants: { userId: number; aiToolKeys: AiToolKey[] }[];
}
