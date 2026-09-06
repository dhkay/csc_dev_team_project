import { OrgPosition } from '../../../domain/types/entitlement-catalog';
import { DepartmentActor } from './department-management.port';

/**
 * 직책 부여 관리 Inbound Port: 조직 관리자가 멤버(ADMIN)에 직책(대표/팀장)을 임명/해임
 * 직책은 권한/AI도구와 분리된 별도 차원(유저당 하나: 대표↔팀장 상호배제는 단일 컬럼으로 보장)
 * 인가(대표=ROOT 역할만 / 팀장=조직 관리자), 테넌트 격리, 부서당 1명, 부서 필수는 서비스가 강제한다.
 */
export interface PositionManagementPort {
  /**
   * 멤버 직책을 설정(REPRESENTATIVE | TEAM_LEADER | null=해제). 같은 조직 ADMIN 만 대상
   * 단일 컬럼이라 이전 직책은 자동 대체(상호배제). 대표 임명/해임은 ROOT(개발관리자)만
   * 팀장은 대상이 부서에 배치돼 있어야 하며, 그 부서에 다른 팀장이 없어야 한다.
   */
  setMemberPosition(
    actor: DepartmentActor,
    memberId: number,
    position: OrgPosition | null,
  ): Promise<void>;
}

export const POSITION_MANAGEMENT_PORT = Symbol('POSITION_MANAGEMENT_PORT');
