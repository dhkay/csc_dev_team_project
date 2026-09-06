import { parseVersionMode, type VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import type { LayoutServerLoad } from './$types';

/**
 * 버전 셸: 주소의 버전 세그먼트를 확정해 아래 전부가 상속한다.
 *
 * 버전은 주소다. 요청이 버전을 말하므로 서버가 그것을 다른 데서 유추하지 않는다(개인 설정에서
 * 읽으면 화면이 말한 버전과 쓰기가 쓴 버전이 갈린다)
 *
 * 여기서 검증하지 않는 이유: 매처(`src/params/version.ts`)가 이미 값 공간을 좁혀, 모르는 값은
 * 이 로더에 도달하기 전에 404 다. `parseVersionMode` 는 타입을 좁히는 용도다.
 */
export const load: LayoutServerLoad = (event) => {
  const version: VersionMode = parseVersionMode(event.params.version);
  return { version };
};
