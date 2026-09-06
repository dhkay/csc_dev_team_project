import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestServiceClient } from '@csc/net-utils/nest';
import { MarketingServiceTokenService } from '../service-token';

/**
 * video-model 서비스 공유 HTTP 클라이언트(DI 싱글톤): X-Service-Token 자동 주입 + 타임아웃
 * 도메인 어댑터는 이 클라이언트를 주입만 받아 호출한다(직접 fetch/axios 금지)
 * COMPOSE 렌더 잡 등록(POST /video-jobs)과 상태 조회(GET /video-jobs/:id)는 모두 빠르다(등록=enqueue,
 * 실제 렌더는 워커/큐가 비동기 수행). 잡 등록은 비멱등(중복 잡 방지)이라 재시도하지 않는다.
 */
@Injectable()
export class VideoModelApiClientService extends NestServiceClient {
  constructor(config: ConfigService, tokenService: MarketingServiceTokenService) {
    super({
      // 로컬 standalone(pnpm) 기본 = video-model dev 포트 8000. 도커는 compose 가 env 로 오버라이드
      baseUrl: config.get<string>('MARKETING_VIDEO_API_URL') ?? 'http://localhost:8000',
      serviceToken: () => tokenService.createServiceToken(),
      retries: 0,
    });
  }
}
