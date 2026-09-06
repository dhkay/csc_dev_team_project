import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestServiceClient } from '@csc/net-utils/nest';
import { MarketingServiceTokenService } from '../service-token';

/**
 * csc-groupware 서비스 공유 HTTP 클라이언트(DI 싱글톤): X-Service-Token 자동 주입 + 타임아웃/재시도
 * 도메인 어댑터는 이 클라이언트를 주입만 받아 호출한다(직접 fetch/axios 금지)
 *
 * 현재 용도: 조직 공용 API 자격증명 resolve(GET /internal/api-credentials/resolve). 외부 영상모델(Grok)
 * 이 조직 XAI 키로 렌더하도록 enqueue 시점에 해석한다. video-model 워커는 방화벽상 csc-groupware 에
 * 도달할 수 없어 런타임 resolve 가 불가하기 때문(키는 잡 params 에 암호문으로 실려 전달된다)
 */
@Injectable()
export class GroupwareApiClientService extends NestServiceClient {
  constructor(config: ConfigService, tokenService: MarketingServiceTokenService) {
    super({
      // 로컬 standalone(pnpm) 기본 = csc-groupware dev 포트 3000. 도커는 compose 가 MAIN_API_URL 로 오버라이드
      baseUrl: config.get<string>('MAIN_API_URL') ?? 'http://localhost:3000',
      serviceToken: () => tokenService.createServiceToken(),
      retries: 1,
    });
  }
}
