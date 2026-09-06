import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';

/**
 * 버전 스코프 BFF 요청의 쿼리 조각
 *
 * 버전을 쿼리로 나르는 이유: 메서드와 무관하게 `event.url.searchParams` 한 곳에서 읽히고, 기존
 * `?channelId=` 관용과 합쳐지며, 네트워크 탭에서 눈에 보인다(두 버전을 비교하는 동안 이게 실질적
 * 가치가 있다). 헤더로 자동 주입하는 방법은 매력적으로 보이지만, 인터셉터가 요청 시점의 주소를
 * 읽으면 버전 전환 중 비행 중인 요청이 이전 버전 헤더로 나가 새 버전 키에 캐시된다. 키와 요청이
 * 같은 값에서 나와야 어긋날 수 없다.
 */
export function versionQuery(version: VersionMode): string {
  return `version=${encodeURIComponent(version)}`;
}

/** 위 + 채널(워크스페이스 자원). 목록/생성이 함께 쓰는 조합이다. */
export function scopeQuery(version: VersionMode, channelId: number): string {
  return `${versionQuery(version)}&channelId=${channelId}`;
}
