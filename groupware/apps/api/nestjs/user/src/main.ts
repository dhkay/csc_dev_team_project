// .env 를 가장 먼저 로드: @csc/database 클라이언트가 import 시점에
// process.env.USER_DATABASE_URL 을 읽으므로 AppModule import 전에 채워야 한다.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { correlationIdMiddleware, setupOpenApi } from '@csc/net-utils/nest';
import { AppModule } from './app.module';
import { AuthExceptionFilter } from './domains/user/adapters/inbound/http/filters/auth-exception.filter';
import { OrganizationExceptionFilter } from './domains/user/adapters/inbound/http/filters/organization-exception.filter';
import { AdminExceptionFilter } from './domains/user/adapters/inbound/http/filters/admin-exception.filter';
import { AiToolExceptionFilter } from './domains/user/adapters/inbound/http/filters/ai-tool-exception.filter';
import { OrgMemberExceptionFilter } from './domains/user/adapters/inbound/http/filters/org-member-exception.filter';
import { DepartmentExceptionFilter } from './domains/user/adapters/inbound/http/filters/department-exception.filter';
import { PositionExceptionFilter } from './domains/user/adapters/inbound/http/filters/position-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // 상관관계 컨텍스트(trace/request id): 가드보다 먼저. 그래야 서비스토큰 거부(401)
  // 응답에도 id 가 붙어 장애 조사에서 거부된 요청을 추적할 수 있다.
  app.use(correlationIdMiddleware);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(
    new AuthExceptionFilter(),
    new OrganizationExceptionFilter(),
    new AdminExceptionFilter(),
    new AiToolExceptionFilter(),
    new OrgMemberExceptionFilter(),
    new DepartmentExceptionFilter(),
    new PositionExceptionFilter(),
  );
  // OpenAPI: /docs (Swagger UI) + /openapi.json: 통합 문서 포털(scalar-gateway)이 수집
  setupOpenApi(app, { title: 'user API', description: '인증/계정/조직 도메인 API' });
  await app.listen(process.env.PORT ?? 3002);
}
void bootstrap();
