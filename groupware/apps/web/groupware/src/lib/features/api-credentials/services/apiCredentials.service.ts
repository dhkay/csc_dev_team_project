// 공용 API 자격증명 서비스: 컴포넌트가 소비하는 단일 진입점(query/mutation 옵션 조합)
import {
  apiCredentialsQueryOptions,
  configuredProvidersQueryOptions
} from '../queries/apiCredentials.query';
import {
  saveApiCredentialMutationOptions,
  deleteApiCredentialMutationOptions
} from '../mutations/apiCredentials.mutations';

export const apiCredentialsService = {
  listOptions: apiCredentialsQueryOptions,
  configuredProvidersOptions: configuredProvidersQueryOptions,
  saveOptions: saveApiCredentialMutationOptions,
  deleteOptions: deleteApiCredentialMutationOptions
};
