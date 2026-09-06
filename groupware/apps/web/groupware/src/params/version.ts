import { VERSION_MODES } from '$lib/shared/lib/versionMode/versionMode';
import type { ParamMatcher } from '@sveltejs/kit';

/**
 * 도구 버전 세그먼트 매처: `/{org}/{tool}/{version}/{channel}` 의 세 번째 조각
 *
 * 모르는 값은 매칭되지 않는다(404). 기본 버전으로 접지 않는 이유: 이 세그먼트가 어느
 * 워크스페이스를 여는지 정하므로, 오타를 조용히 접으면 `/v9.9/...` 이 v1.5 화면을 열어 주소가
 * 거짓말을 한다. 두 버전을 주소로 나란히 두고 비교하는 것이 이 축을 만든 이유인데 거기서 무너진다.
 *
 * 버전을 말하지 않은 주소는 다르다: 그것은 리다이렉트로 채운다(도구 루트 → 진입 버전)
 */
export const match: ParamMatcher = (param) =>
  (VERSION_MODES as readonly string[]).includes(param);
