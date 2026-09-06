// 변경 로직(쓰기): 본인 프로필 수정 + 프로필 이미지 업로드
import * as accountApi from '../apis/accountApi';
import { uploadBlob } from '$lib/infrastructure/http/upload';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import { validateImageFile, resolveMime } from '$lib/shared/lib/image/imageFile';
import type { UpdateProfileInput } from '../apis/accountApi';

export const updateProfile = (patch: UpdateProfileInput) => accountApi.updateProfile(patch);

/**
 * 프로필 이미지 업로드: 검증 → 공용 업로드 시퀀스(presign→PUT→confirm). uploadId 반환(저장 대상)
 * URL 은 저장하지 않고 렌더 시 서명 발급한다. presign 라우트가 scope='groupware'+partition=orgId 주입
 */
export async function uploadProfileImage(file: File): Promise<string> {
  const invalid = validateImageFile(file);
  if (invalid) throw new Error(invalid);
  const { uploadId } = await uploadBlob(
    ROUTES.FILE_UPLOAD.IMAGE,
    file,
    file.name,
    resolveMime(file), // file.type 이 비거나 비표준일 수 있어 확장자로 보정한 실효 MIME.
  );
  return uploadId;
}
