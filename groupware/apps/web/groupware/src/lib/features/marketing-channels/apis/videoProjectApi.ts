// 영상 프로젝트 데이터 접근(브라우저): 개인 워크스페이스 목록/생성/조회/재렌더/삭제
// 모두 같은 origin BFF(/api/marketing/video-projects)를 frontClient 로 호출(백엔드 직접 호출 금지)
import { frontClient } from '$lib/infrastructure/http/clientInstances';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import { uploadBlob } from '$lib/infrastructure/http/upload';
import type { VideoProject } from '../types';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import { run, type ApiResult } from './result';
import { scopeQuery, versionQuery } from './versionQuery';

/** 개인 워크스페이스 원천 영상 목록: 워크스페이스는 채널별로 분리되므로 channelId 가 필수다. */
export function listVideoProjects(
  version: VersionMode,
  channelId: number,
): Promise<ApiResult<VideoProject[]>> {
  return run<VideoProject[]>(() =>
    frontClient().GET(`${ROUTES.MARKETING.VIDEO_PROJECTS}?${scopeQuery(version, channelId)}`),
  );
}

/** 저장 기획안을 스냅샷해 영상 프로젝트 생성 + 렌더 잡 등록 */
export function createVideoProject(
  version: VersionMode,
  savedPlanId: number,
  // 원천 영상 화질(모델이 지원할 때만). 미지정이면 서버 기본값
  resolution?: string,
  // 멱등키: 이 클릭 한 번을 식별한다. 재시도가 같은 값을 보내면 렌더 잡이 두 번 만들어지지 않는다.
  clientRequestId?: string,
): Promise<ApiResult<VideoProject>> {
  return run<VideoProject>(() =>
    frontClient().POST(`${ROUTES.MARKETING.VIDEO_PROJECTS}?${versionQuery(version)}`, {
      savedPlanId,
      resolution,
      clientRequestId,
    }),
  );
}

/** 저장된 조합 스펙으로 새 렌더 잡 등록(재렌더) */
export function rerenderVideoProject(
  version: VersionMode,
  id: number,
): Promise<ApiResult<VideoProject>> {
  return run<VideoProject>(() =>
    frontClient().POST(
      `${ROUTES.MARKETING.VIDEO_PROJECTS}/${id}/render?${versionQuery(version)}`,
      {},
    ),
  );
}

/**
 * 세그먼트 하나만 다시 만들기. 나머지 세그먼트는 이미 만든 것을 그대로 쓴다.
 *
 * `visualPrompt` 를 주면 그 세그먼트의 화면 묘사를 바꾼 뒤 만든다(없으면 원래 묘사 그대로)
 */
export function rerenderVideoProjectSegment(
  version: VersionMode,
  id: number,
  order: number,
  visualPrompt?: string | null,
): Promise<ApiResult<VideoProject>> {
  return run<VideoProject>(() =>
    frontClient().POST(
      `${ROUTES.MARKETING.VIDEO_PROJECTS}/${id}/segments/${order}/render?${versionQuery(version)}`,
      { visualPrompt: visualPrompt ?? null },
    ),
  );
}

// 대표 썸네일

/**
 * 브라우저가 만든 썸네일 PNG → file-upload 업로드 → uploadId. 접근 URL 은 저장하지 않는다(조회 시 재구성)
 *
 * 확인(PENDING → UPLOADED)은 이 자산을 참조할 행을 고치는 csc-marketing 이 한다. 붙이기가 실패하면
 * 이 자산은 PENDING 으로 남아 수거되고, 참조 없는 UPLOADED 가 생기지 않는다.
 */
export async function uploadVideoThumbnail(blob: Blob): Promise<string> {
  const { uploadId } = await uploadBlob(
    ROUTES.MARKETING.VIDEO_THUMBNAIL_PRESIGN,
    blob,
    // 파일명은 저장소 안에서만 쓰인다(경로는 서버 UUID 다). 사람이 보는 이름은 영상의 제목이다.
    '썸네일.png',
    // 캔버스가 만든 PNG 라 blob.type 이 곧 실효 MIME 이다(파일 선택 경로가 아니다)
    blob.type || 'image/png',
    { confirm: false },
  );
  return uploadId;
}

/**
 * 작업 공간에 배치한다(생성 창의 마지막 단계). 대표 썸네일이 있으면 함께 붙인다.
 *
 * 확정 단계를 가진 버전에서는 이것을 거친 영상만 워크스페이스 목록에 선다.
 */
export function placeVideoProject(
  version: VersionMode,
  id: number,
  thumbnailUploadId?: string,
): Promise<ApiResult<VideoProject>> {
  return run<VideoProject>(() =>
    frontClient().POST(
      `${ROUTES.MARKETING.VIDEO_PROJECTS}/${id}/place?${versionQuery(version)}`,
      thumbnailUploadId ? { thumbnailUploadId } : {},
    ),
  );
}

// 진행 화면 미리보기의 산출물(dev)

/**
 * 미리보기가 병합한 영상 → file-upload 업로드 → uploadId.
 *
 * 썸네일 업로드와 같은 규약이다(확정은 그 자산을 참조할 행을 만드는 서버가 한다). 다른 것은 라우트와
 * MIME 뿐이다: MediaRecorder 가 만든 것이라 대개 webm 이다.
 */
export async function uploadPreviewVideo(blob: Blob): Promise<string> {
  const mimeType = blob.type || 'video/webm';
  const { uploadId } = await uploadBlob(
    ROUTES.MARKETING.VIDEO_PREVIEW_VIDEO_PRESIGN,
    blob,
    // 파일명은 저장소 안에서만 쓰인다(경로는 서버 UUID 다). 사람이 보는 이름은 영상의 제목이다.
    //   확장자는 실제 타입에서 뽑는다: 병합이 실패하면 대역 클립(mp4)이 올라가므로 고정하면 거짓이 된다.
    `미리보기 영상.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`,
    mimeType,
    { confirm: false },
  );
  return uploadId;
}

/** 미리보기 산출물 등록 입력. 렌더가 없으므로 결과물과 그 표시에 필요한 값만 보낸다. */
export interface CreatePreviewProjectInput {
  title: string;
  videoModel: string;
  resultUploadId: string;
  thumbnailUploadId?: string | null;
  clientRequestId?: string;
}

/**
 * 미리보기 산출물을 등록한다(dev 전용: prod 에서는 BFF 가 404 다)
 *
 * 이것이 미리보기에서의 '영상 생성' 이다. 실제 흐름에서는 그 버튼이 이미 있는 행을 배치하지만,
 * 미리보기에는 렌더가 없어 예약된 행도 없다. 그래서 등록과 배치가 한 번에 일어난다.
 */
export function createPreviewProject(
  version: VersionMode,
  channelId: number,
  input: CreatePreviewProjectInput,
): Promise<ApiResult<VideoProject>> {
  return run<VideoProject>(() =>
    frontClient().POST(
      `${ROUTES.MARKETING.VIDEO_PREVIEW}?${scopeQuery(version, channelId)}`,
      input,
    ),
  );
}

/** 내 개인 영상 프로젝트 삭제(멱등) */
export function deleteVideoProject(
  version: VersionMode,
  id: number,
): Promise<ApiResult<void>> {
  return run<void>(() =>
    frontClient().DELETE(`${ROUTES.MARKETING.VIDEO_PROJECTS}/${id}?${versionQuery(version)}`),
  );
}
