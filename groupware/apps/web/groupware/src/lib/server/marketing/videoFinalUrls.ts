// 최종 영상 BFF 공용: uploadId → 브라우저 접근 URL 재구성(스토리지/도메인 비종속)
// 백엔드는 uploadId 만 저장하고, 조회 때마다 현재 공개 베이스로 URL 을 붙인다(저장 URL stale 없음)
import { env } from '$env/dynamic/public';
import { signFileUrl } from '$lib/server/upload/signDownload';

/** file-upload 공개 베이스(= file-upload PUBLIC_UPLOAD_BASE_URL). dev 폴백 = 8001. */
function uploadBase(): string {
  return (env.PUBLIC_VITE_FILE_UPLOAD_API_URL ?? 'http://localhost:8001').replace(/\/+$/, '');
}

/** 백엔드 최종 영상(raw): 결과물 uploadId 만 관심(나머지는 그대로 통과). BFF 라우트가 공유 */
export interface RawVideoFinal {
  resultUploadId?: string | null;
  [k: string]: unknown;
}

/**
 * 최종 영상에 resultUrl(완성 영상)을 붙이고 thumbnailUrl 자리를 채운다.
 *
 * 최종 영상에는 대표 그림이 없다. 이 표에는 그 컬럼이 아예 없고(`thumbnail_upload_id` 는 원천
 * 표의 것이다) 만들어지는 경로도 하나뿐이라(세트 합성) 그림이 생길 자리가 없다. 그래서 값은 늘
 * null 이고, 카드가 완성본을 `<video>` 로 인라인 재생하므로 그림 없이도 화면이 성립한다.
 *
 * 자리를 그래도 채우는 이유: 카드가 두 산출물을 같은 형태로 그린다(`VideoCard`). 빼면 그리드가
 * 종류를 알아야 한다.
 *
 * 저장하는 것은 uploadId 뿐이고 주소는 요청 때마다 최신 베이스로 재구성한다(스토리지 비종속)
 */
export function withVideoFinalUrls<T extends RawVideoFinal>(final: T) {
  const base = uploadBase();
  // 조직 스코프 접근통제(require_signed_download) 대비 서명 URL 로 발급: 플래그 OFF 면 토큰은 무시(무해)
  return {
    ...final,
    thumbnailUrl: null,
    resultUrl: final.resultUploadId ? signFileUrl(`${base}/files/${final.resultUploadId}`) : null,
  };
}
