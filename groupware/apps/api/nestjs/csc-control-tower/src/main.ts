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
  setupOpenApi(app, { title: 'csc-control-tower API', description: '플랫폼 관리(컨트롤타워) 도메인 API' });
  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
