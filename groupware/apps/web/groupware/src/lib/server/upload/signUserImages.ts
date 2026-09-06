// 세션 유저 이미지 로드 경계 변환 (SSR 전용): 저장된 uploadId 를 표시용 서명 URL 로 변환한다.
//
// 아바타(본인)와 조직 로고 모두 스토리지는 uploadId(불변)만 저장하고, 표시 URL 은 렌더 시 서명 발급한다.
// (마케팅 영상/컨트롤타워 조직뷰와 동일 패턴). require_signed_download 대비 서명하되 플래그 OFF 면 무해
//   profileImageUrl       → 아바타 표시용 서명 URL
//   profileImageUploadId  → 아바타 원본 uploadId(환경설정 편집 폼 제출/baseline)
//   organization.profileImageUrl → 조직 로고 표시용 서명 URL
import { fileAccessUrl } from './fileUrl';
import type { CurrentUser, Organization } from '$lib/shared/types/common.types';

/** getUser() 결과의 이미지 필드를 표시용으로 변환. admin/tool 레이아웃 + 환경설정 로드가 공유 */
export function signUserImages(user: Pick<CurrentUser, 'profileImageUrl' | 'organization'>): {
  profileImageUrl: string | null;
  profileImageUploadId: string | null;
  organization: Organization | undefined;
} {
  return {
    profileImageUrl: fileAccessUrl(user.profileImageUrl),
    profileImageUploadId: user.profileImageUrl ?? null,
    organization: user.organization
      ? { ...user.organization, profileImageUrl: fileAccessUrl(user.organization.profileImageUrl) }
      : user.organization,
  };
}
