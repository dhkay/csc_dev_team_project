import { EffectiveEntitlements } from '../../../domain/entities/entitlement.entity';

/**
 * 엔타이틀먼트 아웃바운드 포트: 조직유저의 유효 접근권(기능/AI도구 key)을 계산한다.
 * 기능 유효 = 조직 grant ∩ (applies_to_all OR 유저 토글). AI도구 유효 = 조직 grant(사용 인가) ∩ (팀/유저 부여)
 * 로그인/리프레시 시 토큰에 실린다.
 */
export interface EntitlementRepositoryPort {
  /**
   * 조직유저(organization_users)의 유효 엔타이틀먼트를 resolve.
   * `hasRootAuthority=true`(루트 권한자 = ROOT ∨ 대표)면 AI도구는 접근 필터 없이
   * 조직 보유 도구 전부를 부여한다. 대표 판정은 호출부(auth)가 직책(position)으로 계산해 넘긴다.
   */
  resolveEffectiveForUser(
    organizationId: number,
    userId: number,
    hasRootAuthority: boolean,
  ): Promise<EffectiveEntitlements>;
}

export const ENTITLEMENT_REPOSITORY_PORT = Symbol('ENTITLEMENT_REPOSITORY_PORT');
