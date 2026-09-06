import { BadRequestException } from '@nestjs/common';

/**
 * 스코프 자산 소유자 컨텍스트: organizationId 유무로 판별(common-asset / asset-set 공통)
 *   null   → 플랫폼(scope='common' 소유)
 *   number → 조직(scope='organization', 해당 org 소유)
 */
export type AssetOwner = number | null;

/** 쿼리 organizationId → 소유자(없으면 플랫폼 null). 잘못된 값은 400. */
export function parseOwner(raw?: string): AssetOwner {
  if (raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new BadRequestException('organizationId 가 올바르지 않습니다.');
  }
  return n;
}

/**
 * 소유권 판정(테넌트 격리 불변식): 플랫폼(null)은 common 만, 조직(orgId)은 자기 org 의 organization 자산만
 * 변경(수정/삭제/슬롯) 전 대상 소유권 확인의 단일 출처
 */
export function isOwnedBy(
  entity: { scope: string; organizationId: number | null },
  owner: AssetOwner,
): boolean {
  return owner === null
    ? entity.scope === 'common'
    : entity.scope === 'organization' && entity.organizationId === owner;
}
