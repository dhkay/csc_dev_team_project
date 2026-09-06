// 변경 로직(쓰기). apis 를 호출/조합한다.
import * as orgApi from '../apis/organizationsApi';
import * as imageApi from '../apis/orgImageApi';
import { validateOrgImage, resolveMime } from '../lib/orgImage';
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
  ReplaceRootAdminInput,
  UpdateRootAdminInput
} from '../types';

export const createOrganization = (input: CreateOrganizationInput) => orgApi.createOrganization(input);
export const updateOrganization = (id: number, patch: UpdateOrganizationInput) =>
  orgApi.updateOrganization(id, patch);
export const deleteOrganization = (id: number, mode: 'soft' | 'hard') =>
  orgApi.deleteOrganization(id, mode);
export const recoverOrganization = (id: number) => orgApi.recoverOrganization(id);
export const resetRootPassword = (id: number, password: string) =>
  orgApi.resetRootPassword(id, password);
export const updateRootAdmin = (id: number, patch: UpdateRootAdminInput) =>
  orgApi.updateRootAdmin(id, patch);
export const transferRootAdmin = (id: number, userId: number) =>
  orgApi.transferRootAdmin(id, userId);
export const replaceRootAdmin = (id: number, input: ReplaceRootAdminInput) =>
  orgApi.replaceRootAdmin(id, input);

/** 로고 업로드(3-step): 검증 → presign → 바이트 PUT → confirm. uploadId 반환(저장 대상: URL 은 렌더 시 서명 발급). 실패 시 throw. */
export async function uploadLogo(file: File): Promise<string> {
  const invalid = validateOrgImage(file);
  if (invalid) throw new Error(invalid);
  const mimeType = resolveMime(file);
  const { uploadId, presignedUrl } = await imageApi.presign(file.name, mimeType, file.size);
  await imageApi.putBytes(presignedUrl, file, mimeType);
  await imageApi.confirm(uploadId);
  return uploadId;
}
