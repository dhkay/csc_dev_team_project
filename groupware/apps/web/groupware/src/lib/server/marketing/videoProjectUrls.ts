// 영상 프로젝트 BFF 공용: uploadId → 브라우저 접근 URL 재구성(스토리지/도메인 비종속)
// 백엔드는 uploadId 만 저장하고, 조회 때마다 현재 공개 베이스로 URL 을 붙인다(저장 URL stale 없음)
import { env } from '$env/dynamic/public';
import { signFileUrl } from '$lib/server/upload/signDownload';

/** file-upload 공개 베이스(= file-upload PUBLIC_UPLOAD_BASE_URL). dev 폴백 = 8001. */
function uploadBase(): string {
  return (env.PUBLIC_VITE_FILE_UPLOAD_API_URL ?? 'http://localhost:8001').replace(/\/+$/, '');
}

interface RawScene {
  imageUploadId?: string;
  [k: string]: unknown;
}

/** 백엔드가 보고한 세그먼트(raw): 클립 uploadId 만 관심(나머지는 그대로 통과) */
interface RawSegment {
  clipUploadId?: string | null;
  [k: string]: unknown;
}

/**
 * 백엔드 영상 프로젝트(raw): 주소로 바꿀 값들만 관심(나머지는 그대로 통과). BFF 라우트가 공유한다.
 */
export interface RawVideoProject {
  resultUploadId?: string | null;
  // 사람이 붙인 대표 썸네일. 있으면 카드 그림이 첫 씬 이미지 대신 이것이 된다.
  thumbnailUploadId?: string | null;
  scenes?: RawScene[];
  segments?: RawSegment[] | null;
  [k: string]: unknown;
}

/**
 * 영상 프로젝트에 thumbnailUrl(카드 그림) + resultUrl(완성 영상) + 세그먼트별 clipUrl 을 붙인다.
 * 요청 때마다 최신 베이스로 재구성하므로 저장된 URL 이 stale 될 여지가 없다.
 *
 * 카드 그림은 사람이 붙인 썸네일이 먼저다. 없으면 첫 씬 이미지로 떨어진다. 사람이 결과 화면에서
 * 프레임을 고르고 문구를 얹은 것이 자동으로 뽑힌 첫 장면보다 그 사람의 의도에 가깝기 때문이고,
 * 씬 이미지를 만들지 않는 버전에서는 그 썸네일이 이 카드의 유일한 그림이다.
 */
export function withVideoProjectUrls<T extends RawVideoProject>(project: T) {
  const base = uploadBase();
  const firstUploadId = project.scenes?.[0]?.imageUploadId;
  const fileUrl = (uploadId: string | null | undefined): string | null =>
    // 조직 스코프 접근통제(require_signed_download) 대비 서명 URL 로 발급: 플래그 OFF 면 토큰은 무시(무해)
    uploadId ? signFileUrl(`${base}/files/${uploadId}`) : null;
  return {
    ...project,
    thumbnailUrl: fileUrl(project.thumbnailUploadId ?? firstUploadId),
    resultUrl: fileUrl(project.resultUploadId),
    // 세그먼트 클립도 같은 규칙으로 재구성한다. 진행 화면이 만들어진 칸을 그 자리에서 재생한다.
    segments:
      project.segments?.map((s) => ({ ...s, clipUrl: fileUrl(s.clipUploadId) })) ?? null,
  };
}
