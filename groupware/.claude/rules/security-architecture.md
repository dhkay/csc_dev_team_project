# csc 보안 아키텍처

## 개요

csc는 다층 방어(Defense-in-Depth)로 백엔드 API를 보호한다. 웹 프론트엔드만 공개하고, 백엔드 API는 BFF(Docker 내부 네트워크)와 관리자 IP에서만 접근 가능하다.

**지금 동작하는 것은 Layer 1~3 이다.** Layer 4 는 설계만 있고 구현이 없다(그 절 참고).

백엔드는 헥사고날(Hexagonal) 아키텍처로 구성되며, 서버 간 통신은 HTTP + 서비스 토큰으로 이뤄진다.

---

## 방어 계층 구조

```
Layer 1: nginx: IP 기반 접근 제한 (1차 관문)
Layer 2: CORS: Origin 기반 브라우저 요청 제한
Layer 3: Service Token: 서버 간 JWT 인증 (NestJS Guard + FastAPI Middleware)
Layer 4: App IP Guard: 앱 레벨 IP 화이트리스트 (video-model FastAPI). **미구현**
```

```
외부 사용자            관리자 IP (<관리자_공인_IP>)
    │                      │
    ▼                      ▼
┌──────────────────────────────────────────────┐
│  nginx (Layer 1: IP 제한)                    │
│                                               │
│  허용 example.com        → web-groupware          │
│  허용 admin.example.com  → web-control-tower (IP제한) │
│  차단 api.example.com    → deny all (관리자만)│
│  차단 control-api.*      → deny all (관리자만)│
│  차단 video-model-api.* → deny all (관리자만)│
└──────────────────┬───────────────────────────┘
                   │ Docker 내부 네트워크
                   ▼
┌──────────────────────────────────────────────┐
│  BFF (SvelteKit +server.ts)                   │
│  PRIVATE_API_URL=http://api-csc-groupware:3000 │
│  PRIVATE_MARKETING_API_URL=http://api-csc-marketing:3003 │
│  PRIVATE_USER_API_URL=http://api-user:3002    │
│  PRIVATE_STORAGE_API_URL=http://api-file-service:8000 │
│  (그 외 PRIVATE_LANGUAGE_MODEL_API_URL / PRIVATE_LOG_SERVER_API_URL) │
│                                               │
│  → X-Service-Token 헤더 자동 주입             │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│  백엔드 API 서버                              │
│                                               │
│  Layer 2: CORS (특정 Origin만 허용)           │
│  Layer 3: ServiceTokenGuard / Middleware      │
│           (JWT HS256 검증)                    │
│  Layer 4: IP Whitelist (미구현: 아래 절)             │
└──────────────────────────────────────────────┘
```

---

## 서버 구성 (Hexagonal)

| 서버 | 디렉터리 | 스택 | 역할 |
|------|---------|------|------|
| csc-groupware | `apps/api/nestjs/csc-groupware` | NestJS | Main API |
| csc-control-tower | `apps/api/nestjs/csc-control-tower` | NestJS | Admin/Control API |
| video-model | `apps/api/fastapi/video-model` | FastAPI | 영상 제작 자동화 |
| web-groupware | `apps/web/groupware` | SvelteKit BFF | 사용자 웹 |
| web-control-tower | `apps/web/control-tower` | SvelteKit BFF | 관리자 웹 |

> npm scope는 `@csc`(예: `@csc/database`, `@csc/net-utils`). 패키지: `packages/database`(Drizzle; groupwaredb/userdb/controltowerdb), `shared-ui`, `net-utils`.

---

## 도메인별 접근 정책

| 도메인 | nginx | 용도 | 접근 가능 |
|--------|-------|------|----------|
| `example.com` | PUBLIC | 사용자 웹 | 모든 사용자 |
| `admin.example.com` | IP 제한 | 관리자 웹 | 관리자 IP만 |
| `api.example.com` | IP 제한 | csc-groupware (Main API) | 관리자 IP + LAN |
| `control-api.example.com` | IP 제한 | csc-control-tower (Control API) | 관리자 IP + LAN |
| `video-model-api.example.com` | IP 제한 | video-model (AI 영상 자동 생성) | 관리자 IP + LAN |

> **핵심:** BFF는 Docker 내부 네트워크(`http://csc-groupware:3000`)로 백엔드와 통신하므로 nginx를 거치지 않음. 따라서 nginx에서 백엔드 도메인을 차단해도 서비스에 영향 없음.

---

## Layer 1: nginx IP 제한

### 허용 IP 목록

```nginx
# 관리자 공인 IP
allow <관리자_공인_IP>;
allow <허용_IP_3>;
allow <허용_IP_2>;

# 로컬/Docker 내부 네트워크
allow 127.0.0.1;
allow 10.0.0.0/8;
allow 172.16.0.0/12;
allow 192.168.0.0/16;

deny all;
```

### 적용 대상

- csc-groupware / Main API (`api.example.com`): 서버 블록 레벨
- csc-control-tower / Control API (`control-api.example.com`): 서버 블록 레벨
- web-control-tower (`admin.example.com`): 서버 블록 레벨
- video-model / Video-Model API (`video-model-api.example.com`): 서버 블록 레벨

### 공개 엔드포인트 레이트리밋 (사용자 웹 apex 공개 이후)

사용자 웹(apex)은 IP allowlist 대신 공개라, 네트워크 레벨 남용 방어로 nginx `limit_req` 를 둔다
(`infra/nginx/conf.d/00-rate-limit.conf` 에 zone 정의: conf.d 는 http 컨텍스트). 민감 경로만 제한하고
일반 페이지/정적 에셋은 건드리지 않는다(정상 사용자 영향 없음). 앱 레벨 계정 잠금과 이중 방어.

| 경로 | zone | rate / burst | 목적 |
|------|------|--------------|------|
| `/api/auth/*` | `auth_limit` | 30r/m + burst 60 | 로그인 브루트포스 / 크리덴셜 스터핑 |
| `/blob` (PUT) | `upload_limit` | 120r/m + burst 20 | 업로드 남용 / DoS (서명 업로드토큰과 이중) |
| `/f/` (공개 파일) | `file_limit` | 600r/m + burst 120 | **로그인 없이 열리는 유일한 경로.** 바이트를 내주므로 남용 비용이 크다 |
| `/api/storage/` | `file_limit` | 600r/m + burst 120 | 세션이 1차 게이트. 도난 세션과 폭주하는 클라이언트에 대한 상한 |

초과 시 429 반환. 공유 IP(사내 NAT/모바일 캐리어)를 고려해 burst 로 순간 파도를 흡수한다.
파일 경로의 burst 가 큰 이유는 한 화면이 이미지를 여러 장 부르고 영상 시킹이 Range 요청을 여러 번
내기 때문이다. 지속 속도가 자동화를 막고 burst 가 정상 사용을 통과시킨다.
admin/api-docs 는 IP allowlist 로 이미 보호되어 별도 레이트리밋이 필요 없다.

### 403 응답 형식

```nginx
error_page 403 = @denied;
location @denied {
    default_type application/json;
    return 403 '{"error":"Forbidden","message":"Direct access not allowed"}';
}
```

### API 문서(Swagger / OpenAPI) 접근

관리자 IP에서만 접근 가능하며, BasicAuth 이중 보호:
- nginx IP 제한으로 1차 차단
- NestJS BasicAuth(또는 FastAPI Depends 기반 인증)로 2차 인증
- 환경변수: `SWAGGER_USER`, `SWAGGER_PASSWORD`

> FastAPI(video-model)는 `/docs`, `/openapi.json`을 동일하게 IP 제한 + 인증 Depends로 보호한다.

---

## Layer 2: CORS

### NestJS (csc-groupware, csc-control-tower)

| 서버 | 환경변수 | Prod 값 |
|------|---------|---------|
| csc-groupware | `CORS_ORIGINS` | `https://example.com` |
| csc-control-tower | `CORS_ORIGINS` | `https://admin.example.com` |

prod 는 명시적 Origin 목록을 **필수**로 설정(와일드카드 `*` 금지). 와일드카드는 로컬 개발에서만.

### FastAPI (video-model / file-upload)

`CORSMiddleware`(Starlette/FastAPI)로 설정한다.

| 서버 | 환경변수 | Prod 값 |
|------|---------|---------|
| video-model | `ALLOWED_ORIGINS` | `https://example.com,https://admin.example.com` |
| file-upload | `ALLOWED_ORIGINS` | apex+admin 모두 (예: `https://example.com,https://www.example.com,https://admin.example.com`) |

로컬 개발 기본값: `http://localhost:5173, http://localhost:5174`. prod 는 `ALLOWED_ORIGINS` 를 명시적으로 설정(와일드카드 서브도메인 지양).

> **file-upload CORS 필수 이유**: 브라우저가 `/blob`(PUT), `/files`(GET)를 file-upload 로 **직접** 호출하는데,
> control-tower(admin 서브도메인)는 `PUBLIC_UPLOAD_BASE_URL`(apex)로 PUT 하므로 **cross-origin** 이다.
> 따라서 file-upload `ALLOWED_ORIGINS` 에 apex(groupware)+admin(control-tower) 도메인을 모두 등록해야 한다.
> 상세는 [file-upload-limits.md](./file-upload-limits.md) 참고.

### 공통 설정

```
AllowedMethods:   GET, POST, PUT, PATCH, DELETE, OPTIONS
AllowedHeaders:   Accept, Authorization, Content-Type, X-Service-Token
AllowCredentials: true
```

---

## Layer 3: Service Token (서버 간 JWT 인증)

### 동작 원리

서버 간/BFF→백엔드 호출 시 `X-Service-Token` 헤더에 JWT를 첨부한다. 발급/검증 로직은 **공유 패키지에 중앙화**: TS: `@csc/net-utils`(`createServiceToken`/`verifyServiceToken`/`resolveServiceSecret`), Python: `csc_net_utils`. 호출 측은 헤더를 직접 만들지 않고 **공유 HTTP 클라이언트가 자동 주입**한다(BFF: `serverClientInstances` 인터셉터 / NestJS: `NestServiceClient` / FastAPI: `ServiceHttpClient`).

```
호출 측(BFF 인터셉터 / NestServiceClient / ServiceHttpClient)
  → createServiceToken(secret, "<호출자명>")
  → JWT { service: "<호출자명>", iat, exp(+1h) }   # 예: "csc-control-tower"
  → X-Service-Token: eyJhbGciOiJIUzI1NiI...
  → 수신 백엔드 (가드/미들웨어가 검증)
```

### JWT 스펙

| 항목 | 값 |
|------|------|
| 알고리즘 | HS256 |
| 만료 시간 | 1시간 (`exp`) |
| 페이로드 | `{ service: string, iat: number, exp: number }` |
| 환경변수 | `SERVICE_TOKEN_SECRET` |

> **중요:** 모든 서버(csc-groupware, csc-control-tower, video-model)가 동일한 `SERVICE_TOKEN_SECRET` 값을 사용해야 함

### 서비스 식별자(호출자명) 규약

`service` 클레임은 **호출 주체를 식별하는 이름**이며, 백엔드의 `ALLOWED_SERVICES` 화이트리스트와
**글자 그대로 일치**해야 통과한다(불일치 시 401). 컨테이너/서비스 명명과 동일한 값을 사용한다.

| 호출 주체 | `service` 값 | 비고 |
|----------|-------------|------|
| web-groupware BFF (`apps/web/groupware`) | `web-groupware` | 사용자 웹 → user/csc-groupware/file-upload 등 호출 + 활동 로그 조회 → log-server `/logs/search` |
| web-control-tower BFF (`apps/web/control-tower`) | `web-control-tower` | 관리자 웹 → csc-control-tower 등 호출 |
| csc-groupware | `csc-groupware` | 백엔드 간 호출 |
| csc-control-tower | `csc-control-tower` | 백엔드 간 호출 |
| csc-marketing (`apps/api/nestjs/csc-marketing`) | `csc-marketing` | 단어관리 → data-collector(수집 소스 카탈로그 `/sources` + 쇼핑인사이트 인기검색어) + 기획서 생성 → language-model `/inference/generate`(무상태 LLM, 채널 선택 모델) + 영상 프로젝트 → video-model `/video-jobs`(COMPOSE 렌더 잡 등록/폴링) + 프로세스 화면 → video-model `/pipeline/prompts`(그 서버가 주인인 프롬프트 서술 조회) + 활동 로그 → log-server `/logs`(버퍼드 배치: 전송 실패가 비즈니스 경로를 막지 않는다) |
| language-model (`apps/api/fastapi/language-model`) | `language-model` | AI 어시스턴트 외부 Claude 모델 → csc-groupware `/internal/api-credentials/resolve`(조직 Claude 키 해석) |
| scalar-gateway (`apps/tools/scalar-gateway`) | `scalar-gateway` | 통합 API 문서 포털 → 등록된 백엔드 전부(스펙 수집/Try-it-out 프록시) |
| csc-mes (`apps/api/nestjs/csc-mes`) | `csc-mes` | MES 제조실행. 활동 로그 → log-server `/logs`. **BFF 를 거치지 않는 클라이언트(현장 PC Tauri 앱)를 받는 최초의 서버**: 아래 예외 절 참고 |
| log-server (`apps/api/fastapi/log-server`) | `log-server` | 통합 로그 수집/조회: **수신 전용**(아무도 호출하지 않음) |

> **log-server 는 방향이 반대다.** 전 백엔드가 `POST /logs` 로 로그를 보내오지만 log-server 자신은
> 다른 서버를 호출하지 않는다. 따라서 타 서버의 `ALLOWED_SERVICES` 에 `log-server` 를 넣을 필요가 없고,
> 반대로 **log-server 의 `ALLOWED_SERVICES` 에 모든 프로듀서**가 있어야 한다.
> 조회(`/logs/search`, `/logs/usage`)는 라우트별 `require_services` 로 web BFF 만 남긴다.

> **새 호출 주체 추가 시:** 위 표에 식별자를 등록하고, **호출받는 모든 백엔드의 `ALLOWED_SERVICES`에
> 같은 문자열을 추가**해야 한다. 식별자는 임의 문자열이 아니라 이 표를 단일 출처로 관리한다.
> (`scalar-gateway` 는 NestJS 가드 기본 화이트리스트 + FastAPI `ALLOWED_SERVICES`(config 기본값, compose env)에 등록됨.)

### 예외: 서비스 토큰을 갖지 않는 클라이언트 (현장 PC)

> **`SERVICE_TOKEN_SECRET` 을 설치형 클라이언트 바이너리에 넣지 않는다. 어떤 형태로도.**

이 시크릿은 전 서버가 공유한다. 현장 PC 수백 대에 배포된 바이너리에서 한 번 유출되면 그 시크릿을
신뢰하는 **모든** csc 백엔드가 위조 호출에 열린다. 난독화나 분할 저장으로 줄일 수 있는 위험이
아니다. 그래서 `apps/desktop/mes`(Tauri 현장 PC 앱)는 Layer 3 계약의 밖에 있다.

| 축 | 서버 간 호출 | 현장 단말 |
|---|---|---|
| 인증 | `X-Service-Token`(공유 시크릿) | 유저 JWT + `X-Device-Token`(단말별 자격) |
| 신뢰 근거 | 호출자가 우리 서버다 | 사람과 등록된 단말 **둘 다** 확인 |
| 폐기 | 시크릿 교체(전 서버 동시) | 단말 1대만 `REVOKED`(즉시 401) |
| 스코프 | 없음 | `mes_devices.allowed_line_ids` 로 데이터 범위 제한 |

**Layer 1(nginx IP 제한)도 이 경로에는 그대로 쓸 수 없다.** 공장이 고정 공인 IP 를 가지면
allowlist 를, 아니면 공개 + 레이트리밋 + 앱 레벨 인증(위 표)으로 간다. 납품처마다 다르므로
vhost 를 열 때 그 사이트의 조건을 확인한다.

Phase 0 현재 상태: `csc-mes` 는 공유 `ServiceTokenGuard` 를 쓰고 `/health` 하나만 노출하며,
**nginx vhost 는 아직 열려 있지 않다.** 디바이스 인증 가드(`MesEdgeGuard`)가 준비되기 전에
공개 노출을 여는 것이 더 위험하기 때문이다. 계약 상세는 `docs/specs/service-http-contract.md`.

### 통합 API 문서 포털 (scalar-gateway)

전 백엔드(NestJS + FastAPI)의 OpenAPI 를 **한 페이지(Scalar UI)** 에서 조회/Try-it-out 한다
(`apps/tools/scalar-gateway`). **서버 목록의 단일 진실원은 `src/registry.ts`**: 개수를 여기 적어두면
곧 어긋나므로 세지 않는다. 신규 백엔드는 registry 한 줄 + 그 서버 `ALLOWED_SERVICES` 에
`scalar-gateway` 등록 + staging/prod compose 의 scalar-gateway 에 `<X>_API_URL` 주입으로 확장된다
(셋 중 하나라도 빠지면 포털에서 그 백엔드만 조용히 도달 불가가 된다).

- **노출**: `api-docs.cscuniverse.com`(staging: `staging-api-docs.*`): nginx **IP allowlist + 앱 레벨 BasicAuth**
  (`SWAGGER_USER`/`SWAGGER_PASSWORD`) 이중. 백엔드 자체는 내부망 전용이라 포털만 노출된다.
- **스펙 수집**: 각 백엔드 `/openapi.json` 은 토큰 검증 면제 경로(내부망 한정). 포털은 서비스토큰을 주입해 수집하고,
  `servers` 를 `/proxy/:name` 으로 rewrite 한다.
- **Try-it-out**: `/proxy/:name/*` 가 `X-Service-Token` 을 주입해 백엔드로 프록시. 유저 JWT 가 필요한 엔드포인트는
  Scalar Authorization 입력란에 access token 을 직접 넣는다(게이트웨이는 서비스토큰 계층만 통과시킴).

### NestJS: ServiceTokenGuard

- 위치: **`@csc/net-utils/nest` 의 `ServiceTokenGuard`** (전 NestJS 서버 공용: 앱별 복제 없음).
- 적용: 각 서버 `app.module` 에서 **`APP_GUARD` 전역 가드**로 등록(모든 엔드포인트 fail-closed).
- 검증: `process.env.SERVICE_TOKEN_SECRET`(`resolveServiceSecret`, prod 미설정 시 fail-closed) + `ALLOWED_SERVICES`(쉼표 구분, 미설정 시 기본 화이트리스트)로 서명, 만료, `service` 클레임 검증. 로직은 코어 `verifyServiceToken` 위임.

### FastAPI (video-model / file-upload): Service Token Middleware

- 위치: **공유 `csc_net_utils.middleware` 의 `ServiceTokenMiddleware`** (+ `csc_net_utils.service_token`): 앱별 복제 없음.
- Starlette/FastAPI 미들웨어로 `X-Service-Token`(HS256) 서명, 만료, `service` 클레임 검증. health/docs 등은 예외 prefix.
- 검증 정책 (prod = **fail-closed**):
  - `SERVICE_TOKEN_SECRET` **필수**: 미설정 시 prod 기동 실패(미들웨어 비활성화 금지).
  - `X-Service-Token` 헤더 없음/유효하지 않음 → **401 Unauthorized** (IP 화이트리스트에만 의존하지 않는다)

---

## Layer 4: App IP Guard (미구현: 설계만)

> **이 계층은 아직 없다.** `ip_guard` 미들웨어도, `ALLOWED_IPS` 를 읽는 코드도 저장소에 없다.
> `ALLOWED_IPS` 는 prod/staging 의 `ai/.env.example` 에만 선언돼 있고 소비하는 코드가 없다.
> **따라서 지금 실제로 동작하는 방어는 Layer 1~3 이다.** 이 절을 근거로 앞 계층을 느슨하게
> 잡으면 안 된다.
>
> 붙일 때는 아래 설계대로 구현하고 이 경고 문단을 지운다. Layer 1(nginx)이 이미 IP 를 제한하므로
> 이 계층의 값은 "nginx 를 우회한 내부 호출까지 막는다"는 이중화이고, 그래서 우선순위가 낮다.

video-model(FastAPI)에 애플리케이션 레벨 IP 화이트리스트를 두는 설계다. Starlette/FastAPI 미들웨어로 클라이언트 IP를 검사한다.

### 환경변수

```
ALLOWED_IPS=10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.1,::1,::ffff:127.0.0.1,<관리자_공인_IP>
# 실제 공인 IP 값은 저장소에 커밋하지 말고 배포 환경의 환경변수/시크릿으로 주입한다.
```

### 미들웨어 적용 범위

| 서버 | 적용 경로 | 미적용 경로 |
|------|----------|-----------|
| video-model | `/render/*`, `/admin/*` | `/health`, `/info` |

- 위치(예정): `apps/api/fastapi/video-model/app/middleware/ip_guard.py`
- 화이트리스트 외 IP는 403 Forbidden 반환

---

## Docker 네트워크 통신

### BFF → 백엔드 (내부 네트워크)

```
web-groupware (SvelteKit BFF)
  ├─ PRIVATE_API_URL=http://api-csc-groupware:3000
  ├─ PRIVATE_MARKETING_API_URL=http://api-csc-marketing:3003
  ├─ PRIVATE_USER_API_URL=http://api-user:3002
  ├─ PRIVATE_STORAGE_API_URL=http://api-file-service:8000
  ├─ PRIVATE_LANGUAGE_MODEL_API_URL=http://api-language-model:8010
  └─ PRIVATE_LOG_SERVER_API_URL=http://api-log-server:8020

web-control-tower (SvelteKit BFF)
  └─ 자기 타깃(csc-control-tower 등)의 PRIVATE_* 를 같은 방식으로 주입

**web BFF 는 video-model 을 직접 부르지 않는다.** 영상 렌더는 csc-marketing 이 위임한다(아래).
```

### 백엔드 간 통신 (내부 네트워크)

```
csc-control-tower → user:        USER_API_URL=http://api-user:3002
csc-marketing     → video-model:  MARKETING_VIDEO_API_URL=http://api-video-model:8000
csc-marketing     → data-collector / language-model / file-upload / log-server (각 *_API_URL)

env 변수 이름은 앱이 개명되기 전 값을 유지한다(MARKETING_VIDEO_API_URL). 코드가 그 이름으로
읽으므로 문서가 앞서 바꾸면 배선이 어긋난다. 호스트명은 compose 서비스명(api-video-model)이다.
```

> 모든 내부 통신은 Docker 네트워크를 사용하며, nginx를 거치지 않음. 서버 간 호출에는 `X-Service-Token`을 첨부함

### 교차호스트 통신 (미디어 파이프라인: web-server ↔ video-ai-server)

미디어 파이프라인은 **web-server(상태: redis/file-service/video-model/DB/디스크)** 와
**video-ai-server(무상태 worker: ffmpeg/AI)** 로 호스트가 분리된다. worker 는 같은 Docker 네트워크가
아니라 **LAN 으로** web-server 의 포트에 접속하므로, 이 경로는 위의 도커 내부 통신과 달리
호스트 포트에 바인딩(0.0.0.0)된다.

```
video-ai-server media-worker ──LAN──▶ web-server:
  REDIS_URL          redis://:<REDIS_PASSWORD>@<web-server>:{6379 staging|6380 prod}
  FILE_SERVICE_URL   http://<web-server>:{8001 staging|9001 prod}   # 원본 GET / 결과 PUT
  VIDEO_SERVICE_URL  http://<web-server>:{8002 staging|9002 prod}   # 콜백/상태
```

방어:
- **redis**: `--requirepass ${REDIS_PASSWORD}`. **prod 는 필수(`:?`)**: 미설정 시 `docker compose`
  기동 거부(fail-closed). staging 은 기본값 폴백(운영성 staging 은 강한 값 권장). 전 서버 동일 값.
- **file-service/video-model**: 서버 간 호출이므로 `X-Service-Token`(worker 신원 `video-model`)
  검증을 통과해야 한다. LAN 도달만으로는 인가되지 않음.
- **방화벽(ufw)**: cross-host 포트(6379/6380/8001/8002/9001/9002)는 **video-ai-server(192.168.0.28)
  에서 오는 트래픽만 허용**하고 그 외 LAN 출처는 거부한다. 구체 명령은
  [infra/docker/README.md](../../infra/docker/README.md) "보안: 미디어 파이프라인 교차호스트 포트" 참고.

---

## 환경변수 일람표

### 보안 관련 환경변수

| 환경변수 | 사용 서버 | Prod 값 | Staging 값 |
|---------|----------|---------|-----------|
| `CORS_ORIGINS` | NestJS (csc-groupware, csc-control-tower) | 각 도메인별 | 각 staging 도메인별 |
| `ALLOWED_ORIGINS` | FastAPI (video-model, file-upload) | `https://example.com,https://admin.example.com` (file-upload 는 admin 포함) | staging 도메인 |
| `SERVICE_TOKEN_SECRET` | 전체 서버 | (고유 비밀값, 전 서버 동일) | (고유 비밀값) |
| `REDIS_PASSWORD` | redis(web) + media-worker(ai) | **필수(`:?`)**: 강한 값, web/ai 동일 | 기본값 폴백(강한 값 권장) |
| `ALLOWED_IPS` | FastAPI (video-model) | Docker CIDR + 관리자 IP | 동일 |
| `ADMIN_ALLOWED_IP` | csc-control-tower (NestJS) | `<관리자_공인_IP>` | 관리자 IP |
| `SWAGGER_USER` | NestJS (csc-groupware, csc-control-tower) | (비밀) | (비밀) |
| `SWAGGER_PASSWORD` | NestJS (csc-groupware, csc-control-tower) | (비밀) | (비밀) |

### 환경변수 파일 위치

| 환경 | 경로 |
|------|------|
| Prod example | `infra/docker/prod/{ai,web}/.env.example` |
| Staging example | `infra/docker/staging/{ai,web}/.env.example` |
| 실제 비밀값 | `docs/workspace/{prod,staging}/secrets.md` |
| 서버 배포 | `~/csc/{prod,staging}/env/` |

---

## 보안 규칙 요약

### 절대 하지 않을 것

1. 브라우저에서 백엔드 API 직접 호출 (반드시 BFF 경유)
2. CORS에 `*` 사용 (프로덕션 환경)
3. `SERVICE_TOKEN_SECRET`을 서버별로 다르게 설정
4. nginx에서 백엔드 API 도메인을 PUBLIC으로 설정
5. (Layer 4 를 구현한 뒤) video-model(FastAPI)에서 IP 화이트리스트 없이 운영

### 새 백엔드 서버 추가 시 체크리스트

1. [ ] nginx 서버 블록에 IP 제한 추가
2. [ ] CORS 오리진을 환경변수로 설정
3. [ ] `SERVICE_TOKEN_SECRET` 환경변수 추가 + Guard/Middleware 적용
4. [ ] Docker 내부 네트워크 통신용 `PRIVATE_*` 환경변수 추가
5. [ ] `env.example` 파일 업데이트 (prod + staging)
6. [ ] `docs/workspace/*/secrets.md`에 실제 값 기록

### API 문서 접근 규칙

- nginx IP 제한 + BasicAuth(또는 FastAPI 인증 Depends) 이중 보호
- `return 404` 제거: IP 제한 범위에서만 접근 가능하므로 불필요

---

## 참고 문서

- [system-architecture.md](./system-architecture.md): 전체 시스템 아키텍처
- [request-flow.md](./request-flow.md): 요청 흐름 상세
- [api-architecture.md](./api-architecture.md): 코드 레벨 아키텍처
