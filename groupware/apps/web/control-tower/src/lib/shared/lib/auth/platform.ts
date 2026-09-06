import type { JwtPayload } from '$lib/shared/lib/utils/authTokenUtils';
import type { CurrentUser } from '$lib/shared/types/common.types';

/**
 * 플랫폼 관리자 판정: 멀티테넌시
 * PLATFORM 조직의 ROOT/ADMIN 만 control-tower(플랫폼 운영사)에 접근할 수 있다.
 * 토큰 클레임(organizationType) 또는 CurrentUser(organization.type) 양쪽 모두 지원
 */
export function isPlatformAdmin(subject: JwtPayload | CurrentUser | null | undefined): boolean {
  if (!subject) return false;
  const role = (subject as { role?: string }).role;
  const orgType =
    (subject as JwtPayload).organizationType ??
    (subject as CurrentUser).organization?.type;
  return orgType === 'PLATFORM' && (role === 'ROOT' || role === 'ADMIN');
}

/**
 * 플랫폼 ROOT 판정: 플랫폼 관리자(ADMIN) 추가/삭제, 옵션 부여는 ROOT 만 가능
 * (관리자 관리 영역 enforcement 의 기준)
 */
export function isPlatformRoot(subject: JwtPayload | CurrentUser | null | undefined): boolean {
  return isPlatformAdmin(subject) && (subject as { role?: string }).role === 'ROOT';
}

/**
 * 플랫폼 관리 영역 옵션 보유 판정: ROOT 는 전체 보유, ADMIN 은 부여된 옵션(adminFeatures)만
 * 사이드바/페이지 접근 차단(enforcement)에 사용
 */
export function hasAdminFeature(
  subject: JwtPayload | CurrentUser | null | undefined,
  featureKey: string,
): boolean {
  if (!isPlatformAdmin(subject)) return false;
  if ((subject as { role?: string }).role === 'ROOT') return true;
  const features = (subject as { adminFeatures?: string[] }).adminFeatures ?? [];
  return features.includes(featureKey);
}
