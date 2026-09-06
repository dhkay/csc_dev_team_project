// .env 를 가장 먼저 로드: @csc/database 클라이언트가 import 시점에
// process.env.MARKETING_DATABASE_URL 을 읽으므로 AppModule import 전에 채워야 한다.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { correlationIdMiddleware, setupOpenApi } from '@csc/net-utils/nest';
import { AppModule } from './app.module';
import { SagaBusyFilter } from '@csc/saga/nest';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // 상관관계 컨텍스트(trace/request id): 가드보다 먼저. 그래야 서비스토큰 거부(401)
  // 응답에도 id 가 붙어 장애 조사에서 거부된 요청을 추적할 수 있다.
  app.use(correlationIdMiddleware);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // 사가 실행권 경쟁(중복 제출)을 409 로: 한 곳에서 번역해 사가가 늘어도 빠지는 자리가 없게 한다.
  app.useGlobalFilters(new SagaBusyFilter());
  // SIGTERM 에 onApplicationShutdown 이 돌게 한다. 이게 없으면 활동 로그 프로듀서의 마지막
  // 버퍼(아직 안 보낸 레코드)가 배포마다 사라진다. 종료 훅이 아예 호출되지 않기 때문
  app.enableShutdownHooks();
  // OpenAPI: /docs (Swagger UI) + /openapi.json: 통합 문서 포털(scalar-gateway)이 수집
  setupOpenApi(app, {
    title: 'csc-marketing API',
    description: '마케팅 도메인 API (영상 기획안 키워드/에셋/렌더 등)',
  });
  await app.listen(process.env.PORT ?? 3003);
}
void bootstrap();
