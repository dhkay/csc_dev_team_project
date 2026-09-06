// 에셋 세트 변경 로직(쓰기): apis 를 호출/조합한다. 실패 시 throw.
import * as api from '../apis/assetSetsApi';
import { SET_SLOT_META, type CreateAssetSetInput, type SetSlot, type UpdateAssetSetInput } from '../types';

/**
 * 세트 생성: 이름 + (선택)배경프레임/아웃트로 파일을 한 번에. 생성 후 슬롯을 순서대로 업로드
 * 파일은 생성 전에 검증해, 잘못된 파일이 빈 세트를 남기지 않게 한다.
 */
export async function createAssetSet(
  input: CreateAssetSetInput,
  frameFile?: File | null,
  outroFile?: File | null,
): Promise<void> {
  if (frameFile) {
    const e = validate(frameFile, 'frame');
    if (e) throw new Error(e);
  }
  if (outroFile) {
    const e = validate(outroFile, 'outro');
    if (e) throw new Error(e);
  }

  const res = await api.createAssetSet(input);
  if (!res.success) throw new Error(res.error ?? '세트 생성에 실패했습니다.');
  const id = res.data.id;

  if (frameFile) await uploadSetSlot(id, 'frame', frameFile);
  if (outroFile) await uploadSetSlot(id, 'outro', outroFile);
}
export async function updateAssetSet(id: number, patch: UpdateAssetSetInput): Promise<void> {
  const res = await api.updateAssetSet(id, patch);
  if (!res.success) throw new Error(res.error ?? '세트 수정에 실패했습니다.');
}
export async function deleteAssetSet(id: number): Promise<void> {
  const res = await api.deleteAssetSet(id);
  if (!res.success) throw new Error(res.error ?? '세트 삭제에 실패했습니다.');
}

/** 클라 사전 검증: 크기/종류(이미지/영상). 통과면 null. */
function validate(file: File, slot: SetSlot): string | null {
  const meta = SET_SLOT_META[slot];
  if (file.size > meta.maxBytes) {
    return `파일이 너무 큽니다(최대 ${Math.round(meta.maxBytes / 1024 / 1024)}MB).`;
  }
  if (file.type && !file.type.startsWith(`${meta.kind}/`)) {
    return `${meta.kind === 'video' ? '영상' : '이미지'} 파일만 올릴 수 있습니다.`;
  }
  return null;
}

/** 슬롯 업로드(4-step): 검증 → presign → 바이트 PUT → confirm → 슬롯 지정. 실패 시 throw. */
export async function uploadSetSlot(id: number, slot: SetSlot, file: File): Promise<void> {
  const invalid = validate(file, slot);
  if (invalid) throw new Error(invalid);
  const mimeType = file.type;
  if (!mimeType) throw new Error('파일 형식을 확인할 수 없습니다.');

  const { uploadId, presignedUrl } = await api.presignSlot(slot, file.name, mimeType, file.size);
  await api.putBytes(presignedUrl, file, mimeType);
  await api.confirm(uploadId);

  const res = await api.setSetSlot(id, slot, uploadId);
  if (!res.success) throw new Error(res.error ?? '슬롯 지정에 실패했습니다.');
}

export async function clearSetSlot(id: number, slot: SetSlot): Promise<void> {
  const res = await api.clearSetSlot(id, slot);
  if (!res.success) throw new Error(res.error ?? '슬롯 비우기에 실패했습니다.');
}
