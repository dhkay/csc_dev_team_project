// 공통 에셋 변경 로직(쓰기): apis 를 조합한다.
import * as api from '../apis/commonAssetsApi';
import {
  COMMON_ASSET_CATEGORY_META,
  type CommonAssetCategory,
  type CommonAssetCategoryMeta,
  type UpdateCommonAssetInput,
} from '../types';

/** 폰트 파일명 → mime 보정: 브라우저가 .ttf/.otf 에 빈 mime 을 주는 경우가 많다. 폰트 아니면 '' */
function fontMimeFromName(name: string): string {
  if (/\.otf$/i.test(name)) return 'font/otf';
  if (/\.ttf$/i.test(name)) return 'font/ttf';
  return '';
}

/** 클라 사전 검증: 크기/종류. 폰트는 mime 이 제각각이라 확장자(.ttf/.otf)로 검사. 통과면 null. */
function validate(file: File, meta: CommonAssetCategoryMeta): string | null {
  if (file.size > meta.maxBytes) {
    return `파일이 너무 큽니다(최대 ${Math.round(meta.maxBytes / 1024 / 1024)}MB).`;
  }
  if (meta.kind === 'font') {
    if (!/\.(ttf|otf)$/i.test(file.name)) return 'TTF/OTF 폰트 파일만 올릴 수 있습니다.';
    return null;
  }
  if (file.type && !file.type.startsWith(`${meta.kind}/`)) {
    return `${meta.kind === 'audio' ? '오디오' : '이미지'} 파일만 올릴 수 있습니다.`;
  }
  return null;
}

/** 업로드(4-step): 검증 → presign → 바이트 PUT → confirm → 메타 등록(표시명 + 태그). 실패 시 throw. */
export async function uploadCommonAsset(
  category: CommonAssetCategory,
  name: string,
  file: File,
  tagIds?: number[],
): Promise<void> {
  const meta = COMMON_ASSET_CATEGORY_META[category];
  const invalid = validate(file, meta);
  if (invalid) throw new Error(invalid);

  // 폰트는 브라우저가 mime 을 비워 보낼 때가 많아 확장자로 보정
  const mimeType = file.type || fontMimeFromName(file.name);
  if (!mimeType) throw new Error('파일 형식을 확인할 수 없습니다.');

  const { uploadId, presignedUrl } = await api.presign(category, file.name, mimeType, file.size);
  await api.putBytes(presignedUrl, file, mimeType);
  await api.confirm(uploadId);

  const created = await api.createCommonAsset({
    category,
    uploadId,
    name: name.trim() || file.name,
    mimeType,
    sizeBytes: file.size,
    ...(tagIds ? { tagIds } : {}),
  });
  if (!created.success) throw new Error(created.error ?? '에셋 등록에 실패했습니다.');
}

/** 표시명 수정. 실패 시 throw. */
export async function updateCommonAsset(id: number, patch: UpdateCommonAssetInput): Promise<void> {
  const res = await api.updateCommonAsset(id, patch);
  if (!res.success) throw new Error(res.error ?? '수정에 실패했습니다.');
}

/** 삭제: 메타 + file-upload 바이트. 실패 시 throw. */
export async function removeCommonAsset(id: number): Promise<void> {
  const res = await api.deleteCommonAsset(id);
  if (!res.success) throw new Error(res.error ?? '삭제에 실패했습니다.');
}
