// file-upload 공개 접근 URL 재구성: uploadId → {PUBLIC 베이스}/files/{uploadId}(+ 서명 토큰)
//   스토리지 비종속(uploadId 만 저장, URL 은 조회 시 재구성). require_signed_download 대비 서명 발급
//   플래그 OFF 면 토큰은 무시되어 무해(signFileUrl 이 append-only + fail-open)
import { env } from '$env/dynamic/public';
import { signFileUrl } from './signDownload';

/** file-upload 공개 베이스(= file-upload PUBLIC_UPLOAD_BASE_URL). dev 폴백 = 8001. */
function uploadBase(): string {
  return (env.PUBLIC_VITE_FILE_UPLOAD_API_URL ?? 'http://localhost:8001').replace(/\/+$/, '');
}

/** uploadId → 브라우저 표시용 서명 접근 URL. uploadId 없으면 null. */
export function fileAccessUrl(uploadId: string | null | undefined): string | null {
  if (!uploadId) return null;
  return signFileUrl(`${uploadBase()}/files/${encodeURIComponent(uploadId)}`);
}
