// 채널관리 서비스: 컴포넌트는 이 서비스만 참조한다.
// TanStack Query 옵션(조회/변경)을 노출하고, 컴포넌트가 createQuery/createMutation 으로 소비한다.
// 채널 CRUD/순서/진입채널 + 포커스 키워드 후보 검색 + 채널 설정(기획프롬프트) + 개인 설정(AI모델/브랜드컨셉)
// + 기획안/원천영상/최종영상 산출물
import { channelsQueryOptions } from '../queries/channels.query';
import { suggestKeywordsMutationOptions } from '../mutations/focusKeywords.mutations';
import { brandConceptCatalogQueryOptions } from '../queries/brandConceptCatalog.query';
import { myBrandConceptQueryOptions } from '../queries/brandConcept.query';
import {
  setMyBrandConceptSetMutationOptions,
  setMyBrandConceptMutationOptions,
} from '../mutations/brandConcept.mutations';
import { myAiModelQueryOptions } from '../queries/aiModel.query';
import { setMyAiModelMutationOptions } from '../mutations/aiModel.mutations';
import { setMyEntryVersionMutationOptions } from '../mutations/entryVersion.mutations';
import { setMyDefaultChannelMutationOptions } from '../mutations/defaultChannel.mutations';
import { myDefaultChannelQueryOptions } from '../queries/defaultChannel.query';
import { generatePlansQueryOptions } from '../queries/plans.query';
import { generateSceneImage } from '../apis/planApi';
import { imageEngineLoadQueryOptions } from '../queries/imageEngineLoad.query';
import { planPromptQueryOptions } from '../queries/planPrompt.query';
import { setPlanPromptMutationOptions } from '../mutations/planPrompt.mutations';
import { savedPlansQueryOptions } from '../queries/savedPlans.query';
import {
  saveSavedPlanMutationOptions,
  deleteSavedPlanMutationOptions,
  updateSavedPlanSceneMutationOptions
} from '../mutations/savedPlans.mutations';
import { videoProjectsQueryOptions } from '../queries/videoProjects.query';
import {
  createVideoProjectMutationOptions,
  rerenderVideoProjectMutationOptions,
  rerenderVideoProjectSegmentMutationOptions,
  placeVideoProjectMutationOptions,
  createPreviewProjectMutationOptions,
  deleteVideoProjectMutationOptions
} from '../mutations/videoProjects.mutations';
import { videoFinalsQueryOptions } from '../queries/videoFinals.query';
import {
  createVideoFinalMutationOptions,
  rerenderVideoFinalMutationOptions,
  deleteVideoFinalMutationOptions
} from '../mutations/videoFinals.mutations';
import { videoArchiveQueryOptions } from '../queries/videoArchive.query';
import {
  archiveVideoMutationOptions,
  unarchiveVideoMutationOptions,
  deleteArchivedVideoMutationOptions
} from '../mutations/videoArchive.mutations';
import {
  createChannelMutationOptions,
  updateChannelMutationOptions,
  deleteChannelMutationOptions,
  reorderChannelMutationOptions
} from '../mutations/channels.mutations';

export const marketingChannelsService = {
  channelsQueryOptions,
  suggestKeywordsMutationOptions,
  brandConceptCatalogQueryOptions,
  myBrandConceptQueryOptions,
  setMyBrandConceptMutationOptions,
  setMyBrandConceptSetMutationOptions,
  myAiModelQueryOptions,
  setMyAiModelMutationOptions,
  setMyEntryVersionMutationOptions,
  generatePlansQueryOptions,
  generateSceneImage,
  imageEngineLoadQueryOptions,
  planPromptQueryOptions,
  setPlanPromptMutationOptions,
  savedPlansQueryOptions,
  saveSavedPlanMutationOptions,
  deleteSavedPlanMutationOptions,
  updateSavedPlanSceneMutationOptions,
  videoProjectsQueryOptions,
  createVideoProjectMutationOptions,
  rerenderVideoProjectMutationOptions,
  rerenderVideoProjectSegmentMutationOptions,
  placeVideoProjectMutationOptions,
  createPreviewProjectMutationOptions,
  deleteVideoProjectMutationOptions,
  videoFinalsQueryOptions,
  createVideoFinalMutationOptions,
  rerenderVideoFinalMutationOptions,
  deleteVideoFinalMutationOptions,
  videoArchiveQueryOptions,
  archiveVideoMutationOptions,
  unarchiveVideoMutationOptions,
  deleteArchivedVideoMutationOptions,
  createChannelMutationOptions,
  updateChannelMutationOptions,
  deleteChannelMutationOptions,
  reorderChannelMutationOptions,
  setMyDefaultChannelMutationOptions,
  myDefaultChannelQueryOptions,
};
