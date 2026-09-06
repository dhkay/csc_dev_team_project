import { InferSelectModel } from 'drizzle-orm';
import { organizationUsers, organizations, adminUsers, departments } from '@csc/database/userdb';
import {
  OrganizationEntity,
  PlatformAdminEntity,
  UserEntity,
} from '../../../../../core/domain/entities/user.entity';
import { DepartmentEntity } from '../../../../../core/domain/entities/department.entity';
import {
  OrgStatus,
  OrgType,
  UserRole,
  UserStatus,
  UserType,
} from '../../../../../core/domain/types/user.types';
import { OrgPosition } from '../../../../../core/domain/types/entitlement-catalog';

type OrganizationRow = InferSelectModel<typeof organizations>;
type DepartmentRow = InferSelectModel<typeof departments>;

/** Drizzle departments row → Domain DepartmentEntity 변환 */
export function toDepartmentEntity(row: DepartmentRow): DepartmentEntity {
  return {
    id: row.id,
    organizationId: row.organizationId,
    parentId: row.parentId ?? null,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
type PlatformAdminRow = InferSelectModel<typeof adminUsers>;
/** 조직 동반 조회된 organizationUsers row (relational query 결과) */
type UserRowWithOrg = InferSelectModel<typeof organizationUsers> & {
  organization: OrganizationRow;
};

/** Drizzle organizations row → Domain OrganizationEntity 변환 */
export function toOrganizationEntity(row: OrganizationRow): OrganizationEntity {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    type: row.type as OrgType,
    status: row.status as OrgStatus,
    profileImageUrl: row.profileImageUrl ?? null,
    createdAt: row.createdAt,
  };
}

/** Drizzle organizationUsers row(+organization) → Domain UserEntity 변환 */
export function toUserEntity(row: UserRowWithOrg): UserEntity {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    name: row.name,
    role: row.role as UserRole,
    position: (row.position as OrgPosition | null) ?? null,
    status: row.status as UserStatus,
    userType: row.userType as UserType,
    tokenVersion: row.tokenVersion,
    failedLoginAttempts: row.failedLoginAttempts,
    lockedUntil: row.lockedUntil,
    organizationId: row.organizationId,
    departmentId: row.departmentId ?? null,
    phone: row.phone ?? null,
    extension: row.extension ?? null,
    organizationSlug: row.organization.slug,
    organizationName: row.organization.name,
    organizationType: row.organization.type as OrgType,
    organizationStatus: row.organization.status as OrgStatus,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Drizzle platform_admins row → Domain PlatformAdminEntity 변환 */
export function toPlatformAdminEntity(row: PlatformAdminRow): PlatformAdminEntity {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    name: row.name,
    role: row.role as UserRole,
    status: row.status as UserStatus,
    tokenVersion: row.tokenVersion,
    failedLoginAttempts: row.failedLoginAttempts,
    lockedUntil: row.lockedUntil,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
