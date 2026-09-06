import { InferSelectModel } from 'drizzle-orm';
import { organizationApiCredentials } from '@csc/database/groupwaredb';
import { ApiCredentialRecord } from '../../../../../core/application/ports/outbound';

type Row = InferSelectModel<typeof organizationApiCredentials>;

/** Drizzle row → 저장 레코드(암호문 유지) */
export function toApiCredentialRecord(row: Row): ApiCredentialRecord {
  return {
    provider: row.provider,
    enabled: row.enabled,
    credentialsCipher: row.credentials,
    updatedAt: row.updatedAt,
  };
}
