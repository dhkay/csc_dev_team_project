// file-upload 공개 접근 URL 재구성: uploadId → {PUBLIC 베이스}/files/{uploadId}.
//   스토리지 비종속(uploadId 만 저장, URL 은 조회 시 재구성): groupware videoProjectUrls 와 동형
import { env } from '$env/dynamic/public';
import { signFileUrl } from './signDownload';

/** file-upload 공개 베이스(= file-upload PUBLIC_UPLOAD_BASE_URL). dev 폴백 = 8001. */
function uploadBase(): string {
  return (env.PUBLIC_VITE_FILE_UPLOAD_API_URL ?? 'http://localhost:8001').replace(/\/+$/, '');
}

/** 공통 에셋 등 file-upload 객체의 브라우저 접근 URL(서명: require_signed_download 대비, OFF 면 무해) */
export function fileAccessUrl(uploadId: string): string {
  const url = `${uploadBase()}/files/${encodeURIComponent(uploadId)}`;
  return signFileUrl(url) ?? url;
}
