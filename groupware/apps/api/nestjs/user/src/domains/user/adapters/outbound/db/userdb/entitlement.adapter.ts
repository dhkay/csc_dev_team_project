import { Injectable } from '@nestjs/common';
import { SQL, and, eq, or, exists, inArray, sql } from 'drizzle-orm';
import {
  userDb,
  features,
  aiTools,
  permissions,
  departments,
  organizationUsers,
  organizationFeatures,
  organizationAiTools,
  organizationUserFeatures,
  organizationUserAiTools,
  departmentAiTools,
  departmentPermissions,
  organizationUserPermissions,
} from '@csc/database/userdb';
import { EffectiveEntitlements } from '../../../../core/domain/entities/entitlement.entity';
import {
  PermissionKey,
  ProvisioningMode,
  toAiToolKeys,
  toFeatureKeys,
  toPermissionKeys,
} from '../../../../core/domain/types/entitlement-catalog';
import { EntitlementRepositoryPort } from '../../../../core/application/ports/outbound/entitlement-repository.port';

/**
 * 엔타이틀먼트 리포지토리 (userdb): 조직유저의 유효 접근권(기능/AI도구/권한 key) 계산
 * 기능 = 조직 grant 존재 AND (applies_to_all OR 유저 토글) AND is_active.
 * AI도구 = 조직 grant(사용 인가) 존재 AND (팀(부서 조상 체인) 부여 OR 유저 부여) AND is_active. (ROOT/대표는 조직 보유 전부: 우회)
 * 권한 = 멤버 부서 조상 체인의 부서 부여 ∪ 멤버 직접 부여, ∩ is_active.
 * 계약/설계: .claude/rules/multi-tenancy.md
 */
@Injectable()
export class EntitlementRepositoryAdapter implements EntitlementRepositoryPort {
  async resolveEffectiveForUser(
    organizationId: number,
    userId: number,
    hasRootAuthority: boolean,
  ): Promise<EffectiveEntitlements> {
    // 멤버 부서 조상 체인(자신→루트): AI도구 팀 부여와 권한 부서 부여가 공유
    const chainIds = await this.departmentChainIds(organizationId, userId);

    const permissionKeys = await this.resolvePermissions(userId, chainIds);
    // 루트 권한자(ROOT ∨ 대표)는 조직 보유 AI도구 전부: 대표 판정은 호출부가 직책으로 계산해 넘긴다.
    const aiToolBypass = hasRootAuthority;

    // AI도구 접근 = 팀(부서 체인) 부여 OR 유저 부여: 조직이 내부에서 부여로 결정(플랫폼 할당과 별개, applies_to_all 없음)
    // 루트관리자, 대표는 접근 필터 없이 조직 보유 도구 전부: 아래 where 에서 or(...) 생략
    const aiToolAccess: SQL[] = [
      exists(
        userDb
          .select({ one: sql`1` })
          .from(organizationUserAiTools)
          .where(
            and(
              eq(organizationUserAiTools.userId, userId),
              eq(organizationUserAiTools.aiToolId, organizationAiTools.aiToolId),
            ),
          ),
      ),
    ];
    if (chainIds.length) {
      aiToolAccess.push(
        exists(
          userDb
            .select({ one: sql`1` })
            .from(departmentAiTools)
            .where(
              and(
                inArray(departmentAiTools.departmentId, chainIds),
                eq(departmentAiTools.aiToolId, organizationAiTools.aiToolId),
              ),
            ),
        ),
      );
    }

    const [featureRows, aiToolRows, commonAiToolRows] = await Promise.all([
      userDb
        .select({ key: features.key })
        .from(organizationFeatures)
        .innerJoin(features, eq(features.id, organizationFeatures.featureId))
        .where(
          and(
            eq(organizationFeatures.organizationId, organizationId),
            eq(features.isActive, true),
            or(
              eq(organizationFeatures.appliesToAll, true),
              exists(
                userDb
                  .select({ one: sql`1` })
                  .from(organizationUserFeatures)
                  .where(
                    and(
                      eq(organizationUserFeatures.userId, userId),
                      eq(organizationUserFeatures.featureId, organizationFeatures.featureId),
                    ),
                  ),
              ),
            ),
          ),
        ),
      // 개별 부여(PER_ORG) AI도구: 조직 grant 존재 + (팀/유저 부여 or 루트/대표 우회)
      // COMMON 도구는 grant 행이 없어 이 쿼리엔 잡히지 않는다(아래 별도 쿼리로 합류)
      userDb
        .select({ key: aiTools.key })
        .from(organizationAiTools)
        .innerJoin(aiTools, eq(aiTools.id, organizationAiTools.aiToolId))
        .where(
          and(
            eq(organizationAiTools.organizationId, organizationId),
            eq(aiTools.isActive, true),
            // 루트관리자, 대표는 조직 보유 도구 전부: 그 외엔 접근 필터(팀/유저) 적용
            ...(aiToolBypass ? [] : [or(...aiToolAccess)]),
          ),
        ),
      // 전체 공통(COMMON) AI도구: 부여 무관하게 모든 조직 유저에게 제공. is_active AND provisioning=COMMON.
      userDb
        .select({ key: aiTools.key })
        .from(aiTools)
        .where(and(eq(aiTools.isActive, true), eq(aiTools.provisioning, ProvisioningMode.Common))),
    ]);

    // 코드 카탈로그(SSOT)에 없는 key 는 버린다. 닫힌 집합 보장(인가 경계 방어)
    // AI도구 = 개별 부여(PER_ORG) ∪ 전체 공통(COMMON), 중복 제거
    return {
      features: toFeatureKeys(featureRows.map((r) => r.key)),
      aiTools: toAiToolKeys([
        ...new Set([...aiToolRows, ...commonAiToolRows].map((r) => r.key)),
      ]),
      permissions: permissionKeys,
    };
  }

  /**
   * 멤버 부서 조상 체인(자신→루트) id. 미배치(department_id null)면 빈 배열
   * org 부서 전체를 한 번 읽어 parent_id 로 코드에서 계산(인접리스트 walk)
   */
  private async departmentChainIds(organizationId: number, userId: number): Promise<number[]> {
    const [me] = await userDb
      .select({ departmentId: organizationUsers.departmentId })
      .from(organizationUsers)
      .where(and(eq(organizationUsers.id, userId), eq(organizationUsers.organizationId, organizationId)))
      .limit(1);
    if (me?.departmentId == null) return [];

    const depts = await userDb
      .select({ id: departments.id, parentId: departments.parentId })
      .from(departments)
      .where(eq(departments.organizationId, organizationId));
    const parentOf = new Map(depts.map((d) => [d.id, d.parentId]));

    const chainIds: number[] = [];
    const seen = new Set<number>();
    let cur: number | null = me.departmentId;
    while (cur != null && !seen.has(cur)) {
      seen.add(cur);
      chainIds.push(cur);
      cur = parentOf.get(cur) ?? null;
    }
    return chainIds;
  }

  /** 멤버 유효 권한: 부서 체인의 부서 부여 ∪ 멤버 직접 부여 (∩ is_active) */
  private async resolvePermissions(userId: number, chainIds: number[]): Promise<PermissionKey[]> {
    const [deptKeys, userKeys] = await Promise.all([
      chainIds.length
        ? userDb
            .select({ key: permissions.key })
            .from(departmentPermissions)
            .innerJoin(permissions, eq(permissions.id, departmentPermissions.permissionId))
            .where(
              and(
                inArray(departmentPermissions.departmentId, chainIds),
                eq(permissions.isActive, true),
              ),
            )
        : Promise.resolve([] as { key: string }[]),
      userDb
        .select({ key: permissions.key })
        .from(organizationUserPermissions)
        .innerJoin(permissions, eq(permissions.id, organizationUserPermissions.permissionId))
        .where(
          and(eq(organizationUserPermissions.userId, userId), eq(permissions.isActive, true)),
        ),
    ]);

    return toPermissionKeys([...new Set([...deptKeys, ...userKeys].map((r) => r.key))]);
  }
}
