import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestServiceClient } from '@csc/net-utils/nest';
import { UserApiTokenService } from '../user-api';

/**
 * file-upload 서버 HTTP 클라이언트(내부망 Docker network).
 * 용도는 조직 하드 삭제 시 그 조직 소유 자산의 아카이브 + 삭제 위임이다. 스토리지는 file-upload 소유다.
 *
 * 서비스토큰은 타깃별로 다르지 않다(클레임은 호출자 신원 'csc-control-tower' 이고 타깃과 무관).
 * 그래서 타깃별 토큰 서비스를 두지 않고 UserApiTokenService 를 재사용한다.
 */
@Injectable()
export class FileUploadApiClientService extends NestServiceClient {
  constructor(config: ConfigService, tokenService: UserApiTokenService) {
    super({
      baseUrl: config.get<string>('FILE_UPLOAD_API_URL') ?? 'http://localhost:8001',
      serviceToken: () => tokenService.createServiceToken(),
    });
  }
}
