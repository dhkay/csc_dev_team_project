import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { WIRE_VERSION } from '@csc/mes-contracts';

/** 헬스 응답. 계약 버전을 함께 주어 단말이 재부트스트랩 필요를 미리 알 수 있게 한다. */
export interface HealthResponse {
  status: 'ok';
  service: 'csc-mes';
  wireVersion: number;
  serverTime: string;
}

/**
 * 라이브니스 프로브
 *
 * 의도적으로 비인증이다(ServiceTokenGuard 기본 면제 경로). 토큰이 만료돼도 응답해야 단말
 * 화면에서 "오프라인" 과 "토큰 만료" 가 구분된다.
 * navigator.onLine 은 쓰지 않는다. 공장 네트워크는 링크가 살아 있고 게이트웨이만 죽는 상황이
 * 흔해 거짓 양성이 나온다.
 */
@ApiTags('[MES] 헬스')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: '[MES-001] 라이브니스 프로브 (비인증)' })
  check(): HealthResponse {
    return {
      status: 'ok',
      service: 'csc-mes',
      wireVersion: WIRE_VERSION,
      serverTime: new Date().toISOString(),
    };
  }
}
