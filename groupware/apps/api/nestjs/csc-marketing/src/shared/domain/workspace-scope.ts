import { BadRequestException } from '@nestjs/common';
import { ToolVersion, parseToolVersion } from './tool-version';

/**
 * (조직, 작업자, 버전): id 로 한 건을 집는 읽기와 쓰기의 스코프
 * 위치 인자로 나르지 않고 덩어리로 두는 이유: 버전을 빠뜨린 질의의 컴파일 차단
 */
export interface OwnerVersionScope {
  readonly organizationId: number;
  readonly ownerUserId: number;
  readonly version: ToolVersion;
}

/**
 * 워크스페이스 = 작업자 x 채널 x 버전. 목록 읽기의 스코프
 * OwnerVersionScope 확장이라 단건 조회에 그대로 쓸 수 있고 반대 방향은 타입이 막음
 */
export interface WorkspaceScope extends OwnerVersionScope {
  readonly channelId: number;
}

/**
 * (조직, 버전): 작업자도 채널도 축이 아닌 조회의 스코프. 현재 소비자는 보관함 하나
 * 별도 타입인 이유: 필드가 없으면 조건으로 넣을 수도 없어 보관함 질의가 개인 것으로 좁는 실수를 차단
 */
export interface OrgVersionScope {
  readonly organizationId: number;
  readonly version: ToolVersion;
}

/**
 * 팩토리는 검증만 담당(브랜드 타입 아님)
 * 리터럴로 버전을 손으로 적는 우회는 소스 검사(shared/__tests__/tool-version-guards.spec.ts)가 담당
 */
export function ownerVersionScope(input: {
  organizationId: number;
  ownerUserId: number;
  version: unknown;
}): OwnerVersionScope {
  return {
    organizationId: assertPositiveId(input.organizationId, 'organizationId'),
    ownerUserId: assertPositiveId(input.ownerUserId, 'ownerUserId'),
    version: parseToolVersion(input.version),
  };
}

/** 목록 스코프. 채널이 붙는다. */
export function workspaceScope(input: {
  organizationId: number;
  ownerUserId: number;
  channelId: number;
  version: unknown;
}): WorkspaceScope {
  return {
    ...ownerVersionScope(input),
    channelId: assertPositiveId(input.channelId, 'channelId'),
  };
}

/** 조직 공용 스코프(보관함). 작업자도 채널도 없다. */
export function orgVersionScope(input: {
  organizationId: number;
  version: unknown;
}): OrgVersionScope {
  return {
    organizationId: assertPositiveId(input.organizationId, 'organizationId'),
    version: parseToolVersion(input.version),
  };
}

function assertPositiveId(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new BadRequestException(`${field} 가 올바르지 않습니다.`);
  }
  return value;
}
