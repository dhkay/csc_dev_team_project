import { InferSelectModel } from 'drizzle-orm';
import { organizationUsers, adminUsers, organizations } from '@csc/database/userdb';
import { CredentialEntity } from '../../../../../core/domain/entities/credential.entity';
import {
  OrgStatus,
  OrgType,
  PrincipalType,
  UserRole,
  UserStatus,
  UserType,
} from '../../../../../core/domain/types/user.types';
import { OrgPosition } from '../../../../../core/domain/types/entitlement-catalog';

type OrgRow = InferSelectModel<typeof organizations>;
type OrgUserRowWithOrg = InferSelectModel<typeof organizationUsers> & { organization: OrgRow };
type AdminUserRow = InferSelectModel<typeof adminUsers>;

/** organization_users(+organization) → CredentialEntity (조직유저, ORGANIZATION_USER) */
export function toOrganizationUserCredential(row: OrgUserRowWithOrg): CredentialEntity {
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
    lastLoginAt: row.lastLoginAt,
    profileImageUrl: row.profileImageUrl ?? null,
    principalType: PrincipalType.ORGANIZATION_USER,
    org: {
      id: row.organization.id,
      slug: row.organization.slug,
      name: row.organization.name,
      type: row.organization.type as OrgType,
      status: row.organization.status as OrgStatus,
      profileImageUrl: row.organization.profileImageUrl ?? null,
    },
  };
}

/** admin_users → CredentialEntity (관리자유저, ADMIN_USER). 조직 없음, userType 은 ADMIN_USER 고정 */
export function toAdminUserCredential(row: AdminUserRow): CredentialEntity {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    name: row.name,
    role: row.role as UserRole,
    position: null, // 관리자유저(admin_users)는 직책 컬럼 없음. 조직 직책 개념 밖
    status: row.status as UserStatus,
    userType: UserType.ADMIN_USER,
    tokenVersion: row.tokenVersion,
    failedLoginAttempts: row.failedLoginAttempts,
    lockedUntil: row.lockedUntil,
    lastLoginAt: row.lastLoginAt,
    profileImageUrl: null, // 관리자유저는 프로필 이미지 컬럼 없음(추후 확장)
    principalType: PrincipalType.ADMIN_USER,
    // org 미설정: org-active 게이트 스킵 + organizationType=PLATFORM 으로 발급
  };
}
