import { BadRequestException } from '@nestjs/common';
import { asToolVersion } from '@csc/tool-versions';

/**
 * 도구 버전 값 공간. 값의 주인은 `@csc/tool-versions` 이고 여기서는 도메인 이름으로 재노출
 * 버전 추가 = `packages/tool-versions/src/versions.ts` 한 줄 + 그 파이프라인 한 덩어리
 */
export type { ToolVersion } from '@csc/tool-versions';
export { TOOL_VERSIONS, DEFAULT_TOOL_VERSION, toolVersionOrDefault } from '@csc/tool-versions';

import type { ToolVersion } from '@csc/tool-versions';

/**
 * 요청이 말한 버전을 ToolVersion 으로 변환, 모르는 값은 400
 * 기본값으로 좁히면 `/v9.9/saved-plans` 가 다른 버전 목록을 200 으로 내주는 크로스 버전 누출
 */
export function parseToolVersion(raw: unknown): ToolVersion {
  const version = asToolVersion(raw);
  if (version === null) {
    throw new BadRequestException('도구 버전이 올바르지 않습니다.');
  }
  return version;
}
