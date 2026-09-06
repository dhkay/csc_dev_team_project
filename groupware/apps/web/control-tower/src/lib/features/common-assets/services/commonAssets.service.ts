// 공통 에셋 비즈니스 로직: mutations 를 조합한다. 컴포넌트는 이 service 만 호출한다.
//   (목록 조회는 SSR server load 에서 serverMarketingClient 로 직접: 브라우저 read 레인 불필요.)
import * as mutations from '../mutations/commonAsset.mutations';

export const commonAssetsService = {
  upload: mutations.uploadCommonAsset,
  update: mutations.updateCommonAsset,
  remove: mutations.removeCommonAsset,
};
