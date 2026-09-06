import { BadRequestException } from '@nestjs/common';
import { FileUploadStoragePort } from './file-upload-storage.port';

/**
 * 렌더 등록 전 자산 사전검증(SSOT): video-project/video-final 이 공유한다.
 * 참조 uploadId 들이 file-upload 에 모두 UPLOADED 인지 확인하고, 하나라도 아니면(MISSING/PENDING) 400 으로 막아
 * 업로드 안 된 id 를 참조하는 doomed 렌더 잡이 큐에 들어가는 걸 차단한다. 빈/중복 id 는 정리 후 검사(빈 목록은 통과)
 * (shared/domain/scoped-ownership 의 parseOwner 와 같은 결: 공유 검증 헬퍼가 BadRequestException 을 던진다.)
 */
export async function assertAssetsUploaded(
  storage: FileUploadStoragePort,
  uploadIds: string[],
): Promise<void> {
  const ids = [...new Set(uploadIds.filter(Boolean))];
  if (ids.length === 0) return;
  const statuses = await storage.getAssetStatuses(ids);
  const notReady = ids.filter((id) => statuses[id] !== 'UPLOADED');
  if (notReady.length > 0) {
    throw new BadRequestException(
      `업로드가 완료되지 않은 자산이 있어 영상을 만들 수 없습니다(누락/미완료 ${notReady.length}건). 자산을 다시 업로드한 뒤 시도하세요.`,
    );
  }
}
