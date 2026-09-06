// 저장된 기획안 데이터 접근(브라우저): 개인 워크스페이스 목록/생성/삭제 + 씬 이미지 업로드
// 목록/생성/삭제는 같은 origin BFF(/api/marketing/saved-plans)를 frontClient 로 호출
// 씬 이미지는 base64 dataUrl → Blob 으로 바꿔 공용 업로드 시퀀스(infrastructure/http/upload)에 넘긴다.
import { frontClient } from '$lib/infrastructure/http/clientInstances';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import { uploadBlob } from '$lib/infrastructure/http/upload';
import type { AudioRef, ConceptChoice, PlanScene, SavedPlan, SavedSceneImageRef } from '../types';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import { run, type ApiResult } from './result';
import { scopeQuery, versionQuery } from './versionQuery';

/** 내 개인 저장본 목록(최신순) */
/** 개인 워크스페이스 저장본 목록: 워크스페이스는 채널별로 분리되므로 channelId 가 필수다. */
export function listSavedPlans(
  version: VersionMode,
  channelId: number,
): Promise<ApiResult<SavedPlan[]>> {
  return run<SavedPlan[]>(() =>
    frontClient().GET(`${ROUTES.MARKETING.SAVED_PLANS}?${scopeQuery(version, channelId)}`),
  );
}

export interface CreateSavedPlanInput {
  channelId: number | null;
  brandName: string;
  // 멱등키: 같은 값으로 다시 저장하면 새 행이 아니라 먼저 저장된 행이 돌아온다.
  clientRequestId?: string;
  // 이 기획안을 만들 때 쓴 연출 축 조합. 나중에 씬 이미지를 같은 화풍으로 다시 만들기 위한 스냅샷
  brandConcepts: ConceptChoice[];
  // 이 기획안을 실제로 쓴 기획 LLM(생성 응답이 돌려준 값). 필수다.
  //
  // 선택으로 두지 않는 이유: 빠지면 서버가 400 으로 막고 화면이 그 사실을 알린다. 선택이면 조용히
  // 빈 값이 저장되고, 원장은 그 기획안을 "모델 모름" 으로 말한다(그 값은 나중에 되메울 수 없다)
  llmModel: string;
  // 이 기획안을 만들 때 고른 영상 모델(설정과 다를 수 있다). 없으면 서버가 설정을 본다.
  videoModel?: string;
  // 세그먼트 연결 방식. 없으면 렌더 기본(순차)
  segmentMode?: string;
  title: string;
  summary: string;
  scenes: PlanScene[];
  sceneImages: SavedSceneImageRef[];
  // 기획안 전체 BGM(선택 시점 스냅샷): 없으면 null. 씬 효과음은 scenes[].sfx 로 함께 저장된다.
  bgm: AudioRef | null;
}

/** 개인 저장(자동, 누적) */
export function createSavedPlan(
  version: VersionMode,
  input: CreateSavedPlanInput,
): Promise<ApiResult<SavedPlan>> {
  return run<SavedPlan>(() =>
    frontClient().POST(`${ROUTES.MARKETING.SAVED_PLANS}?${versionQuery(version)}`, input),
  );
}

/** 내 개인 저장본 삭제(멱등) */
export function deleteSavedPlan(version: VersionMode, id: number): Promise<ApiResult<void>> {
  return run<void>(() =>
    frontClient().DELETE(`${ROUTES.MARKETING.SAVED_PLANS}/${id}?${versionQuery(version)}`),
  );
}

/** 저장본 씬 편집 입력: 준 것만 반영(브리프 수정 / 이미지 교체) */
export interface UpdateSavedSceneInput {
  // 새 이미지 uploadId(재생성/외부). 이미지를 안 바꾸면 생략
  uploadId?: string;
  // 재생성 시 조립된 최종 프롬프트. 외부 이미지엔 생략
  prompt?: string;
  // 씬 영어 브리프(imagePrompt) 수정값. 안 바꾸면 생략
  imagePrompt?: string;
}

/** 저장본 한 씬 편집: PATCH /saved-plans/:id/scenes/:index. 갱신된 저장본을 돌려받는다. */
export function updateSavedPlanScene(
  version: VersionMode,
  id: number,
  index: number,
  input: UpdateSavedSceneInput,
): Promise<ApiResult<SavedPlan>> {
  return run<SavedPlan>(() =>
    frontClient().PATCH(
      `${ROUTES.MARKETING.SAVED_PLANS}/${id}/scenes/${index}?${versionQuery(version)}`,
      input,
    ),
  );
}

// 씬 이미지 업로드

/**
 * 씬 base64 이미지 → file-upload 업로드 → uploadId. 접근 URL 은 저장하지 않는다(조회 시 BFF 가 재구성)
 * presign 라우트(SAVED_PLAN_IMAGE)가 partition=`{orgId}/marketing-video/personal/{userId}` 를 서버에서 주입한다.
 *
 * dataUrl → Blob 변환은 네이티브 디코드(fetch)에 맡긴다. 수동 atob + 바이트 루프는 이미지당 ~1M 회
 * 메인스레드 반복 + 중간 문자열 사본을 만든다.
 */
export async function uploadPlanSceneImage(dataUrl: string, fileName: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const { uploadId } = await uploadBlob(
    ROUTES.MARKETING.SAVED_PLAN_IMAGE,
    blob,
    fileName,
    blob.type || 'image/png', // 씬 이미지는 우리가 만든 PNG data URL 이라 blob.type 이 곧 실효 MIME.
    // 확인(PENDING → UPLOADED)은 저장을 처리하는 csc-marketing 이 한다. 저장이 실패하면(예: 그 사이
    //   채널이 삭제돼 FK 위반) 이 자산은 PENDING 으로 남아 수거되고, 참조 없는 UPLOADED 가 생기지 않는다.
    { confirm: false },
  );
  return uploadId;
}
