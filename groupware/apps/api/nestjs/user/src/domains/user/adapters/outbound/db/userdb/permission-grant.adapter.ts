import { Injectable } from '@nestjs/common';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import {
  userDb,
  permissions,
  departments,
  departmentPermissions,
  organizationUserPermissions,
} from '@csc/database/userdb';
import {
  PermissionGrantMatrix,
  PermissionGrantRepositoryPort,
} from '../../../../core/application/ports/outbound/permission-grant-repository.port';

/**
 * 권한 부여 어댑터 (userdb). set* 은 setOrganizationAiToolsRecord 와 동일한 트랜잭션 멱등 reconcile.
 */
@Injectable()
export class PermissionGrantRepositoryAdapter implements PermissionGrantRepositoryPort {
  async findGrantMatrixByOrganizationId(organizationId: number): Promise<PermissionGrantMatrix> {
    const [deptRows, userRows] = await Promise.all([
      userDb
        .select({ departmentId: departmentPermissions.departmentId, key: permissions.key })
        .from(departmentPermissions)
        .innerJoin(permissions, eq(permissions.id, departmentPermissions.permissionId))
        .innerJoin(departments, eq(departments.id, departmentPermissions.departmentId))
        .where(and(eq(departments.organizationId, organizationId), eq(permissions.isActive, true))),
      userDb
        .select({ userId: organizationUserPermissions.userId, key: permissions.key })
        .from(organizationUserPermissions)
        .innerJoin(permissions, eq(permissions.id, organizationUserPermissions.permissionId))
        .where(
          and(
            eq(organizationUserPermissions.organizationId, organizationId),
            eq(permissions.isActive, true),
          ),
        ),
    ]);

    return {
      departments: groupKeys(deptRows, (r) => r.departmentId).map(([departmentId, keys]) => ({
        departmentId,
        permissionKeys: keys,
      })),
      members: groupKeys(userRows, (r) => r.userId).map(([userId, keys]) => ({
        userId,
        permissionKeys: keys,
      })),
    };
  }

  async setDepartmentPermissionsRecord(
    departmentId: number,
    permissionKeys: string[],
    grantedBy: number,
  ): Promise<void> {
    // 원하는 key 전체 집합으로 동기화(reconcile): 트랜잭션으로 원자 적용
    await userDb.transaction(async (tx) => {
      // 활성 카탈로그에서 key → id 해석(미존재/비활성 key 는 무시)
      const desired = permissionKeys.length
        ? await tx
            .select({ id: permissions.id })
            .from(permissions)
            .where(and(inArray(permissions.key, permissionKeys), eq(permissions.isActive, true)))
        : [];
      const desiredIds = desired.map((p) => p.id);

      await tx
        .delete(departmentPermissions)
        .where(
          desiredIds.length
            ? and(
                eq(departmentPermissions.departmentId, departmentId),
                notInArray(departmentPermissions.permissionId, desiredIds),
              )
            : eq(departmentPermissions.departmentId, departmentId),
        );
      if (desiredIds.length) {
        await tx
          .insert(departmentPermissions)
          .values(desiredIds.map((permissionId) => ({ departmentId, permissionId, grantedBy })))
          .onConflictDoNothing();
      }
    });
  }

  async setUserPermissionsRecord(
    organizationId: number,
    userId: number,
    permissionKeys: string[],
    assignedBy: number,
  ): Promise<void> {
    await userDb.transaction(async (tx) => {
      const desired = permissionKeys.length
        ? await tx
            .select({ id: permissions.id })
            .from(permissions)
            .where(and(inArray(permissions.key, permissionKeys), eq(permissions.isActive, true)))
        : [];
      const desiredIds = desired.map((p) => p.id);

      await tx
        .delete(organizationUserPermissions)
        .where(
          desiredIds.length
            ? and(
                eq(organizationUserPermissions.userId, userId),
                notInArray(organizationUserPermissions.permissionId, desiredIds),
              )
            : eq(organizationUserPermissions.userId, userId),
        );
      if (desiredIds.length) {
        await tx
          .insert(organizationUserPermissions)
          .values(
            desiredIds.map((permissionId) => ({ organizationId, userId, permissionId, assignedBy })),
          )
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
