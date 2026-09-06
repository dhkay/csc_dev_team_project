// .env 를 가장 먼저 로드: @csc/database 클라이언트가 import 시점에
// process.env.MES_DATABASE_URL 을 읽으므로 AppModule import 전에 채워야 한다.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { correlationIdMiddleware, setupOpenApi } from '@csc/net-utils/nest';
import { AppModule } from './app.module';
import { ClientVersionInterceptor } from './shared/http';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // 상관관계 컨텍스트(trace/request id): 가드보다 먼저. 그래야 인증 거부(401) 응답에도
  // id 가 붙어 장애 조사에서 거부된 요청을 추적할 수 있다.
  app.use(correlationIdMiddleware);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // 클라이언트 버전 정책 헤더를 모든 응답에 싣는다. 별도 정책 조회 엔드포인트를 두면
  // 그 엔드포인트만 호출 안 하는 버그가 생긴다. 상세: docs/specs/mes-client-compatibility.md
  app.useGlobalInterceptors(new ClientVersionInterceptor());
  // SIGTERM 에 onApplicationShutdown 이 돌게 한다. 활동 로그 프로듀서의 마지막 버퍼가
  // 배포마다 사라지는 것을 막는다(종료 훅이 아예 호출되지 않기 때문)
  app.enableShutdownHooks();
  // OpenAPI: /docs (Swagger UI) + /openapi.json: 통합 문서 포털(scalar-gateway)이 수집
  setupOpenApi(app, {
    title: 'csc-mes API',
    description:
      'MES(제조실행) 도메인 API. 오프라인 우선 현장 단말의 델타 동기화와 멱등 쓰기를 담당한다.',
  });
  await app.listen(process.env.PORT ?? 3004);
}
void bootstrap();
