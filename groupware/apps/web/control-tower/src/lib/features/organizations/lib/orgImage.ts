// 조직 로고 이미지 검증/타입 헬퍼 (순수: 네트워크 없음)
// 업로드 오케스트레이션(presign→PUT→confirm)은 mutations.uploadLogo / apis.orgImageApi 가 담당
// SVG 는 file-upload 가 CSP 로 스크립트 실행을 차단하며 inline 서빙한다.
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** <input accept> 용: .svg 확장자도 명시(일부 환경은 MIME 매칭만으로 SVG 를 못 거름) */
export const IMAGE_ACCEPT = [...ALLOWED_IMAGE_TYPES, '.svg'].join(',');

/**
 * 실효 MIME: 일부 OS/브라우저는 .svg 의 file.type 을 빈 문자열/비표준으로 보고한다.
 * file.type 이 허용 목록이 아니면 확장자로 보정(.svg → image/svg+xml)
 */
export function resolveMime(file: File): string {
  if (file.type && ALLOWED_IMAGE_TYPES.includes(file.type)) return file.type;
  if (file.name.toLowerCase().endsWith('.svg')) return 'image/svg+xml';
  return file.type; // 알 수 없음 → 검증에서 거부
}

/** 업로드 전 클라이언트 검증: 통과하면 null, 실패하면 사용자용 메시지(선택 시점 즉시 검증용) */
export function validateOrgImage(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(resolveMime(file))) {
    return 'JPEG, PNG, GIF, WebP, SVG 이미지만 업로드할 수 있습니다.';
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return '이미지는 10MB 이하만 업로드할 수 있습니다.';
  }
  return null;
}
