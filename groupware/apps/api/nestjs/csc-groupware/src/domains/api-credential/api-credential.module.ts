import { Module } from '@nestjs/common';
import {
  ApiCredentialController,
  InternalApiCredentialController,
} from './adapters/inbound/http/controllers';
import { ApiCredentialService } from './core/application/services';
import { ApiCredentialRepositoryAdapter } from './adapters/outbound/db/groupwaredb';
import { AesGcmSecretCipherAdapter } from './adapters/outbound/crypto';
import { ApiKeyValidatorAdapter } from './adapters/outbound/validator';
import { API_CREDENTIAL_PORT } from './core/application/ports/inbound';
import {
  API_CREDENTIAL_REPOSITORY_PORT,
  API_KEY_VALIDATOR_PORT,
  SECRET_CIPHER_PORT,
} from './core/application/ports/outbound';

@Module({
  controllers: [ApiCredentialController, InternalApiCredentialController],
  providers: [
    { provide: API_CREDENTIAL_PORT, useClass: ApiCredentialService },
    { provide: API_CREDENTIAL_REPOSITORY_PORT, useClass: ApiCredentialRepositoryAdapter },
    { provide: SECRET_CIPHER_PORT, useClass: AesGcmSecretCipherAdapter },
    { provide: API_KEY_VALIDATOR_PORT, useClass: ApiKeyValidatorAdapter },
  ],
  // 다른 도메인이 자격증명 해석(resolveCredentials)을 위해 주입할 수 있도록 내보낸다.
  //
  // org-wide 소비(Option A: 구현됨): 피어 백엔드가 InternalApiCredentialController 의
  // `GET /internal/api-credentials/resolve`(전역 ServiceTokenGuard) 로 조직 키를 해석한다.
  // 현재 소비자 = language-model(AI 어시스턴트의 외부 Claude 모델). 그 서버는 csc-groupware
  // ALLOWED_SERVICES 에 `language-model` 로 등록되어 있어야 하고(compose), csc_net_utils.ServiceHttpClient 로
  // BFF 가 넘겨주는 X-Organization-Id 기반 per-request 조회 + 짧은 TTL 캐시로 키를 가져간다.
  exports: [API_CREDENTIAL_PORT],
})
export class ApiCredentialModule {}
