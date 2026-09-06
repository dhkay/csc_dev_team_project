import { OrgPosition, PermissionKey } from '../../domain/types/entitlement-catalog';
import { PrincipalType, UserRole } from '../../domain/types/user.types';
import { OrgCallerActor } from '../ports/inbound/org-caller';

/**
 * 루트 권한자 판정: 조직 ROOT 또는 대표(직책 position=REPRESENTATIVE). 대표는 사실상 ROOT 와
 * 동등한 권한을 행사한다(조직 관리 전권 + ROOT 전용 부여 우회). 인가 판정의 단일 출처(드리프트 방지)
 * (대표는 권한이 아닌 직책으로 이전됨. 토큰 클레임 position 을 읽는다.)
 */
export function hasRootAuthority(actor: OrgCallerActor): boolean {
  return actor.role === UserRole.ROOT || actor.position === OrgPosition.Representative;
}

/**
 * 조직 관리(조직도/사용자/권한/AI도구) 호출 주체의 인가 정책: 4개 관리 서비스 공용
 * 기존엔 ROOT 전용이었으나, 루트 권한자(ROOT/대표) 와 시스템관리(system-management) 권한 보유자가
 * 관리할 수 있게 확장한다.
 *
 * 조직 관리 가능 여부 판정: 같은 조직 조직유저 + (루트 권한자 또는 시스템관리 권한 보유)
 * 통과 시 조직 id, 아니면 null(호출 서비스가 자기 도메인 에러로 변환)
 */
export function resolveOrgManagementOrgId(actor: OrgCallerActor): number | null {
  if (actor.principalType !== PrincipalType.ORGANIZATION_USER || actor.organizationId == null) {
    return null;
  }
  const allowed =
    hasRootAuthority(actor) ||
    (actor.permissions?.includes(PermissionKey.SystemManagement) ?? false);
  return allowed ? actor.organizationId : null;
}
