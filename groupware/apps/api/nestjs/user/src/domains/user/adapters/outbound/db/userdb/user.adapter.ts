import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, ne, notInArray, sql } from 'drizzle-orm';
import {
  userDb,
  organizationUsers,
  organizations,
  aiTools,
  organizationAiTools,
  platformAssistantSettings,
} from '@csc/database/userdb';
import { OrganizationEntity, UserEntity } from '../../../../core/domain/entities/user.entity';
import { OrgStatus, UserRole, UserStatus, UserType } from '../../../../core/domain/types/user.types';
import { OrgPosition, ProvisioningMode } from '../../../../core/domain/types/entitlement-catalog';
import {
  AiToolCatalogItem,
  AiToolResolved,
  PlatformAssistantSettings,
  UpdatePlatformAssistantSettingsInput,
} from '../../../../core/domain/types';
import {
  CreateOrganizationRecord,
  CreateUserRecord,
  UserRepositoryPort,
} from '../../../../core/application/ports/outbound/user-repository.port';
import { toOrganizationEntity, toUserEntity } from './mappers';

@Injectable()
export class UserRepositoryAdapter implements UserRepositoryPort {
  async findOneRecordByEmail(email: string): Promise<UserEntity | null> {
    const row = await userDb.query.organizationUsers.findFirst({
      where: eq(organizationUsers.email, email),
      with: { organization: true },
    });
    return row ? toUserEntity(row) : null;
  }

  async findOneRecordById(id: number): Promise<UserEntity | null> {
    const row = await userDb.query.organizationUsers.findFirst({
      where: eq(organizationUsers.id, id),
      with: { organization: true },
    });
    return row ? toUserEntity(row) : null;
  }

  async findRootByOrganizationId(organizationId: number): Promise<UserEntity | null> {
    const row = await userDb.query.organizationUsers.findFirst({
      where: and(eq(organizationUsers.organizationId, organizationId), eq(organizationUsers.role, UserRole.ROOT)),
      with: { organization: true },
    });
    return row ? toUserEntity(row) : null;
  }

  async findManyRecordsByOrganizationId(organizationId: number): Promise<UserEntity[]> {
    const rows = await userDb.query.organizationUsers.findMany({
      where: and(
        eq(organizationUsers.organizationId, organizationId),
        ne(organizationUsers.status, UserStatus.WITHDRAWN),
      ),
      orderBy: asc(organizationUsers.createdAt), // ROOT 가 조직 생성 시 가장 먼저 생성 → 자연히 맨 위
      with: { organization: true },
    });
    return rows.map(toUserEntity);
  }

  async findManyWithdrawnRecordsByOrganizationId(organizationId: number): Promise<UserEntity[]> {
    const rows = await userDb.query.organizationUsers.findMany({
      where: and(
        eq(organizationUsers.organizationId, organizationId),
        eq(organizationUsers.status, UserStatus.WITHDRAWN),
      ),
      orderBy: desc(organizationUsers.updatedAt), // 최근 삭제(탈퇴)순
      with: { organization: true },
    });
    return rows.map(toUserEntity);
  }

  async purgeMemberRecord(id: number): Promise<void> {
    // 하드 삭제: 토글(organization_user_features/ai_tools)은 (user_id) FK cascade 로 함께 정리된다.
    await userDb.delete(organizationUsers).where(eq(organizationUsers.id, id));
  }

  async updateMemberStatusRecord(id: number, status: UserStatus): Promise<void> {
    await userDb
      .update(organizationUsers)
      .set({ status, updatedAt: new Date() })
      .where(eq(organizationUsers.id, id));
  }

  async updateMemberDepartmentRecord(id: number, departmentId: number | null): Promise<void> {
    // 팀장(TEAM_LEADER)은 "그 부서의 리더": 부서가 바뀌면(또는 미배치되면) 팀장 직책을 함께 해제한다.
    //  (그대로 두면 CHECK(팀장은 부서 필수)/부분유니크(부서당 1명)를 위반해 배치 저장이 깨진다.
    //   대표(REPRESENTATIVE)는 부서와 무관하므로 유지: position=TEAM_LEADER 조건에서만 해제.)
    await userDb
      .update(organizationUsers)
      .set({
        departmentId,
        position: sql`CASE WHEN ${organizationUsers.position} = 'TEAM_LEADER'
          AND ${organizationUsers.departmentId} IS DISTINCT FROM ${departmentId}
          THEN NULL ELSE ${organizationUsers.position} END`,
        updatedAt: new Date(),
      })
      .where(eq(organizationUsers.id, id));
  }

  async updateMemberPositionRecord(id: number, position: OrgPosition | null): Promise<void> {
    await userDb
      .update(organizationUsers)
      .set({ position, updatedAt: new Date() })
      .where(eq(organizationUsers.id, id));
  }

  /** 부서의 팀장(position=TEAM_LEADER) 단건: 부서당 1명 검증용. 없으면 null. */
  async findTeamLeaderRecordByDepartment(
    organizationId: number,
    departmentId: number,
  ): Promise<UserEntity | null> {
    const row = await userDb.query.organizationUsers.findFirst({
      where: and(
        eq(organizationUsers.organizationId, organizationId),
        eq(organizationUsers.departmentId, departmentId),
        eq(organizationUsers.position, OrgPosition.TeamLeader),
      ),
      with: { organization: true },
    });
    return row ? toUserEntity(row) : null;
  }

  async clearDepartmentForMembers(departmentIds: number[]): Promise<void> {
    if (departmentIds.length === 0) return;
    // 부서 삭제 cascade: 소속 멤버를 미배치(null)로. 팀장(TEAM_LEADER)은 부서가 사라지므로 직책도 함께 해제한다.
    //  (그대로 두면 CHECK '팀장은 부서 필수' 위반으로 부서 삭제가 실패한다). 대표는 부서 무관: 유지
    await userDb
      .update(organizationUsers)
      .set({
        departmentId: null,
        position: sql`CASE WHEN ${organizationUsers.position} = 'TEAM_LEADER' THEN NULL ELSE ${organizationUsers.position} END`,
        updatedAt: new Date(),
      })
      .where(inArray(organizationUsers.departmentId, departmentIds));
  }

  async createRecord(record: CreateUserRecord): Promise<UserEntity> {
    const [row] = await userDb
      .insert(organizationUsers)
      .values({
        email: record.email,
        passwordHash: record.passwordHash,
        name: record.name,
        organizationId: record.organizationId,
        departmentId: record.departmentId ?? null,
        phone: record.phone ?? null,
        extension: record.extension ?? null,
        role: record.role,
        status: record.status ?? UserStatus.ACTIVE,
        userType: record.userType ?? UserType.WEB_USER,
      })
      .returning();
    // 조직 동반 엔티티로 재조회(매퍼가 organization 을 필요로 함)
    const created = await this.findOneRecordById(row.id);
    return created as UserEntity;
  }

  async updatePasswordHashRecord(id: number, passwordHash: string): Promise<void> {
    await userDb
      .update(organizationUsers)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(organizationUsers.id, id));
  }

  async updateLoginSecurityRecord(
    id: number,
    failedLoginAttempts: number,
    lockedUntil: Date | null,
  ): Promise<void> {
    await userDb
      .update(organizationUsers)
      .set({ failedLoginAttempts, lockedUntil, updatedAt: new Date() })
      .where(eq(organizationUsers.id, id));
  }

  async incrementTokenVersionRecord(id: number): Promise<void> {
    await userDb
      .update(organizationUsers)
      .set({ tokenVersion: sql`${organizationUsers.tokenVersion} + 1`, updatedAt: new Date() })
      .where(eq(organizationUsers.id, id));
  }

  async updateEmailRecord(id: number, email: string): Promise<void> {
    await userDb.update(organizationUsers).set({ email }).where(eq(organizationUsers.id, id));
  }

  async updateProfileRecord(
    id: number,
    patch: {
      name?: string;
      profileImageUrl?: string | null;
      phone?: string | null;
      extension?: string | null;
    },
  ): Promise<void> {
    await userDb
      .update(organizationUsers)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.profileImageUrl !== undefined ? { profileImageUrl: patch.profileImageUrl } : {}),
        ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
        ...(patch.extension !== undefined ? { extension: patch.extension } : {}),
        updatedAt: new Date(),
      })
      .where(eq(organizationUsers.id, id));
  }


  async findOrganizationById(id: number): Promise<OrganizationEntity | null> {
    const row = await userDb.query.organizations.findFirst({
      where: eq(organizations.id, id),
    });
    return row ? toOrganizationEntity(row) : null;
  }

  async findOrganizationBySlug(slug: string): Promise<OrganizationEntity | null> {
    const row = await userDb.query.organizations.findFirst({
      where: eq(organizations.slug, slug),
    });
    return row ? toOrganizationEntity(row) : null;
  }

  async findManyOrganizationRecords(): Promise<OrganizationEntity[]> {
    const rows = await userDb.query.organizations.findMany({
      orderBy: desc(organizations.createdAt),
    });
    return rows.map(toOrganizationEntity);
  }

  async createOrganizationRecord(
    record: CreateOrganizationRecord,
  ): Promise<OrganizationEntity> {
    const [row] = await userDb
      .insert(organizations)
      .values({
        slug: record.slug,
        name: record.name,
        type: record.type,
        ...(record.profileImageUrl !== undefined && {
          profileImageUrl: record.profileImageUrl,
        }),
      })
      .returning();
    return toOrganizationEntity(row);
  }

  async updateOrganizationRecord(
    id: number,
    patch: { name?: string; slug?: string; status?: OrgStatus; profileImageUrl?: string | null },
  ): Promise<OrganizationEntity> {
    const [row] = await userDb
      .update(organizations)
      .set({
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.slug !== undefined && { slug: patch.slug }),
        ...(patch.status !== undefined && { status: patch.status }),
        ...(patch.profileImageUrl !== undefined && {
          profileImageUrl: patch.profileImageUrl,
        }),
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, id))
      .returning();
    return toOrganizationEntity(row);
  }

  async updateOrganizationStatusRecord(id: number, status: OrgStatus): Promise<void> {
    await userDb
      .update(organizations)
      .set({ status, updatedAt: new Date() })
      .where(eq(organizations.id, id));
  }

  async bumpTokenVersionByOrganizationId(organizationId: number): Promise<void> {
    await userDb
      .update(organizationUsers)
      .set({ tokenVersion: sql`${organizationUsers.tokenVersion} + 1`, updatedAt: new Date() })
      .where(eq(organizationUsers.organizationId, organizationId));
  }

  async transferRootRecord(
    fromUserId: number,
    toUserId: number,
    options: { clearFromPosition: boolean },
  ): Promise<void> {
    // 조직에 ROOT 는 하나뿐이라 강등과 승격이 한 트랜잭션이어야 한다.
    // 중간 상태(ROOT 둘 또는 ROOT 없음)가 커밋되면 findRootByOrganizationId 가 엉뚱한 행을 집는다.
    // 양쪽 token_version 을 올려 재로그인시킨다. 권한이 줄어드는 쪽이 옛 토큰으로 ROOT 로 남으면 안 된다.
    await userDb.transaction(async (tx) => {
      const now = new Date();
      await tx
        .update(organizationUsers)
        .set({
          role: UserRole.ADMIN,
          // 대표는 루트와 동등한 권한자라 강등만으로는 권한이 회수되지 않는다. 같은 트랜잭션에서 해임한다.
          ...(options.clearFromPosition ? { position: null } : {}),
          tokenVersion: sql`${organizationUsers.tokenVersion} + 1`,
          updatedAt: now,
        })
        .where(eq(organizationUsers.id, fromUserId));
      await tx
        .update(organizationUsers)
        .set({
          role: UserRole.ROOT,
          tokenVersion: sql`${organizationUsers.tokenVersion} + 1`,
          updatedAt: now,
        })
        .where(eq(organizationUsers.id, toUserId));
    });
  }

  async replaceRootWithNewRecord(
    fromUserId: number,
    record: CreateUserRecord,
    options: { clearFromPosition: boolean },
  ): Promise<UserEntity> {
    // 새 계정을 ROOT 로 세우고 기존 ROOT 를 강등한다. 둘이 한 트랜잭션이어야
    // 생성만 커밋되고 강등이 실패하는 상태(ROOT 둘)가 남지 않는다.
    const created = await userDb.transaction(async (tx) => {
      const [row] = await tx
        .insert(organizationUsers)
        .values({
          email: record.email,
          passwordHash: record.passwordHash,
          name: record.name,
          organizationId: record.organizationId,
          departmentId: record.departmentId ?? null,
          phone: record.phone ?? null,
          extension: record.extension ?? null,
          role: UserRole.ROOT,
          status: record.status ?? UserStatus.ACTIVE,
          userType: record.userType ?? UserType.WEB_USER,
        })
        .returning();
      await tx
        .update(organizationUsers)
        .set({
          role: UserRole.ADMIN,
          // 대표 직책이 남으면 루트 권한이 그대로 유지된다(hasRootAuthority). 함께 해임한다.
          ...(options.clearFromPosition ? { position: null } : {}),
          tokenVersion: sql`${organizationUsers.tokenVersion} + 1`, // 옛 ROOT 재로그인
          updatedAt: new Date(),
        })
        .where(eq(organizationUsers.id, fromUserId));
      return row;
    });
    // 조직 동반 엔티티로 재조회(매퍼가 organization 을 필요로 함)
    return (await this.findOneRecordById(created.id)) as UserEntity;
  }

  async purgeOrganizationRecord(organizationId: number): Promise<void> {
    // FK(organizationUsers.organization_id RESTRICT) 대응: 유저 먼저, 그다음 조직. 원자적 트랜잭션
    await userDb.transaction(async (tx) => {
      await tx.delete(organizationUsers).where(eq(organizationUsers.organizationId, organizationId));
      await tx.delete(organizations).where(eq(organizations.id, organizationId));
    });
  }

  async findOrganizationAiToolKeys(organizationId: number): Promise<string[]> {
    const rows = await userDb
      .select({ key: aiTools.key })
      .from(organizationAiTools)
      .innerJoin(aiTools, eq(aiTools.id, organizationAiTools.aiToolId))
      .where(and(eq(organizationAiTools.organizationId, organizationId), eq(aiTools.isActive, true)));
    return rows.map((r) => r.key);
  }

  async setOrganizationAiToolsRecord(
    organizationId: number,
    toolKeys: string[],
  ): Promise<void> {
    // 원하는 key 전체 집합으로 동기화(reconcile): 트랜잭션으로 원자 적용
    await userDb.transaction(async (tx) => {
      // 활성 카탈로그에서 key → id 해석(미존재/비활성 key 는 무시)
      // COMMON(전 조직 공통) 도구는 조직 grant 대상이 아니므로 제외: 실려와도 grant 행을 만들지 않는다(UI+서버 이중 방어)
      const desired = toolKeys.length
        ? await tx
            .select({ id: aiTools.id })
            .from(aiTools)
            .where(
              and(
                inArray(aiTools.key, toolKeys),
                eq(aiTools.isActive, true),
                eq(aiTools.provisioning, ProvisioningMode.PerOrg),
              ),
            )
        : [];
      const desiredIds = desired.map((t) => t.id);

      // 원하는 집합에 없는 기존 grant 제거(빈 집합이면 전체 제거)
      await tx
        .delete(organizationAiTools)
        .where(
          desiredIds.length
            ? and(
                eq(organizationAiTools.organizationId, organizationId),
                notInArray(organizationAiTools.aiToolId, desiredIds),
              )
            : eq(organizationAiTools.organizationId, organizationId),
        );

      // 누락된 grant 추가 = 조직에 도구 availability 만 부여(유저 접근은 부서/유저 부여로 별도). 이미 있으면 무시
      if (desiredIds.length) {
        await tx
          .insert(organizationAiTools)
          .values(
            desiredIds.map((aiToolId) => ({
              organizationId,
              aiToolId,
            })),
          )
          .onConflictDoNothing();
      }
    });
  }

  // AI 도구 카탈로그 (플랫폼 관리: 표시명/slug/프로비저닝 편집)
  // provisioning 은 varchar 저장이라 닫힌 enum(ProvisioningMode)으로 타입 좁힘(쓰기는 항상 enum 값)
  private static readonly AI_TOOL_COLUMNS = {
    key: aiTools.key,
    name: aiTools.name,
    slug: aiTools.slug,
    description: aiTools.description,
    provisioning: sql<ProvisioningMode>`${aiTools.provisioning}`.as('provisioning'),
    isActive: aiTools.isActive,
    sortOrder: aiTools.sortOrder,
  };

  async listAiToolCatalogRecords(): Promise<AiToolCatalogItem[]> {
    // 활성(코드 카탈로그에 존재) 도구만. 시더가 soft 비활성화한 orphan(코드에서 제거된 도구)은 관리 목록에서 숨긴다.
    return userDb
      .select(UserRepositoryAdapter.AI_TOOL_COLUMNS)
      .from(aiTools)
      .where(eq(aiTools.isActive, true))
      .orderBy(asc(aiTools.sortOrder));
  }

  async findAiToolRecordByKey(key: string): Promise<AiToolCatalogItem | null> {
    const [row] = await userDb
      .select(UserRepositoryAdapter.AI_TOOL_COLUMNS)
      .from(aiTools)
      .where(eq(aiTools.key, key))
      .limit(1);
    return row ?? null;
  }

  async findAiToolRecordBySlug(slug: string): Promise<AiToolCatalogItem | null> {
    const [row] = await userDb
      .select(UserRepositoryAdapter.AI_TOOL_COLUMNS)
      .from(aiTools)
      .where(eq(aiTools.slug, slug))
      .limit(1);
    return row ?? null;
  }

  async updateAiToolRecordByKey(
    key: string,
    patch: { name?: string; slug?: string; provisioning?: ProvisioningMode },
  ): Promise<AiToolCatalogItem> {
    const [row] = await userDb
      .update(aiTools)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
        ...(patch.provisioning !== undefined ? { provisioning: patch.provisioning } : {}),
        updatedAt: new Date(),
      })
      .where(eq(aiTools.key, key))
      .returning(UserRepositoryAdapter.AI_TOOL_COLUMNS);
    return row;
  }

  /** 조직에 부여된 AI도구(표시명+slug 포함): 그룹웨어 노출/라우팅용 */
  async findOrganizationAiToolsResolvedRecords(
    organizationId: number,
  ): Promise<AiToolResolved[]> {
    return userDb
      .select({ key: aiTools.key, name: aiTools.name, slug: aiTools.slug })
      .from(organizationAiTools)
      .innerJoin(aiTools, eq(aiTools.id, organizationAiTools.aiToolId))
      .where(
        and(
          eq(organizationAiTools.organizationId, organizationId),
          eq(aiTools.isActive, true),
        ),
      );
  }

  // 플랫폼 AI 어시스턴트 전역 설정 (싱글톤 id=1)
  private static readonly PLATFORM_ASSISTANT_DEFAULTS: PlatformAssistantSettings = {
    globalEnabled: true,
    commonPrompt: null,
  };

  async findPlatformAssistantSettingsRecord(): Promise<PlatformAssistantSettings> {
    const [row] = await userDb
      .select()
      .from(platformAssistantSettings)
      .where(eq(platformAssistantSettings.id, 1))
      .limit(1);
    if (!row) return UserRepositoryAdapter.PLATFORM_ASSISTANT_DEFAULTS;
    return {
      globalEnabled: row.globalEnabled,
      commonPrompt: row.commonPrompt ?? null,
    };
  }

  async updatePlatformAssistantSettingsRecord(
    patch: UpdatePlatformAssistantSettingsInput,
  ): Promise<PlatformAssistantSettings> {
    // 싱글톤 upsert(id=1): 마이그레이션이 기본 행을 시드하지만 방어적으로 onConflict 갱신
    const set = {
      ...(patch.globalEnabled !== undefined ? { globalEnabled: patch.globalEnabled } : {}),
      ...(patch.commonPrompt !== undefined ? { commonPrompt: patch.commonPrompt } : {}),
      updatedAt: new Date(),
    };
    await userDb
      .insert(platformAssistantSettings)
      .values({ id: 1, ...set })
      .onConflictDoUpdate({ target: platformAssistantSettings.id, set });
    return this.findPlatformAssistantSettingsRecord();
  }
}
