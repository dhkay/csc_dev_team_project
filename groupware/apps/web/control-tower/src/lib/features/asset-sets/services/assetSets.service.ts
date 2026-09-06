// 에셋 세트 비즈니스 로직: mutations 조합. 컴포넌트는 이 service 만 호출
//   (목록 조회는 SSR server load 에서 serverMarketingClient 로 직접.)
import * as mutations from '../mutations/assetSet.mutations';

export const assetSetsService = {
  create: mutations.createAssetSet,
  update: mutations.updateAssetSet,
  remove: mutations.deleteAssetSet,
  uploadSlot: mutations.uploadSetSlot,
  clearSlot: mutations.clearSetSlot,
};
