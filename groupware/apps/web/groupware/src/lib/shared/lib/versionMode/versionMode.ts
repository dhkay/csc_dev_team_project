/**
 * 도구 버전의 값 공간(어휘). 값은 `@csc/tool-versions` 가 소유한다.
 *
 * 이 파일은 그 공유 커널을 화면의 이름으로 재노출한다. 룬 스토어와 분리해 둔 이유는 서버 코드도
 * 이 목록을 쓰기 때문이다. BFF 가 요청의 버전을 여기 목록으로 검증해야 모르는 값이 백엔드로
 * 흘러가지 않는다(`.svelte.ts` 는 룬을 담아 서버에서 import 할 자리가 아니다).
 *
 * 버전은 주소의 축이다. 라우트 세그먼트로 들어오고 산출물과 개인 설정 슬롯이 이 값으로 갈린다.
 *
 * 값을 여기 복제하지 않는다. 백엔드가 같은 목록을 쓰는데 각자 리터럴을 들면 갈리고 그 갈림이
 * 조용하다. 사본이 없으면 대조할 것도 없다.
 */
import type { ToolVersion } from '@csc/tool-versions';
import { DEFAULT_TOOL_VERSION, TOOL_VERSIONS, asToolVersion } from '@csc/tool-versions';

export type VersionMode = ToolVersion;

/** 표시 순서(토글 항목 순서의 단일 출처). 새 버전은 커널의 목록 한 줄 */
export const VERSION_MODES: readonly VersionMode[] = TOOL_VERSIONS;

/** 아직 고른 적 없는 사람이 처음 들어갈 버전 */
export const DEFAULT_VERSION_MODE: VersionMode = DEFAULT_TOOL_VERSION;

/**
 * 값 공간 판정(좁히기 전용): 목록에 없으면 null.
 *
 * 요청 검증은 반드시 이쪽을 쓴다. `parseVersionMode` 로 검증하면 버전을 빠뜨린 요청이 조용히
 * 기본 버전으로 처리되어, 화면이 말한 버전과 다른 워크스페이스의 데이터가 오간다.
 */
export function asVersionMode(raw: unknown): VersionMode | null {
  return asToolVersion(raw);
}

/**
 * 저장분/낡은 값 정규화: 모르는 값은 기본으로 좁힌다.
 *
 * 쓰는 자리는 하나다. 진입 기본 버전(그 사람이 다음에 어디로 들어갈지). 폐기된 버전이 저장돼
 * 있어도 도구에 못 들어가는 일은 없어야 한다. 요청의 버전에는 쓰지 않는다(위 주석 참고)
 */
export function parseVersionMode(raw: unknown): VersionMode {
  return asVersionMode(raw) ?? DEFAULT_VERSION_MODE;
}
