// 조직 로드 경계 뷰 변환 (SSR 전용): 백엔드가 준 로고 uploadId 를 표시용 서명 URL 로 변환한다.
//
// 스토리지는 uploadId(불변)만 저장하고, 브라우저 표시 URL 은 렌더 시 서명 발급한다(마케팅 영상과 동일 패턴)
// require_signed_download 대비 서명 URL 을 내려주되, 플래그 OFF 면 토큰은 무시되어 무해하다.
//   profileImageUrl       → 표시용 서명 URL(uploadId → /files/{id}?token=…)
//   profileImageUploadId  → 원본 uploadId(편집 폼 제출/baseline)
import { fileAccessUrl } from '$lib/server/upload/fileUrl';

/** 백엔드 조직 요약(profileImageUrl=uploadId)을 표시용으로 변환. 목록/상세 로드가 공유 */
export function withOrgLogoUrl<T extends { profileImageUrl?: string | null }>(
  org: T,
): T & { profileImageUploadId: string | null } {
  const uploadId = org.profileImageUrl ?? null;
  return {
    ...org,
    profileImageUploadId: uploadId,
    profileImageUrl: uploadId ? fileAccessUrl(uploadId) : null,
  };
}
