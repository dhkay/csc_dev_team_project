/**
 * `@csc/net-utils/nest`: NestJS 전용 어댑터(공유 가드 + HTTP 클라이언트 베이스)
 *
 * 코어(`@csc/net-utils`)는 프레임워크 비종속(의존성 0)으로 유지하고, NestJS 결합부만 이 서브패스로 분리한다.
 * @nestjs/common, @nestjs/config 는 peer 로 두어(번들 제외) 소비 앱의 것을 사용한다.
 * 계약: docs/specs/service-http-contract.md.
 */
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  type INestApplication,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import {
  createHttpClient,
  type HttpClient,
  type HttpClientOptions,
} from '../http-client';
import { isHttpError } from '../http-error';
import {
  REQUEST_ID_HEADER,
  TRACE_ID_HEADER,
  contextFromHeaders,
  runWithRequestContext,
} from '../request-context';
import { resolveServiceSecret, verifyServiceToken } from '../service-token';

const DEFAULT_ALLOWED_SERVICES =
  'web-groupware,web-control-tower,csc-groupware,csc-control-tower,scalar-gateway';

/**
 * 서비스토큰 검증을 건너뛰는 경로 prefix (계약 SSOT: docs/specs/service-http-contract.md §1.4)
 * OpenAPI 스펙/문서, 헬스체크는 토큰 없이 노출되어야 통합 문서 포털(scalar-gateway)이 수집할 수 있다.
 * 내부망 전용 + nginx IP allowlist 로 외부 노출은 차단된다.
 */
const DEFAULT_EXEMPT_PREFIXES = [
  '/health',
  '/info',
  '/docs',
  '/openapi.json',
  '/redoc',
] as const;

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  url?: string;
  originalUrl?: string;
}

/**
 * 보안 Layer 3: 서버 간 인증(Service Token) 전역 가드 (모든 NestJS 서버 공용)
 * `SERVICE_TOKEN_SECRET`(fail-closed) + `ALLOWED_SERVICES`(쉼표 구분)를 process.env 에서 읽는다.
 * (이 패키지는 tsup/esbuild 빌드라 emitDecoratorMetadata 가 없어 생성자 DI 주입이 불가 →
 *  ConfigService 주입 대신 process.env 직접 사용. prod 는 compose environment, dev 는 ConfigModule
 *  의 dotenv 가 process.env 를 채운다.) 검증 로직은 코어 `verifyServiceToken` 위임
 * app.module 에서 `APP_GUARD` 로 등록한다.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  private readonly logger = new Logger(ServiceTokenGuard.name);
  private readonly secret: string;
  private readonly allowedServices: Set<string>;
  private readonly exemptPrefixes: readonly string[];

  constructor() {
    const raw = process.env.SERVICE_TOKEN_SECRET;
    if (!raw && process.env.NODE_ENV !== 'production') {
      this.logger.warn('SERVICE_TOKEN_SECRET 미설정: 개발 전용 시크릿으로 폴백합니다.');
    }
    this.secret = resolveServiceSecret(raw, {
      isProduction: process.env.NODE_ENV === 'production',
    });
    const services = process.env.ALLOWED_SERVICES ?? DEFAULT_ALLOWED_SERVICES;
    this.allowedServices = new Set(
      services.split(',').map((s) => s.trim()).filter(Boolean),
    );
    // 면제 경로는 기본값(계약 SSOT)을 쓰되, 환경별로 SERVICE_TOKEN_EXEMPT_PREFIXES 로 덮어쓸 수 있다.
    const exemptEnv = process.env.SERVICE_TOKEN_EXEMPT_PREFIXES;
    this.exemptPrefixes = exemptEnv
      ? exemptEnv.split(',').map((s) => s.trim()).filter(Boolean)
      : DEFAULT_EXEMPT_PREFIXES;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestLike>();

    // 면제 경로(OpenAPI/문서/헬스체크)는 토큰 검증을 건너뛴다. query string 제외 후 prefix 매칭
    const path = (request.originalUrl ?? request.url ?? '').split('?')[0];
    if (this.exemptPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
      return true;
    }

    const token = request.headers['x-service-token'];

    if (typeof token !== 'string' || token.length === 0) {
      throw new UnauthorizedException('서비스 토큰이 필요합니다.');
    }
    // 서명, 만료 검증(allowed 는 별도 검사해 "허용되지 않은 서비스" 메시지를 구분)
    const payload = verifyServiceToken(token, this.secret);
    if (!payload) {
      throw new UnauthorizedException('유효하지 않은 서비스 토큰입니다.');
    }
    if (!this.allowedServices.has(payload.service)) {
      throw new UnauthorizedException('허용되지 않은 서비스입니다.');
    }
    return true;
  }
}

interface CorrelationRequest {
  headers: Record<string, string | string[] | undefined>;
}
interface CorrelationResponse {
  setHeader(name: string, value: string): void;
}

/**
 * 상관관계 컨텍스트 미들웨어 (express 시그니처): 모든 NestJS 서버 공용
 * `main.ts` 에서 가드보다 먼저 `app.use(correlationIdMiddleware)` 로 등록한다.
 * 그래야 가드가 던지는 401 로그에도 컨텍스트가 붙는다.
 *
 * 인터셉터(APP_INTERCEPTOR)가 아니라 미들웨어인 이유: 인터셉터는 가드 이후에 돌아서
 * 인증 실패 요청이 컨텍스트 없이 로깅된다. 장애 조사에서 가장 보고 싶은 게 그 요청들이다.
 *
 * 성능: 요청당 ALS `run()` 1회 + id 2개 생성(풀링). 그 외 할당 없음
 */
export function correlationIdMiddleware(
  req: CorrelationRequest,
  res: CorrelationResponse,
  next: () => void,
): void {
  const context = contextFromHeaders(req.headers);
  // 응답에 되돌려줘 호출자(BFF/브라우저 devtools)가 서버 로그를 바로 찾을 수 있게 한다.
  res.setHeader(TRACE_ID_HEADER, context.traceId);
  res.setHeader(REQUEST_ID_HEADER, context.requestId);
  runWithRequestContext(context, next);
}

/**
 * OpenAPI(Swagger) 문서 셋업: 모든 NestJS 서버 공용
 * Swagger UI 는 `/docs`, 원시 OpenAPI JSON 은 `/openapi.json` 에 노출한다(통합 문서 포털 scalar-gateway 가 수집)
 * 두 경로는 ServiceTokenGuard 면제 경로(DEFAULT_EXEMPT_PREFIXES)라 토큰 없이 접근 가능: 내부망 한정
 * 신규 NestJS 서버는 main.ts 에서 이 함수 한 줄만 호출하면 된다.
 *
 * 풍부한 스키마는 컨트롤러/DTO 의 @ApiTags, @ApiProperty, @ApiOperation 데코레이터로 점진 보강한다.
 */
export function setupOpenApi(
  app: INestApplication,
  opts: { title: string; version?: string; description?: string },
): void {
  const builder = new DocumentBuilder()
    .setTitle(opts.title)
    .setVersion(opts.version ?? '1.0')
    // 유저 JWT 가 필요한 엔드포인트는 Scalar/Swagger Authorization 입력란에서 직접 토큰을 넣는다.
    .addBearerAuth();
  if (opts.description) {
    builder.setDescription(opts.description);
  }
  const document = SwaggerModule.createDocument(app, builder.build());
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'openapi.json',
  });
}

/**
 * 서버 간 HTTP 클라이언트 베이스(NestJS). 코어 `createHttpClient` 를 감싸고,
 * 정규화 에러(HttpError)를 NestJS `HttpException` 으로 변환해 inbound 패스스루를 유지한다.
 * 도메인별 클라이언트는 이 클래스를 상속해 baseUrl, 서비스토큰만 주입한다.
 */
export class NestServiceClient {
  protected readonly http: HttpClient;

  constructor(options: HttpClientOptions) {
    this.http = createHttpClient(options);
  }

  protected async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (isHttpError(err)) {
        // 업스트림 본문을 그대로 실어 보낸다(계약 §2 에러 봉투: message 외에 code/details 포함)
        // message 만 남기면 같은 상태코드의 서로 다른 충돌(예: slug 중복 vs 이메일 중복)을
        // 호출부가 구분하지 못해, 엉뚱한 입력란에 오류를 다는 안내가 나간다.
        const body = err.response?.data;
        throw new HttpException(
          body && Object.keys(body).length > 0 ? body : err.message || '서버 간 요청 실패',
          err.statusCode,
        );
      }
      throw err;
    }
  }

  get<T>(path: string): Promise<T> {
    return this.call(() => this.http.get<T>(path));
  }
  post<T>(path: string, body?: unknown): Promise<T> {
    return this.call(() => this.http.post<T>(path, body));
  }
  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.call(() => this.http.patch<T>(path, body));
  }
  delete<T>(path: string, body?: unknown): Promise<T> {
    return this.call(() => this.http.delete<T>(path, body));
  }
}
