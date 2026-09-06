import { SQL, and, eq } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type {
  OrgVersionScope,
  OwnerVersionScope,
  WorkspaceScope,
} from '../../../domain/workspace-scope';

/** 스코프가 걸리는 컬럼(산출물 세 표가 모두 보유) */
export interface OwnerVersionColumns {
  organizationId: PgColumn;
  ownerUserId: PgColumn;
  version: PgColumn;
}

/** 워크스페이스 컬럼(위 + 채널) */
export interface WorkspaceColumns extends OwnerVersionColumns {
  channelId: PgColumn;
}

/**
 * (조직, 작업자, 버전) WHERE
 * 세 어댑터가 각자 적지 않고 모으는 이유: 버전을 빠뜨린 조건을 만들 방법 제거
 */
export function ownerVersionWhere(cols: OwnerVersionColumns, scope: OwnerVersionScope): SQL {
  return and(
    eq(cols.organizationId, scope.organizationId),
    eq(cols.ownerUserId, scope.ownerUserId),
    // 버전이 다르면 남의 워크스페이스. 컬럼이 NOT NULL 이라 IS NULL 관용은 불필요
    eq(cols.version, scope.version),
  ) as SQL;
}

/**
 * 위 조건 + 채널. 목록 질의는 전부 이것을 사용
 * 채널 조건이 빠지면 그 사람의 전 채널 산출물이 한 워크스페이스에 섞임
 */
export function workspaceWhere(cols: WorkspaceColumns, scope: WorkspaceScope): SQL {
  return and(ownerVersionWhere(cols, scope), eq(cols.channelId, scope.channelId)) as SQL;
}

/**
 * (조직, 버전) WHERE. 작업자도 채널도 조건이 아니고 조직 공용 보관함이 사용
 * 별도 함수인 이유: 옵션으로 두면 보관함 질의가 개인 것으로 조용히 좁아짐
 */
export function orgVersionWhere(
  cols: Pick<OwnerVersionColumns, 'organizationId' | 'version'>,
  scope: OrgVersionScope,
): SQL {
  return and(
    eq(cols.organizationId, scope.organizationId),
    // 보관함은 사람을 넘어 공유되지만 버전은 넘지 않음(산출물은 만든 버전의 것)
    eq(cols.version, scope.version),
  ) as SQL;
}
