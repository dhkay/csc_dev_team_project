import { Injectable } from '@nestjs/common';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import {
  userDb,
  aiTools,
  organizationAiTools,
  departmentAiTools,
  organizationUserAiTools,
} from '@csc/database/userdb';
import {
  AiToolDistributionMatrix,
  AiToolDistributionRepositoryPort,
} from '../../../../core/application/ports/outbound/ai-tool-distribution-repository.port';

/**
 * AI도구 배포 어댑터 (userdb). 모든 부여는 조직 보유 도구(organization_ai_tools) 범위 내: FK 가 강제
 * set* 은 setOrganizationAiToolsRecord 와 동일한 트랜잭션 멱등 reconcile.
 */
@Injectable()
export class AiToolDistributionRepositoryAdapter implements AiToolDistributionRepositoryPort {
  async findDistributionByOrganizationId(
    organizationId: number,
  ): Promise<AiToolDistributionMatrix> {
    const [toolRows, deptRows, userRows] = await Promise.all([
      userDb
        .select({
          key: aiTools.key,
          name: aiTools.name,
        })
        .from(organizationAiTools)
        .innerJoin(aiTools, eq(aiTools.id, organizationAiTools.aiToolId))
        .where(and(eq(organizationAiTools.organizationId, organizationId), eq(aiTools.isActive, true))),
      userDb
        .select({ departmentId: departmentAiTools.departmentId, key: aiTools.key })
        .from(departmentAiTools)
        .innerJoin(aiTools, eq(aiTools.id, departmentAiTools.aiToolId))
        .where(and(eq(departmentAiTools.organizationId, organizationId), eq(aiTools.isActive, true))),
      userDb
        .select({ userId: organizationUserAiTools.userId, key: aiTools.key })
        .from(organizationUserAiTools)
        .innerJoin(aiTools, eq(aiTools.id, organizationUserAiTools.aiToolId))
        .where(
          and(
            eq(organizationUserAiTools.organizationId, organizationId),
            eq(aiTools.isActive, true),
          ),
        ),
    ]);

    return {
      tools: toolRows,
      departmentGrants: groupKeys(deptRows, (r) => r.departmentId).map(([departmentId, keys]) => ({
        departmentId,
        aiToolKeys: keys,
      })),
      memberGrants: groupKeys(userRows, (r) => r.userId).map(([userId, keys]) => ({
        userId,
        aiToolKeys: keys,
      })),
    };
  }

  async setDepartmentAiToolsRecord(
    organizationId: number,
    departmentId: number,
    aiToolKeys: string[],
    grantedBy: number,
  ): Promise<void> {
    await userDb.transaction(async (tx) => {
      // 조직이 보유한(organization_ai_tools) 활성 도구로만 해석: 2단계 불변식
      const desired = aiToolKeys.length
        ? await tx
            .select({ id: aiTools.id })
            .from(organizationAiTools)
            .innerJoin(aiTools, eq(aiTools.id, organizationAiTools.aiToolId))
            .where(
              and(
                eq(organizationAiTools.organizationId, organizationId),
                inArray(aiTools.key, aiToolKeys),
                eq(aiTools.isActive, true),
              ),
            )
        : [];
      const desiredIds = desired.map((r) => r.id);
      await tx
        .delete(departmentAiTools)
        .where(
          desiredIds.length
            ? and(
                eq(departmentAiTools.departmentId, departmentId),
                notInArray(departmentAiTools.aiToolId, desiredIds),
              )
            : eq(departmentAiTools.departmentId, departmentId),
        );
      if (desiredIds.length) {
        await tx
          .insert(departmentAiTools)
          .values(desiredIds.map((aiToolId) => ({ organizationId, departmentId, aiToolId, grantedBy })))
          .onConflictDoNothing();
      }
    });
  }

  async setUserAiToolsRecord(
    organizationId: number,
    userId: number,
    aiToolKeys: string[],
    assignedBy: number,
  ): Promise<void> {
    await userDb.transaction(async (tx) => {
      const desired = aiToolKeys.length
        ? await tx
            .select({ id: aiTools.id })
            .from(organizationAiTools)
            .innerJoin(aiTools, eq(aiTools.id, organizationAiTools.aiToolId))
            .where(
              and(
                eq(organizationAiTools.organizationId, organizationId),
                inArray(aiTools.key, aiToolKeys),
                eq(aiTools.isActive, true),
              ),
            )
        : [];
      const desiredIds = desired.map((r) => r.id);
      await tx
        .delete(organizationUserAiTools)
        .where(
          desiredIds.length
            ? and(
                eq(organizationUserAiTools.userId, userId),
                notInArray(organizationUserAiTools.aiToolId, desiredIds),
              )
            : eq(organizationUserAiTools.userId, userId),
        );
      if (desiredIds.length) {
        await tx
          .insert(organizationUserAiTools)
          .values(desiredIds.map((aiToolId) => ({ organizationId, userId, aiToolId, assignedBy })))
          .onConflictDoNothing();
      }
    });
  }
}

/** rows 를 keyFn 기준으로 묶어 [id, key[]] 배열로 */
function groupKeys<T extends { key: string }>(
  rows: T[],
  keyFn: (r: T) => number,
): [number, string[]][] {
  const map = new Map<number, string[]>();
  for (const r of rows) {
    const id = keyFn(r);
    const arr = map.get(id) ?? [];
    arr.push(r.key);
    map.set(id, arr);
  }
  return [...map.entries()];
}
