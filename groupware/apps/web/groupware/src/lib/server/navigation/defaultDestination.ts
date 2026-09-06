import { isAdmin } from '$lib/shared/lib/auth/access';
import type { CurrentUser } from '$lib/shared/types/common.types';

/** 이동할 화면이 없을 때(조직 정보 없음 등) 로그인 화면에 머무르게 하는 값 */
const FALLBACK_DESTINATION = '/login';

/**
 * 로그인 성공과 자동 로그인 진입 시 이동할 기본 화면: 자기 조직의 관리자 홈
 *
 * AI 도구는 관리자 홈에서 들어가므로, 여기서 조직 보유 도구를 조회해 첫 도구 워크스페이스로
 * 보내지 않는다. 그 조회가 로그인마다 붙던 백엔드 호출 1회였고, 도구를 아직 부여받지 못한
 * 사용자는 인증에 성공하고도 로그인 화면에 남는 결과가 됐다.
 *
 * 슬러그 없는 `/admin` 을 거치지 않고 곧바로 `/{조직}/admin` 을 돌려준다. `/admin` 은 사용자가
 * 직접 그 주소로 들어왔을 때 교정해 주는 진입점으로만 남는다(리다이렉트 1회 절약)
 *
 * isAdmin 검사를 남긴 이유: 목적지인 `/[orgSlug]/admin` 레이아웃 가드가 같은 조건을 요구한다.
 * 여기서 걸러내지 않으면 가드가 `/login` 으로 되돌리고 로그인 화면이 다시 같은 목적지를 계산해,
 * 리다이렉트가 오간다.
 */
export function resolveGroupwareDefaultDestination(
  user: CurrentUser | null | undefined,
): string {
  if (!isAdmin(user)) return FALLBACK_DESTINATION;

  const orgSlug = user?.organization?.slug;
  return orgSlug ? `/${orgSlug}/admin` : FALLBACK_DESTINATION;
}
