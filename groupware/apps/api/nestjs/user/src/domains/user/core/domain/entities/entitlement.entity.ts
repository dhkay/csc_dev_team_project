import { AiToolKey, FeatureKey, PermissionKey } from '../types/entitlement-catalog';

/**
 * 유효 엔타이틀먼트: 한 조직유저가 실제 접근 가능한 기능/AI도구/권한 key 목록
 * 기능 = 조직 grant ∩ (applies_to_all OR 유저 토글). AI도구 = 조직 grant(사용 인가) ∩ (팀/유저 부여). 설계: .claude/rules/multi-tenancy.md
 * 권한 = 멤버 부서 조상 체인의 부서 부여 ∪ 멤버 직접 부여
 */
export interface EffectiveEntitlements {
  // 접근 가능한 기능 key (features.key)
  features: FeatureKey[];
  // 접근 가능한 AI도구 key (ai_tools.key)
  aiTools: AiToolKey[];
  // 보유 권한 key (permissions.key)
  permissions: PermissionKey[];
}
