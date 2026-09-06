// 스토리지 서비스: 컴포넌트는 이 객체 하나만 import 한다(쿼리/뮤테이션/헬퍼를 직접 뒤지지 않는다)
import * as api from '../apis/storageApi';
import {
  storageKeys,
  storageListingQueryOptions,
  storageUsageQueryOptions
} from '../queries/storage.query';
import {
  purgeItemsMutationOptions,
  renameFileMutationOptions,
  restoreItemsMutationOptions,
  trashItemsMutationOptions
} from '../mutations/storage.mutations';

export const storageService = {
  keys: storageKeys,
  listingQueryOptions: storageListingQueryOptions,
  usageQueryOptions: storageUsageQueryOptions,
  renameFileMutationOptions,
  trashItemsMutationOptions,
  restoreItemsMutationOptions,
  purgeItemsMutationOptions,
  presignRouteFor: api.presignRouteFor,
  confirmUpload: api.confirmUpload,
  discardUpload: api.discardUpload,
  downloadHref: api.downloadHref
};
