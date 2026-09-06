// 저장된 기획안 변경 레이어: 자동 저장(씬 이미지 업로드 + 생성) / 삭제(낙관적). 성공 시 목록 invalidate.
import type { QueryClient } from '@tanstack/svelte-query';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import * as api from '../apis/savedPlanApi';
import type {
  ConceptChoice,
  PlanProposal,
  SavedPlan,
  SavedSceneImageRef,
  SceneImageState,
} from '../types';
import { savedPlansKeys } from '../queries/savedPlans.query';

/**
 * 저장본 한 씬 편집: 이미지 교체(재생성/외부, dataUrl 있으면 업로드 후 uploadId 로) + 브리프/프롬프트 수정
 * dataUrl 이 있으면 file-upload 에 먼저 올려 uploadId 를 얻고, 그 뒤 씬을 PATCH 한다(참조만 갱신)
 */
export interface UpdateSavedSceneVars {
  planId: number;
  index: number;
  // 새 이미지(재생성 결과 또는 외부 파일의 data URL). 이미지를 안 바꾸면 생략
  dataUrl?: string;
  // 재생성 시 조립된 최종 프롬프트(외부 이미지엔 생략)
  prompt?: string;
  // 씬 영어 브리프 수정값. 안 바꾸면 생략
  imagePrompt?: string;
}

export function updateSavedPlanSceneMutationOptions(queryClient: QueryClient, version: VersionMode,
  channelId: number) {
  return {
    meta: { errorTitle: '기획안 수정에 실패했습니다' },
    mutationFn: async (vars: UpdateSavedSceneVars): Promise<SavedPlan> => {
      const uploadId = vars.dataUrl
        ? await api.uploadPlanSceneImage(vars.dataUrl, `scene-${vars.index}.png`)
        : undefined;
      const res = await api.updateSavedPlanScene(version, vars.planId, vars.index, {
        ...(uploadId ? { uploadId } : {}),
        ...(vars.prompt !== undefined ? { prompt: vars.prompt } : {}),
        ...(vars.imagePrompt !== undefined ? { imagePrompt: vars.imagePrompt } : {}),
      });
      if (!res.success) throw new Error(res.error ?? '씬 수정에 실패했습니다.');
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: savedPlansKeys.list(version, channelId) });
    },
  };
}

export interface SavePlanVars {
  channelId: number | null;
  brandName: string;
  // 이 기획안을 만들 때 쓴 연출 축 조합. 브랜드 이름만 저장하면 재현되지 않는다: 기획서 생성 모달에서
  // 조합을 바꿔 뽑을 수 있고 그 변경은 세트에 남지 않으므로, 나중에 씬 이미지를 다시 만들 때
  // 세트의 현재 조합을 쓰게 되어 처음 만든 그림과 화풍이 어긋난다.
  brandConcepts: ConceptChoice[];
  // 이 기획안을 만들 때 고른 영상 모델(설정과 다를 수 있다). 빈 문자열이면 보내지 않고, 나중에
  // 영상을 만들 때 서버가 그때의 설정을 본다.
  videoModel?: string;
  // 이 기획안을 만들 때 고른 세그먼트 연결 방식. 없으면 렌더 기본(순차)
  segmentMode?: string;
  // 멱등키: 자동 저장은 기획안 하나당 정확히 한 번이라 결정적 값(`배치:기획안`)을 쓴다.
  // 실패 알림의 '다시 저장' 이 업로드부터 전체를 재실행해도, 이 키가 같아서 같은 행을 집는다.
  clientRequestId?: string;
  // 이 기획안을 만들 때 실제로 부른 기획 LLM 모델 key(생성 응답이 말한 값)
  //
  // 선택이 아니라 필수다. 없으면 서버가 400 으로 거절하고 그 실패가 우하단 알림에 뜬다.
  // 저장 시점 설정을 다시 읽어 계산하면 생성 후 설정을 바꿨을 때 쓰지 않은 모델이 원장에 남는다.
  llmModel: string;
  proposal: PlanProposal;
  // 씬 인덱스별 이미지 상태(완성 base64): done 인 씬만 업로드한다.
  images: Record<number, SceneImageState>;
}

/**
 * 개인 저장(자동): 완성(done) 씬 이미지를 file-upload 로 업로드(→uploadId,url)한 뒤 기획안을 저장
 * 이미지가 하나도 완성되지 않았어도 텍스트 기획안은 저장한다. 성공 시 목록 invalidate → 그리드 반영
 */
export function saveSavedPlanMutationOptions(queryClient: QueryClient, version: VersionMode,
  channelId: number) {
  return {
    // 이 실패는 되돌릴 수 없다. 이미지가 브라우저 메모리에만 있어 탭을 닫으면 사라진다.
    //   그래서 알림에 재시도를 붙인다(다른 뮤테이션은 화면 버튼을 다시 누르면 된다)
    meta: { errorTitle: '기획안 저장에 실패했습니다', retryLabel: '다시 저장' },
    mutationFn: async (vars: SavePlanVars): Promise<SavedPlan> => {
      // prompt = 이 이미지를 만든 최종 프롬프트(생성 시점): 저장본 상세의 '프롬프트 보기'가 이걸 띄운다.
      //   생성 시점 값을 그대로 보관해야 이후 브랜드/컨셉이 바뀌어도 "이 이미지가 무엇으로 만들어졌는지"가 남는다.
      const uploads: { index: number; dataUrl: string; prompt?: string }[] = [];
      for (const scene of vars.proposal.scenes) {
        const st = vars.images[scene.index];
        if (st?.status === 'done' && st.dataUrl) {
          uploads.push({ index: scene.index, dataUrl: st.dataUrl, prompt: st.prompt });
        }
      }
      // 씬마다 presign→PUT→confirm 3왕복이고 서로 독립이라 동시에 올린다(직렬이면 씬 개수만큼 대기가 누적)
      // 동시 수는 기획안당 씬 개수 상한(8)이 구조적으로 묶고, 결과 순서는 Promise.all 이 보존한다.
      const sceneImages: SavedSceneImageRef[] = await Promise.all(
        uploads.map(async ({ index, dataUrl, prompt }) => ({
          index,
          uploadId: await api.uploadPlanSceneImage(dataUrl, `scene-${index}.png`),
          ...(prompt ? { prompt } : {}),
        })),
      );
      const res = await api.createSavedPlan(version, {
        channelId: vars.channelId,
        brandName: vars.brandName,
        brandConcepts: vars.brandConcepts,
        ...(vars.videoModel ? { videoModel: vars.videoModel } : {}),
        ...(vars.segmentMode ? { segmentMode: vars.segmentMode } : {}),
        ...(vars.clientRequestId ? { clientRequestId: vars.clientRequestId } : {}),
        llmModel: vars.llmModel,
        title: vars.proposal.title,
        summary: vars.proposal.summary,
        scenes: vars.proposal.scenes, // 씬 효과음(sfx)이 씬에 실려 함께 저장된다
        sceneImages,
        bgm: vars.proposal.bgm,
      });
      if (!res.success) throw new Error(res.error ?? '기획안 저장에 실패했습니다.');
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: savedPlansKeys.list(version, channelId) });
    },
  };
}

/** 개인 저장본 삭제: 낙관적 제거 후 실패 시 롤백 */
export function deleteSavedPlanMutationOptions(queryClient: QueryClient, version: VersionMode,
  channelId: number) {
  return {
    meta: { errorTitle: '기획안을 삭제하지 못했습니다' },
    mutationFn: async (id: number): Promise<void> => {
      const res = await api.deleteSavedPlan(version, id);
      if (!res.success) throw new Error(res.error ?? '기획안 삭제에 실패했습니다.');
    },
    onMutate: async (id: number): Promise<{ prev?: SavedPlan[] }> => {
      await queryClient.cancelQueries({ queryKey: savedPlansKeys.list(version, channelId) });
      const prev = queryClient.getQueryData<SavedPlan[]>(savedPlansKeys.list(version, channelId));
      if (prev) {
        queryClient.setQueryData<SavedPlan[]>(
          savedPlansKeys.list(version, channelId),
          prev.filter((p) => p.id !== id),
        );
      }
      return { prev };
    },
    onError: (_e: unknown, _id: number, ctx: { prev?: SavedPlan[] } | undefined): void => {
      if (ctx?.prev) queryClient.setQueryData(savedPlansKeys.list(version, channelId), ctx.prev);
    },
    onSettled: (): void => {
      void queryClient.invalidateQueries({ queryKey: savedPlansKeys.list(version, channelId) });
    },
  };
}
