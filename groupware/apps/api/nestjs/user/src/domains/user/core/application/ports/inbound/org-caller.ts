import { AccessTokenPayload } from '../../../domain/types/user.types';

/**
 * 조직 범위 작업 호출 주체: access 토큰 클레임에서 추출(컨트롤러가 req.user 로 채운다)
 * 조직도/사용자/권한/AI도구/디렉터리 등 조직 스코프 인바운드 포트가 공유한다.
 *
 * `AccessTokenPayload` 의 부분집합으로 정의해 토큰 클레임이 바뀌어도 단일 출처만 갱신된다.
 * 인가 정책(ROOT/시스템관리 여부 등)은 actor 가 아니라 서비스(resolveOrgManagementOrgId 등)가 판정한다.
 */
export type OrgCallerActor = Pick<
  AccessTokenPayload,
  'id' | 'role' | 'principalType' | 'organizationId' | 'permissions' | 'position'
>;
