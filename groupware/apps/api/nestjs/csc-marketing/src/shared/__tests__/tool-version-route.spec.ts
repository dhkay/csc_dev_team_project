import { BadRequestException } from '@nestjs/common';
import {
  TOOL_VERSION_ROUTE,
  toolVersionFromRequest,
} from '../adapters/inbound/http/tool-version.route';
import {
  DEFAULT_TOOL_VERSION,
  parseToolVersion,
  toolVersionOrDefault,
} from '../domain/tool-version';
import { ownerVersionScope, workspaceScope } from '../domain/workspace-scope';

/**
 * 버전이 요청으로 들어오는 경계의 규칙
 *
 * 두 파서가 반대로 동작하는 것이 의도다. 요청은 던지고(모르는 값이 조용히 다른 워크스페이스를
 * 열면 그게 곧 누출이다), 저장분은 좁힌다(폐기된 진입 기본값으로 도구가 막히면 안 된다)
 * 이 방향을 뒤집는 실수는 런타임에서 200 으로 보이므로 테스트로 못박는다.
 */
describe('도구 버전 요청 경계', () => {
  it('경로 세그먼트 이름이 데코레이터가 읽는 키와 같다', () => {
    // 접두사와 데코레이터가 어긋나면 그 컨트롤러만 조용히 400 이 된다(배포 후에 드러난다)
    expect(TOOL_VERSION_ROUTE).toBe('v/:version');
    expect(toolVersionFromRequest({ params: { version: 'v1.0' } })).toBe('v1.0');
  });

  it('모르는 버전은 400 이다(기본으로 좁히지 않는다)', () => {
    // 조용히 접으면 `/v/v9.9/saved-plans` 가 v1.5 목록을 200 으로 내준다.
    expect(() => toolVersionFromRequest({ params: { version: 'v9.9' } })).toThrow(
      BadRequestException,
    );
  });

  it('세그먼트가 비어 있으면 400 이다', () => {
    // 라우팅으로는 404 지만(경로가 매칭되지 않는다), 데코레이터가 유추하지 않는 것이 계약이다.
    expect(() => toolVersionFromRequest({ params: {} })).toThrow(BadRequestException);
    expect(() => toolVersionFromRequest({})).toThrow(BadRequestException);
  });
});

describe('도구 버전 어휘', () => {
  it('요청 파서는 모르는 값을 던진다', () => {
    expect(() => parseToolVersion('v9.9')).toThrow(BadRequestException);
    expect(parseToolVersion('v1.0')).toBe('v1.0');
  });

  it('저장분 파서는 모르는 값을 기본으로 좁힌다', () => {
    expect(toolVersionOrDefault('v9.9')).toBe(DEFAULT_TOOL_VERSION);
    expect(toolVersionOrDefault(null)).toBe(DEFAULT_TOOL_VERSION);
    expect(toolVersionOrDefault('v1.0')).toBe('v1.0');
  });

  it('스코프 팩토리가 모르는 버전과 잘못된 id 를 막는다', () => {
    const ok = { organizationId: 10, ownerUserId: 7, version: 'v1.5' };
    expect(ownerVersionScope(ok)).toEqual(ok);
    expect(() => ownerVersionScope({ ...ok, version: 'v9.9' })).toThrow(BadRequestException);
    expect(() => ownerVersionScope({ ...ok, organizationId: 0 })).toThrow(BadRequestException);
    expect(() => workspaceScope({ ...ok, channelId: -1 })).toThrow(BadRequestException);
  });
});
