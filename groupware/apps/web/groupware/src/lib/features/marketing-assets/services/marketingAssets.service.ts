// 조직 자산 서비스: 컴포넌트는 이 service 만 호출. (목록은 SSR +page.server.)
import * as mutations from '../mutations/marketingAssets.mutations';

export const marketingAssetsService = {
  uploadAsset: mutations.uploadAsset,
  updateAsset: mutations.updateAsset,
  removeAsset: mutations.removeAsset,
  createSet: mutations.createSet,
  renameSet: mutations.renameSet,
  saveSetStyle: mutations.saveSetStyle,
  removeSet: mutations.removeSet,
  uploadSetSlot: mutations.uploadSetSlot,
  clearSetSlot: mutations.clearSetSlot,
};
