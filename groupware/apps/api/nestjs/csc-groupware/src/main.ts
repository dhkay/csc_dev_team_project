// .env 를 가장 먼저 로드: @csc/database 클라이언트가 import 시점에
// process.env.GROUPWARE_DATABASE_URL 을 읽으므로 AppModule import 전에 채워야 한다.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { correlationIdMiddleware, setupOpenApi } from '@csc/net-utils/nest';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // 상관관계 컨텍스트(trace/request id): 가드보다 먼저. 그래야 서비스토큰 거부(401)
  // 응답에도 id 가 붙어 장애 조사에서 거부된 요청을 추적할 수 있다.
  app.use(correlationIdMiddleware);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // OpenAPI: /docs (Swagger UI) + /openapi.json: 통합 문서 포털(scalar-gateway)이 수집
  setupOpenApi(app, { title: 'csc-groupware API', description: '그룹웨어 도메인 API' });
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
