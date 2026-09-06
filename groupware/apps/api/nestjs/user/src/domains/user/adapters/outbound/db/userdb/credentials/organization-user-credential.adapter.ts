import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { userDb, organizationUsers } from '@csc/database/userdb';
import { CredentialEntity } from '../../../../../core/domain/entities/credential.entity';
import { CredentialRepositoryPort } from '../../../../../core/application/ports/outbound/credential-repository.port';
import { PrincipalType } from '../../../../../core/domain/types/user.types';
import { toOrganizationUserCredential } from '../mappers/credential.mappers';

/** organization_users 자격 어댑터: 조직유저(groupware) */
@Injectable()
export class OrganizationUserCredentialAdapter implements CredentialRepositoryPort {
  readonly principalType = PrincipalType.ORGANIZATION_USER;

  async findOneByEmail(email: string): Promise<CredentialEntity | null> {
    const row = await userDb.query.organizationUsers.findFirst({
      where: eq(organizationUsers.email, email),
      with: { organization: true },
    });
    return row ? toOrganizationUserCredential(row) : null;
  }

  async findOneById(id: number): Promise<CredentialEntity | null> {
    const row = await userDb.query.organizationUsers.findFirst({
      where: eq(organizationUsers.id, id),
      with: { organization: true },
    });
    return row ? toOrganizationUserCredential(row) : null;
  }

  async updateLoginSecurity(
    id: number,
    failedLoginAttempts: number,
    lockedUntil: Date | null,
  ): Promise<void> {
    await userDb
      .update(organizationUsers)
      .set({ failedLoginAttempts, lockedUntil, updatedAt: new Date() })
      .where(eq(organizationUsers.id, id));
  }

  async updateLastLogin(id: number): Promise<void> {
    await userDb
      .update(organizationUsers)
      .set({ lastLoginAt: sql`now()` })
      .where(eq(organizationUsers.id, id));
  }

  async incrementTokenVersion(id: number): Promise<void> {
    await userDb
      .update(organizationUsers)
      .set({ tokenVersion: sql`${organizationUsers.tokenVersion} + 1`, updatedAt: new Date() })
      .where(eq(organizationUsers.id, id));
  }
}
