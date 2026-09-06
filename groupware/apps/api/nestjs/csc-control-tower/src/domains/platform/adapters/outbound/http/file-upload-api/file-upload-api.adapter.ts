import { Injectable } from '@nestjs/common';
import { FileUploadApiClientService } from '../../../../../../shared/adapters/outbound/file-upload-api';
import { FileUploadApiPort } from '../../../../core/application/ports/outbound/file-upload-api.port';

/** FileUploadApiPort 구현: file-upload /uploads/organizations/:id/archive-and-delete 호출(서비스토큰) */
@Injectable()
export class FileUploadApiAdapter implements FileUploadApiPort {
  constructor(private readonly client: FileUploadApiClientService) {}

  archiveAndDeleteOrganization(
    organizationId: number,
  ): Promise<{ archived: number }> {
    return this.client.post<{ archived: number }>(
      `/uploads/organizations/${organizationId}/archive-and-delete`,
    );
  }
}
