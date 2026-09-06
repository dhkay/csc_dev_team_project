import { DepartmentActor } from './department-management.port';
import { AiToolDistributionMatrix } from '../outbound/ai-tool-distribution-repository.port';

/**
 * AI도구 배포 Inbound Port: 슈퍼관리자(조직 ROOT)가 조직 보유(인가받은) AI도구를 팀(부서)/멤버에 부여(조직 내부 결정)
 * 테넌트 격리, ROOT 강제, 대상 검증은 서비스가 강제
 */
export interface AiToolDistributionPort {
  /** 조직 범위 배포 현황(편집 UI 용: 보유 도구, 팀/멤버 부여) */
  getDistribution(actor: DepartmentActor): Promise<AiToolDistributionMatrix>;
  /** 팀(부서) AI도구를 desired key 집합으로 설정(부서는 actor 조직 소속) */
  setDepartmentAiTools(
    actor: DepartmentActor,
    departmentId: number,
    aiToolKeys: string[],
  ): Promise<void>;
  /** 멤버(일반관리자) 직접 AI도구를 desired key 집합으로 설정(같은 조직 ADMIN) */
  setMemberAiTools(actor: DepartmentActor, memberId: number, aiToolKeys: string[]): Promise<void>;
}

export const AI_TOOL_DISTRIBUTION_PORT = Symbol('AI_TOOL_DISTRIBUTION_PORT');
