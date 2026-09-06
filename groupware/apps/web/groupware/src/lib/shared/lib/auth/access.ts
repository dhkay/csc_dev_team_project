import { OrgPosition, PermissionKey } from '@csc/entitlements';
import type { JwtPayload } from '$lib/shared/lib/utils/authTokenUtils';
import type { CurrentUser, UserRole } from '$lib/shared/types/common.types';

/**
 * 관리자(ROOT/ADMIN) 판정: 역할 비교 단일 출처
 * 토큰 클레임(JwtPayload), 백엔드 유저(CurrentUser), 로그인 응답({ role }) 모두 지원한다.
 *
 * 인가 판정 자체의 단일 출처는 백엔드 검증(getUser)이며, 이 헬퍼는 role 비교만 담당한다.
 * (control-tower 의 isPlatformAdmin 과 대응)
 */
export function isAdmin(
  subject: JwtPayload | CurrentUser | { role?: UserRole } | null | undefined,
): boolean {
  if (!subject) return false;
  const role = (subject as { role?: UserRole }).role;
  return role === 'ROOT' || role === 'ADMIN';
}

/**
 * 조직관리자(ROOT) 판정: 조직 소유자 전용 기능 게이팅에 사용한다.
 * isAdmin(ROOT/ADMIN)과 달리 ROOT 만 통과시킨다(예: 사용자 관리 = 일반관리자 추가/라벨 관리)
 *
 * isAdmin 과 동일하게 role 비교만 담당하며, 인가 판정의 단일 출처는 백엔드 검증(getUser)이다.
 */
export function isRoot(
  subject: JwtPayload | CurrentUser | { role?: UserRole } | null | undefined,
): boolean {
  if (!subject) return false;
  return (subject as { role?: UserRole }).role === 'ROOT';
}

/**
 * 루트 권한자 판정: ROOT 또는 대표(직책 position=REPRESENTATIVE). 대표는 사실상 ROOT 와 동등한
 * 권한을 행사한다(조직 관리 전권 + 조직 보유 AI도구 전부 + ROOT 전용 부여). 백엔드 hasRootAuthority 와 동형
 * 대표는 권한이 아닌 직책으로 이전됨. position 은 access 토큰 클레임에서 도출(hooks 가 CurrentUser 에 합성)
 */
export function hasRootAuthority(
  subject:
    | CurrentUser
    | { role?: UserRole; position?: OrgPosition | null }
    | null
    | undefined,
): boolean {
  if (!subject) return false;
  if (isRoot(subject)) return true;
  return (subject as { position?: OrgPosition | null }).position === OrgPosition.Representative;
}

/**
 * 조직 관리(조직도/사용자/권한/AI도구) 가능 판정: 루트 권한자(ROOT/대표) 또는 시스템관리 권한 보유
 * 백엔드 인가(resolveOrgManagementOrgId)와 동형: UI 가시성과 서버 집행을 일치시킨다.
 */
export function canManageOrg(
  subject:
    | CurrentUser
    | { role?: UserRole; permissions?: PermissionKey[]; position?: OrgPosition | null }
    | null
    | undefined,
): boolean {
  if (!subject) return false;
  if (hasRootAuthority(subject)) return true;
  return subject.permissions?.includes(PermissionKey.SystemManagement) ?? false;
}

/**
 * AI 어시스턴트 사용 가능 판정: AI 어시스턴트(챗봇)는 기본 제공 도구라 별도 엔타이틀먼트(aiTools)
 * 없이 인증된 조직 유저 누구나 쓸 수 있다. 이 정책의 단일 출처(SSOT): 시각 노출(SubAppBar 챗봇 버튼)과
 * 서버 집행(팝아웃 진입 가드 / ai-chat BFF)이 모두 이 헬퍼를 공유한다. 다시 엔타이틀먼트로 잠그려면
 * 여기 한 곳만 고치면 세 지점이 함께 바뀐다. 미인증(null)은 불가
 */
export function canUseAiAssistant(
  subject: JwtPayload | CurrentUser | { role?: UserRole } | null | undefined,
): boolean {
  return !!subject;
}
