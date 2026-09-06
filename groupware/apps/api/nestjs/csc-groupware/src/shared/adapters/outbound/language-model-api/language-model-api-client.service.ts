import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestServiceClient } from '@csc/net-utils/nest';
import { UserApiTokenService } from '../user-api';

/**
 * language-model 서버 HTTP 클라이언트: 내부망(Docker network) 호출
 * 공유 `NestServiceClient`(X-Service-Token 자동 주입) 상속, baseUrl, 서비스토큰만 주입
 * 용도: AI 어시스턴트 모델 카탈로그 조회(GET /inference/models): 조직 기본 모델 select 후보(허용 범위 내)
 * 서비스토큰 클레임 = 'csc-groupware'(language-model ALLOWED_SERVICES 화이트리스트와 일치)
 */
@Injectable()
export class LanguageModelApiClientService extends NestServiceClient {
  constructor(config: ConfigService, tokenService: UserApiTokenService) {
    super({
      baseUrl: config.get<string>('LANGUAGE_MODEL_API_URL') ?? 'http://localhost:8010',
      serviceToken: () => tokenService.createServiceToken(),
    });
  }
}
