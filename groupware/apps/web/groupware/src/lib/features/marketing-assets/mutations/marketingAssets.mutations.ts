// 조직 자산 변경 로직(쓰기): apis + 공용 uploadBlob 조합. 실패 시 throw.
import { uploadBlob } from '$lib/infrastructure/http/upload';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import * as api from '../apis/marketingAssetsApi';
import {
  MARKETING_ASSET_CATEGORY_META,
  SET_SLOT_META,
  type AssetCategoryMeta,
  type MarketingAssetCategory,
  type SetOverlays,
  type SetSlot,
} from '../types';

/** 폰트 파일명 → mime 보정: 브라우저가 .ttf/.otf 에 빈 mime 을 주는 경우가 많다. 폰트 아니면 '' */
function fontMimeFromName(name: string): string {
  if (/\.otf$/i.test(name)) return 'font/otf';
  if (/\.ttf$/i.test(name)) return 'font/ttf';
  return '';
}

/** 클라 사전 검증: 크기/종류. 폰트는 mime 이 제각각이라 확장자(.ttf/.otf)로 검사. 통과면 null. */
function validate(file: File, meta: AssetCategoryMeta): string | null {
  if (file.size > meta.maxBytes) {
    return `파일이 너무 큽니다(최대 ${Math.round(meta.maxBytes / 1024 / 1024)}MB).`;
  }
  if (meta.kind === 'font') {
    if (!/\.(ttf|otf)$/i.test(file.name)) return 'TTF/OTF 폰트 파일만 올릴 수 있습니다.';
    return null;
  }
  if (file.type && !file.type.startsWith(`${meta.kind}/`)) {
    const label = meta.kind === 'audio' ? '오디오' : meta.kind === 'video' ? '영상' : '이미지';
    return `${label} 파일만 올릴 수 있습니다.`;
  }
  return null;
}

// 풀 자산
/** 업로드(presign→PUT→confirm) 후 메타 등록. tagIds(카탈로그 태그)는 선택. 실패 시 throw. */
export async function uploadAsset(
  category: MarketingAssetCategory,
  name: string,
  file: File,
  tagIds?: number[],
): Promise<void> {
  const meta = MARKETING_ASSET_CATEGORY_META[category];
  const invalid = validate(file, meta);
  if (invalid) throw new Error(invalid);
  // 폰트는 브라우저가 mime 을 비워 보낼 때가 많아 확장자로 보정
  const mimeType = file.type || fontMimeFromName(file.name);
  if (!mimeType) throw new Error('파일 형식을 확인할 수 없습니다.');

  const { uploadId } = await uploadBlob(
    ROUTES.MARKETING.assetsPresign(category),
    file,
    file.name,
    mimeType,
  );
  const res = await api.createAsset({
    category,
    uploadId,
    name: name.trim() || file.name,
    mimeType,
    sizeBytes: file.size,
    ...(tagIds ? { tagIds } : {}),
  });
  if (!res.success) throw new Error(res.error ?? '자산 등록에 실패했습니다.');
}

/** 표시명 + (선택)태그 수정. 실패 시 throw. */
export async function updateAsset(
  id: number,
  patch: { name?: string; tagIds?: number[] },
): Promise<void> {
  const res = await api.updateAsset(id, patch);
  if (!res.success) throw new Error(res.error ?? '수정에 실패했습니다.');
}
export async function removeAsset(id: number): Promise<void> {
  const res = await api.deleteAsset(id);
  if (!res.success) throw new Error(res.error ?? '삭제에 실패했습니다.');
}

// 세트
/**
 * 세트 생성: 이름 + (선택)프레임/아웃트로 파일을 한 번에. 생성 후 슬롯을 순서대로 업로드
 * 파일은 생성 전에 검증해, 잘못된 파일이 빈 세트를 남기지 않게 한다.
 */
export async function createSet(
  name: string,
  overlays?: SetOverlays | null,
  frameFile?: File | null,
  outroFile?: File | null,
): Promise<void> {
  if (frameFile) {
    const e = validate(frameFile, SET_SLOT_META.frame);
    if (e) throw new Error(e);
  }
  if (outroFile) {
    const e = validate(outroFile, SET_SLOT_META.outro);
    if (e) throw new Error(e);
  }

  const res = await api.createSet(name, overlays);
  if (!res.success) throw new Error(res.error ?? '세트 생성에 실패했습니다.');
  const id = res.data.id;

  if (frameFile) await uploadSetSlot(id, 'frame', frameFile);
  if (outroFile) await uploadSetSlot(id, 'outro', outroFile);
}
export async function renameSet(id: number, name: string): Promise<void> {
  const res = await api.updateSet(id, { name });
  if (!res.success) throw new Error(res.error ?? '세트 수정에 실패했습니다.');
}
/** 구역별 오버레이 스타일(제목/자막 배경색+폰트) 저장. 실패 시 throw. */
export async function saveSetStyle(id: number, overlays: SetOverlays): Promise<void> {
  const res = await api.updateSet(id, { overlays });
  if (!res.success) throw new Error(res.error ?? '스타일 저장에 실패했습니다.');
}
export async function removeSet(id: number): Promise<void> {
  const res = await api.deleteSet(id);
  if (!res.success) throw new Error(res.error ?? '세트 삭제에 실패했습니다.');
}

/** 세트 슬롯 업로드(presign→PUT→confirm→슬롯 지정). 실패 시 throw. */
export async function uploadSetSlot(id: number, slot: SetSlot, file: File): Promise<void> {
  const meta = SET_SLOT_META[slot];
  const invalid = validate(file, meta);
  if (invalid) throw new Error(invalid);
  const mimeType = file.type;
  if (!mimeType) throw new Error('파일 형식을 확인할 수 없습니다.');

  const { uploadId } = await uploadBlob(
    ROUTES.MARKETING.assetSetsPresign(slot),
    file,
    file.name,
    mimeType,
  );
  const res = await api.setSetSlot(id, slot, uploadId);
  if (!res.success) throw new Error(res.error ?? '슬롯 지정에 실패했습니다.');
}
export async function clearSetSlot(id: number, slot: SetSlot): Promise<void> {
  const res = await api.clearSetSlot(id, slot);
  if (!res.success) throw new Error(res.error ?? '슬롯 비우기에 실패했습니다.');
}
