import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { userDb, adminUsers } from '@csc/database/userdb';
import { CredentialEntity } from '../../../../../core/domain/entities/credential.entity';
import { CredentialRepositoryPort } from '../../../../../core/application/ports/outbound/credential-repository.port';
import { PrincipalType } from '../../../../../core/domain/types/user.types';
import { toAdminUserCredential } from '../mappers/credential.mappers';

/** admin_users 자격 어댑터: 관리자유저(control-tower). 조직 스코프 없음(email 전역 유일) */
@Injectable()
export class AdminUserCredentialAdapter implements CredentialRepositoryPort {
  readonly principalType = PrincipalType.ADMIN_USER;

  async findOneByEmail(email: string): Promise<CredentialEntity | null> {
    const row = await userDb.query.adminUsers.findFirst({
      where: eq(adminUsers.email, email),
    });
    return row ? toAdminUserCredential(row) : null;
  }

  async findOneById(id: number): Promise<CredentialEntity | null> {
    const row = await userDb.query.adminUsers.findFirst({
      where: eq(adminUsers.id, id),
    });
    return row ? toAdminUserCredential(row) : null;
  }

  async updateLoginSecurity(
    id: number,
    failedLoginAttempts: number,
    lockedUntil: Date | null,
  ): Promise<void> {
    await userDb
      .update(adminUsers)
      .set({ failedLoginAttempts, lockedUntil, updatedAt: new Date() })
      .where(eq(adminUsers.id, id));
  }

  async updateLastLogin(id: number): Promise<void> {
    await userDb
      .update(adminUsers)
      .set({ lastLoginAt: sql`now()` })
      .where(eq(adminUsers.id, id));
  }

  async incrementTokenVersion(id: number): Promise<void> {
    await userDb
      .update(adminUsers)
      .set({ tokenVersion: sql`${adminUsers.tokenVersion} + 1`, updatedAt: new Date() })
      .where(eq(adminUsers.id, id));
  }
}
