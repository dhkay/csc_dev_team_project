/** 조직 AI도구 배포 현황: 조직 보유 도구 + 팀/멤버 직접 부여(상속 미포함). 편집 UI 용 */
export interface AiToolDistributionMatrix {
  // 조직이 플랫폼에서 부여받은(availability) AI도구
  tools: { key: string; name: string }[];
  // 팀(부서)별 직접 부여된 AI도구 key.
  departmentGrants: { departmentId: number; aiToolKeys: string[] }[];
  // 멤버별 직접 부여된 AI도구 key.
  memberGrants: { userId: number; aiToolKeys: string[] }[];
}

/**
 * AI도구 배포 아웃바운드 포트 (userdb): 조직 보유(인가받은) 도구를 팀/멤버에 부여(조직 내부 결정)
 * 모든 부여는 조직 보유 범위(organization_ai_tools) 안에서만(2단계 불변식, FK 로 강제)
 * set* 은 desired key 집합 멱등 reconcile(setOrganizationAiToolsRecord 패턴)
 */
export interface AiToolDistributionRepositoryPort {
  /** 조직 범위 배포 현황(보유 도구 + 팀/멤버 부여) */
  findDistributionByOrganizationId(organizationId: number): Promise<AiToolDistributionMatrix>;
  /** 팀(부서) AI도구를 desired key 집합으로 동기화(조직 보유 도구만 반영) */
  setDepartmentAiToolsRecord(
    organizationId: number,
    departmentId: number,
    aiToolKeys: string[],
    grantedBy: number,
  ): Promise<void>;
  /** 멤버 직접 AI도구를 desired key 집합으로 동기화 */
  setUserAiToolsRecord(
    organizationId: number,
    userId: number,
    aiToolKeys: string[],
    assignedBy: number,
  ): Promise<void>;
}

export const AI_TOOL_DISTRIBUTION_REPOSITORY_PORT = Symbol('AI_TOOL_DISTRIBUTION_REPOSITORY_PORT');
