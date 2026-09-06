/** 저장 레코드: 자격증명은 암호문(cipher) 형태로만 오간다. */
export interface ApiCredentialRecord {
  provider: string;
  enabled: boolean;
  credentialsCipher: string | null;
  updatedAt: Date | null;
}

/** 공용 API 자격증명 레포지토리 아웃바운드 포트 (groupwaredb). 모든 메서드 첫 인자 organizationId. */
export interface ApiCredentialRepositoryPort {
  findManyRecordsByOrg(organizationId: number): Promise<ApiCredentialRecord[]>;
  findOneRecord(
    organizationId: number,
    provider: string,
  ): Promise<ApiCredentialRecord | null>;
  /** (org, provider) upsert. patch 에 포함된 필드만 갱신(미포함은 유지) */
  upsertRecord(
    organizationId: number,
    provider: string,
    patch: { enabled?: boolean; credentialsCipher?: string | null },
  ): Promise<ApiCredentialRecord>;
  deleteRecord(organizationId: number, provider: string): Promise<void>;
}

export const API_CREDENTIAL_REPOSITORY_PORT = Symbol('API_CREDENTIAL_REPOSITORY_PORT');
