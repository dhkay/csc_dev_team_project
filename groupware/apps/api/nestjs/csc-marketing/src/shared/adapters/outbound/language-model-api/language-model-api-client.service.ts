import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestServiceClient } from '@csc/net-utils/nest';
import { MarketingServiceTokenService } from '../service-token';

/**
 * language-model 서비스 공유 HTTP 클라이언트(DI 싱글톤): X-Service-Token 자동 주입 + 재시도/타임아웃
 * 도메인 어댑터는 이 클라이언트를 주입만 받아 호출한다(직접 fetch/axios 금지)
 */
@Injectable()
export class LanguageModelApiClientService extends NestServiceClient {
  constructor(config: ConfigService, tokenService: MarketingServiceTokenService) {
    super({
      // 로컬 standalone(pnpm) 기본 = language-model dev 포트 8010. 도커는 compose 가 env 로 오버라이드
      baseUrl: config.get<string>('LANGUAGE_MODEL_API_URL') ?? 'http://localhost:8010',
      serviceToken: () => tokenService.createServiceToken(),
      // LLM 생성은 느리다(기획안 5개 = 수십 초). 기본 10s 로는 타임아웃 → 넉넉히
      //   language-model 의 호출 타임아웃(inference/external_timeout_s=240)보다 크게 잡아 다운스트림 응답을 기다린다.
      //   사다리: nginx(360s) > 여기(300s) > language-model(240s). 실측: 기획안 5개x씬 6개 = 118s.
      timeoutMs: 300_000,
      // 생성은 비용이 크고 비멱등: 재시도 금지(중복 생성/지연 방지)
      retries: 0,
    });
  }
}
