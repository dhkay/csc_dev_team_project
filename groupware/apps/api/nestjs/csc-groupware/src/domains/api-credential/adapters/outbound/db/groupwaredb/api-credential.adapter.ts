import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { groupwareDb, organizationApiCredentials } from '@csc/database/groupwaredb';
import {
  ApiCredentialRecord,
  ApiCredentialRepositoryPort,
} from '../../../../core/application/ports/outbound';
import { toApiCredentialRecord } from './mappers';

/** ApiCredentialRepositoryPort 구현: groupwaredb (organization_id 스코프) */
@Injectable()
export class ApiCredentialRepositoryAdapter implements ApiCredentialRepositoryPort {
  async findManyRecordsByOrg(organizationId: number): Promise<ApiCredentialRecord[]> {
    const rows = await groupwareDb
      .select()
      .from(organizationApiCredentials)
      .where(eq(organizationApiCredentials.organizationId, organizationId));
    return rows.map(toApiCredentialRecord);
  }

  async findOneRecord(
    organizationId: number,
    provider: string,
  ): Promise<ApiCredentialRecord | null> {
    const [row] = await groupwareDb
      .select()
      .from(organizationApiCredentials)
      .where(
        and(
          eq(organizationApiCredentials.organizationId, organizationId),
          eq(organizationApiCredentials.provider, provider),
        ),
      )
      .limit(1);
    return row ? toApiCredentialRecord(row) : null;
  }

  async upsertRecord(
    organizationId: number,
    provider: string,
    patch: { enabled?: boolean; credentialsCipher?: string | null },
  ): Promise<ApiCredentialRecord> {
    const now = new Date();
    const set: Record<string, unknown> = { updatedAt: now };
    if (patch.enabled !== undefined) set.enabled = patch.enabled;
    if (patch.credentialsCipher !== undefined) set.credentials = patch.credentialsCipher;

    const [row] = await groupwareDb
      .insert(organizationApiCredentials)
      .values({
        organizationId,
        provider,
        enabled: patch.enabled ?? true,
        credentials: patch.credentialsCipher ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          organizationApiCredentials.organizationId,
          organizationApiCredentials.provider,
        ],
        set,
      })
      .returning();
    return toApiCredentialRecord(row);
  }

  async deleteRecord(organizationId: number, provider: string): Promise<void> {
    await groupwareDb
      .delete(organizationApiCredentials)
      .where(
        and(
          eq(organizationApiCredentials.organizationId, organizationId),
          eq(organizationApiCredentials.provider, provider),
        ),
      );
  }
}
