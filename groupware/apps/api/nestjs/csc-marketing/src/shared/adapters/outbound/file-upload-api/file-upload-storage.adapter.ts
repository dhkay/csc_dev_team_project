import { Injectable, Logger } from '@nestjs/common';
import { FileUploadApiClientService } from './file-upload-api-client.service';
import {
  AssetDeleteResult,
  AssetUploadStatus,
  FileUploadStoragePort,
} from '../../../domain/storage';

/**
 * FileUploadStoragePort 구현(공유): file-upload 의 자산 확정, 조회, 제거를 HTTP 로 위임
 * 삭제는 best-effort 지만 조용하지 않음(경고를 남기고 실패 id 를 반환)
 * 확정은 반대로 실패를 던져 호출부가 자기 행을 되돌리게 함
 */
@Injectable()
export class FileUploadStorageAdapter implements FileUploadStoragePort {
  private readonly logger = new Logger(FileUploadStorageAdapter.name);

  constructor(private readonly client: FileUploadApiClientService) {}

  async deleteAsset(uploadId: string): Promise<void> {
    await this.deleteOne(uploadId);
  }

  async deleteAssets(uploadIds: string[]): Promise<AssetDeleteResult> {
    const results = await Promise.all(uploadIds.map((id) => this.deleteOne(id)));
    return { failed: uploadIds.filter((_, i) => !results[i]) };
  }

  /** 단건 삭제. 성공이면 true 이고 실패는 삼키되 경고를 남김(고아의 유일한 흔적) */
  private async deleteOne(uploadId: string): Promise<boolean> {
    try {
      await this.client.delete<{ deleted: boolean }>(`/uploads/${encodeURIComponent(uploadId)}`);
      return true;
    } catch (err) {
      this.logger.warn(
        `자산 삭제 실패(upload=${uploadId}): 스토리지에 고아로 남습니다: ${String(err)}`,
      );
      return false;
    }
  }

  async confirmAssets(uploadIds: string[]): Promise<void> {
    if (uploadIds.length === 0) return;
    // 하나라도 실패하면 throw. catch 를 두지 않는 것이 포트 계약
    await Promise.all(
      uploadIds.map((id) =>
        this.client.post<unknown>(`/uploads/${encodeURIComponent(id)}/confirm`),
      ),
    );
  }

  async getAssetStatuses(
    uploadIds: string[],
  ): Promise<Record<string, AssetUploadStatus>> {
    // 기본 MISSING. file-upload 응답에 없는 id 는 그대로 MISSING 이라 사전검증에서 걸림
    const result: Record<string, AssetUploadStatus> = {};
    for (const id of uploadIds) result[id] = 'MISSING';
    if (uploadIds.length === 0) return result;
    const items = await this.client.post<{ id: string; status: 'UPLOADED' | 'PENDING' }[]>(
      '/uploads/status',
      { ids: uploadIds },
    );
    for (const item of items) result[item.id] = item.status;
    return result;
  }
}
