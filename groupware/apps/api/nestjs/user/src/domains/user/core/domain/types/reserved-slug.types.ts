/**
 * 라우팅 예약 세그먼트: web 앱의 정적 최상위 경로와 같은 이름을 slug 로 쓰지 못하게 한다.
 *
 * groupware 의 주소는 `/{orgSlug}/...` 이고 AI 도구는 `/{orgSlug}/{toolSlug}` 다. 정적 경로는
 * 언제나 동적 세그먼트보다 먼저 매칭되므로, 조직 slug 가 `login` 이면 그 조직은 열리지 않는다.
 * 그 사고는 조직을 만드는 순간이 아니라 그 조직 사람이 로그인한 뒤에 드러난다.
 *
 * 값은 `apps/web/groupware/src/routes/` 의 최상위 디렉터리와 같아야 한다. 새 정적 경로를 만들면
 * 여기에도 더한다(그러지 않으면 그 이름의 조직이 이미 있을 때 조용히 깨진다)
 *   admin / api / login / auth / popout / f(공통 파일 공개 주소)
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'login',
  'auth',
  'popout',
  'f',
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}
