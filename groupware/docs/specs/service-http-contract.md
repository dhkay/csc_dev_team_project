# 서버 간 HTTP 통신 계약 (Service HTTP Contract)

이 문서는 csc 백엔드들이 **서버 간 HTTP 호출**에서 지켜야 하는 **단일 진실원(SSOT)** 이다.
TS(`@csc/net-utils`)와 Python(FastAPI 공유 모듈)은 **코드는 두 벌**이지만 이 계약을 **동일하게** 구현한다.

> 관련: [security-architecture.md](../../.claude/rules/security-architecture.md)(4계층 방어),
> [request-flow.md](../../.claude/rules/request-flow.md), [auth-process-flow.md](../../.claude/rules/auth-process-flow.md).

---

## 1. 서비스 토큰 (Layer 3)

서버 간 호출은 **`X-Service-Token` 헤더**(HS256 JWT)로 인증한다. 사용자 세션 토큰과 별개다.

### 헤더
```
X-Service-Token: <HS256 JWT>
```

### JWT 구조 (표준 HS256: jsonwebtoken / node:crypto / Python hmac 상호호환)
- header: `{ "alg": "HS256", "typ": "JWT" }`
- payload: `{ "service": <호출자명>, "iat": <unix초>, "exp": <unix초> }`
- signature: `HMAC_SHA256( base64url(header) + "." + base64url(payload), SERVICE_TOKEN_SECRET )`
- TTL: **3600초(1시간)**

> base64url 은 **패딩(`=`) 제거**. 서명 입력은 `${header_b64}.${payload_b64}`.

### 시크릿: `SERVICE_TOKEN_SECRET`
- **전 서버 동일 값**. prod/staging 은 **필수**(미설정 시 기동 실패 = fail-closed).
- 개발(`NODE_ENV!=production` / 비-prod)에서만 명시적 dev 폴백 `dev-only-service-secret` 허용.

### 호출자 식별자(`service` 클레임): 단일 출처
토큰의 `service` 값은 **호출받는 서버의 `ALLOWED_SERVICES` 화이트리스트와 글자 그대로 일치**해야 한다.

| 호출 주체 | `service` 값 |
|---|---|
| web-groupware BFF | `web-groupware` |
| web-control-tower BFF | `web-control-tower` |
| csc-groupware | `csc-groupware` |
| csc-control-tower | `csc-control-tower` |
| user | `user` |
| csc-marketing | `csc-marketing` |
| csc-mes (MES 제조실행) | `csc-mes` |
| marketing-video 워커(콜백) | `video-model` |
| scalar-gateway (통합 API 문서 포털) | `scalar-gateway` |
| log-server (통합 로그 수집/조회) | `log-server` |

> `log-server` 는 **수신 전용**이다. 전 백엔드가 로그를 보내오지만 자신은 아무도 호출하지 않는다.
> 따라서 타 서버의 `ALLOWED_SERVICES` 에 `log-server` 를 넣을 필요는 없고, 반대로 log-server 의
> `ALLOWED_SERVICES` 에 **모든 프로듀서**가 등록되어 있어야 한다. 조회(`/logs/search`, `/logs/usage`)는
> 라우트별 `require_services` 로 web BFF 만 남긴다.

### 예외: 서비스 토큰을 갖지 않는 클라이언트 (현장 PC)

> **`SERVICE_TOKEN_SECRET` 을 설치형 클라이언트 바이너리에 넣지 않는다. 어떤 형태로도.**

이 시크릿은 **전 서버가 공유**한다. 현장 PC 수백 대에 배포된 바이너리에서 한 번 유출되면
그 시크릿을 신뢰하는 **모든** csc 백엔드가 위조 호출에 열린다. 난독화나 분할 저장으로 줄일 수
있는 위험이 아니다.

그래서 `apps/desktop/mes`(Tauri 현장 PC 앱)는 이 계약의 밖에 있고, `csc-mes` 는 모노레포에서
**BFF 를 거치지 않는 최초의 클라이언트 진입점**이 된다.

| 축 | 서버 간 호출 | 현장 단말 |
|---|---|---|
| 인증 | `X-Service-Token`(HS256, 공유 시크릿) | `Authorization: Bearer`(유저 JWT) + `X-Device-Token` |
| 신뢰 근거 | 호출자가 우리 서버다 | 사람(JWT) 과 등록된 단말(디바이스 토큰) 둘 다 확인 |
| 발급 | 각 서버가 자체 생성 | 유저 JWT 는 user 서버, 디바이스 토큰은 csc-mes 의 enrollment |
| 폐기 | 시크릿 교체(전 서버 동시) | 단말 1대만 `REVOKED` (즉시 401) |
| 스코프 | 없음(서버는 전부 신뢰) | `mes_devices.allowed_line_ids` 로 데이터 범위 제한 |

구현: `csc-mes` 의 `MesEdgeGuard`(Phase 1). 두 경로를 모두 받되 **공유 `ServiceTokenGuard` 를
수정하지 않는다.** 거기에 디바이스 분기를 넣으면 나머지 NestJS 서버 4개의 보안 동작까지 바뀐다.
`verifyServiceToken` 검증 함수만 조합으로 재사용한다.

Phase 0 현재는 `csc-mes` 도 공유 `ServiceTokenGuard` 를 쓰고 `/health` 하나만 노출하며,
nginx vhost 도 열려 있지 않다. 가드가 준비되기 전에 공개 노출을 여는 것이 더 위험하기 때문이다.

상세: [mes-sync-protocol.md](./mes-sync-protocol.md), [mes-client-compatibility.md](./mes-client-compatibility.md)

> **새 호출 주체 추가 시 이 표 + 호출받는 모든 서버의 `ALLOWED_SERVICES` 를 함께 갱신**한다.
> `scalar-gateway` 는 등록된 백엔드 전부를 호출(스펙 수집/Try-it-out)하므로 NestJS 가드 기본 화이트리스트와
> FastAPI(file-upload, marketing-video) `ALLOWED_SERVICES`(config 기본값 + compose env)에 모두 등록되어 있다.

### 검증 규칙 (inbound)
1. `X-Service-Token` 없음/형식오류 → **401**
2. 서명 불일치 / `exp` 만료 → **401**
3. `service` 가 `ALLOWED_SERVICES` 에 없음 → **401**(전역) 또는 라우트별 제한 시 **403**
4. 통과 시 호출자 신원을 컨텍스트에 보존(NestJS: 무시 가능 / FastAPI: `request.state.service`), 라우트별로 더 좁힐 수 있다(`require_services`).

### 예외 경로 (검증 제외)
헬스/문서: `/health`, `/info`, `/docs`, `/openapi.json`, `/redoc`.
- FastAPI: `ServiceTokenMiddleware` 의 `DEFAULT_EXEMPT_PREFIXES`.
- NestJS: 공유 `ServiceTokenGuard` 가 동일 prefix 를 면제(`SERVICE_TOKEN_EXEMPT_PREFIXES` 로 환경별 override 가능).
  통합 문서 포털(scalar-gateway)이 `/openapi.json` 을 수집할 수 있도록 노출: 내부망/nginx IP allowlist 한정.
file-upload 의 브라우저 직접 경로: `/blob`, `/files/`(별도 서명 토큰, IP allowlist 로 보호).

---

## 2. 에러 응답 봉투 (Error Envelope)

모든 백엔드의 에러 응답 본문은 다음 모양을 따른다(모든 필드 선택적):

```jsonc
{
  "error":   "사람이 읽는 짧은 메시지",   // 선택
  "message": "사람이 읽는 메시지",        // 선택 (NestJS 기본 필드)
  "code":    "MACHINE_CODE",            // 선택 (도메인 에러 코드)
  "details": { /* 도메인 부가정보 */ }   // 선택 (예: remainingSeconds)
}
```

- **FastAPI 기본**은 `{ "detail": ... }` 를 쓴다. 서버 간 계약에서는 위 봉투로 **정규화**하되,
  클라이언트는 메시지 추출 시 `error → message → detail` 순으로 읽어 호환을 유지한다.
- 호출하는 쪽(클라이언트)은 상태코드와 이 봉투를 보존해 **정규화된 에러**로 던진다(아래 3).

---

## 3. HTTP 클라이언트 동작 (outbound)

서버 간 호출 클라이언트는 다음을 **공통**으로 제공한다(TS `createHttpClient`, Python httpx 헬퍼).

| 항목 | 규약 |
|---|---|
| 헤더 | `Content-Type: application/json`(본문 있을 때) + `X-Service-Token` 자동 주입 |
| 타임아웃 | 기본 **10초**(호출처별 override; 예: 콜백 15s, 다운로드 60s) |
| 재시도 | **네트워크/타임아웃/5xx** 에 한해 지수 백오프(`min(2^n, 30)s`), 기본 **0회**(opt-in). 4xx 는 재시도 안 함 |
| 에러 | 응답 봉투(2)를 파싱해 **정규화 에러**(`HttpError` 등)로 던짐. statusCode, code, details 보존 |
| 메서드 | `get / post / patch / delete` (제네릭 응답 타입) |

> 배포 전환 등 일시 네트워크 단절 대비로 인증 갱신 경로 등은 **재시도 opt-in**을 켠다(기존 BFF `retryOnNetworkError` 동치).

---

## 4. 상관관계 (Correlation)

서버 간 호출을 하나로 꿰는 값. 이게 없으면 "기획서 생성 1건"이 csc-marketing → language-model →
video-model → worker 로 흐르는 걸 사후에 이어붙일 방법이 없다.

### 두 개의 id: 역할이 다르다

| 헤더 | 수명 | 만드는 곳 |
|---|---|---|
| `X-Trace-Id` | 사용자 행위 1건의 **끝에서 끝까지**. 홉을 넘어도 **불변** | 진입점(BFF)에서 생성. 이후 홉은 **그대로 전달** |
| `X-Request-Id` | **이 홉의 HTTP 요청 1건** | **홉마다 새로** 생성 |

"행위 전체"는 trace 로, "이 호출 하나"는 request 로 찾는다. 둘을 하나로 합치면 둘 중 하나를 잃는다.

### 규칙

1. **인바운드**: `X-Trace-Id` 가 있으면 채택, 없으면 생성(= 내가 진입점). `X-Request-Id` 는 **항상 새로 생성**.
2. **아웃바운드**: 공유 클라이언트가 현재 컨텍스트의 두 값을 자동 주입한다. 호출부가 신경 쓸 것이 없다.
3. **응답**: 두 헤더를 되돌려준다. 호출자가 devtools 에서 바로 서버 로그를 찾을 수 있게.
4. **정규화(보안)**: 인바운드 trace 는 **길이 ≤ 64자 + `[A-Za-z0-9_-]` 만** 허용. 어긋나면 버리고 새로 만든다.
   외부 입력이 그대로 로그 저장소로 흘러가므로 로그 인젝션(개행)과 과대 길이를 여기서 끊는다.
5. **컨텍스트 밖(워커, 크론)**: 헤더를 만들지 않는다. 가짜 trace 로 로그를 오염시키지 않는다.
6. **조직 스코프**: `X-Organization-Id` / `X-User-Id` 도 컨텍스트에 함께 담겨 로그가 자동으로 조직 스코프를 갖는다.
   단 이 값은 **로그 스코프 힌트일 뿐 인가 근거가 아니다**: 형식이 어긋나도 요청을 거부하지 않는다.

   같은 헤더를 **신원으로 요구하는 라우트**는 그것을 명시적으로 선언한다(`get_identity` 의존성).
   그때는 없거나 형식이 어긋나면 400 이고, 값은 신뢰된다. 신뢰의 근거는 헤더 자체가 아니라 그
   요청이 **유효 서비스토큰과 함께 왔다**는 사실이다(허용된 피어만 보낼 수 있다). 지금 그렇게 쓰는
   것은 file-upload 의 `/storage/*` 다. 조직과 사용자를 서버가 자기 값으로 확인해야 스코프를 부풀린
   요청도 조직 경계와 개인 영역을 넘지 못한다.

### 성능 (모든 요청에서 도는 코드)

- FastAPI 미들웨어는 **순수 ASGI** 로 작성한다. `BaseHTTPMiddleware` 는 요청마다 anyio 태스크 그룹 +
  메모리 스트림 2개를 만들어 **no-op 인데도 +93µs/req**(실측). 헤더만 보는 미들웨어가 낼 비용이 아니다.
- id 는 64비트(16자 hex). uuid4 보다 짧아 헤더 바이트가 절반이고 생성도 9배 빠르다.
  **최적 구현은 런타임마다 다르다**: Node 는 엔트로피 풀링(64ns)이, Python 은 `os.urandom(8).hex()`(83ns)가
  빠르다. 근거/재현: `packages/net-utils/src/request-context.bench.mjs`,
  `apps/api/fastapi/net-utils/bench_middleware.py`.
- Node `AsyncLocalStorage` 오버헤드는 요청당 **≈4ns**(5홉 async 체인 기준). 실질적으로 무시 가능.

---

## 5. 구현 매핑 (두 벌, 한 계약)

| 계약 요소 | TS `@csc/net-utils` | Python 공유 모듈 |
|---|---|---|
| 토큰 발급 | `createServiceToken(secret, service, ttl?)` | `create_service_token(secret, service, ttl?)` |
| 토큰 검증 | `verifyServiceToken(token, secret, allowed)` | `ServiceTokenMiddleware` (순수 ASGI) |
| 라우트 제한 | (NestJS Guard 메타데이터) | `require_services(*allowed)` |
| 상관관계 저장 | `AsyncLocalStorage` (`runWithRequestContext`) | `contextvars` (`set_request_context`) |
| 상관관계 인바운드 | `correlationIdMiddleware` (express) | `CorrelationIdMiddleware` (순수 ASGI) |
| 상관관계 아웃바운드 | `createHttpClient` 가 자동 주입 | `ServiceHttpClient` 가 자동 주입 |
| 신원(org/user) | (BFF 가 헤더 주입) | `get_identity` → `Identity` |
| 에러 타입 | `HttpError` / `ApiErrorBody` / `normalizeError` | `ServiceHttpError` → 봉투 직렬화 |
| 클라이언트 | `createHttpClient(opts)` | `ServiceHttpClient`(커넥션 재사용 + 토큰 + timeout + retry) |

> 알고리즘, 헤더, 클레임, 봉투가 **바이트 단위로 동일**해야 교차 호출이 성립한다. 변경 시 이 문서를 먼저 고치고 두 구현을 함께 바꾼다.

---

## 6. 요청 계약이 어긋날 때 (필수 파라미터)

위 1~5 절은 **전송**의 계약이다. 그것이 다 맞아도 요청 자체가 어긋날 수 있고, 그 어긋남은
타입이 잡지 못한다. URL 이 문자열이기 때문이다.

실제로 겪은 사례. 채널을 개인 소유로 내리면서 `GET /channels` 가 `ownerUserId` 를 필수로 받게
됐는데, 활동 로그 로더만 갱신되지 않았다. 백엔드는 400 을 돌려줬고 로더의 폴백이 그것을 흡수해
원장의 채널 컬럼이 **나흘간 전부 "삭제된 채널"** 로 보였다. 화면만으로는 데이터가 없는 것인지
조회가 깨진 것인지 구분할 수 없었다.

이 종류를 막는 장치 셋.

| 장치 | 무엇을 보장하나 |
|---|---|
| `scripts/check-backend-query-params.mjs` (lint/CI) | 컨트롤러의 필수 쿼리(`@Query('x', Pipe)`)를 호출부가 빠뜨리면 실패 |
| 호출을 부르는 법을 한 곳에 (`apps/web/*/src/lib/server/**`) | 계약이 바뀔 때 고칠 자리가 하나다 |
| `softLoad(what, load, fallback)` | 폴백이 로그를 남긴다. 조용히 나빠지지 않는다 |

### 게이트의 성질

정규식 파서다. 타입 시스템이 아니라 안전망이다. 그래서 **검사 범위를 통과 메시지에 함께 적는다.**

```
백엔드 필수 쿼리 파라미터 검사 통과: 계약 158개(필수 27개) × 호출 114개 중 11개 판정, 위반 0
  미판정: 계약에 필수 쿼리가 없음(검사 대상 아님) 86, 맞는 계약 없음 17
```

"위반 0" 만 적으면 깨끗한 것과 아무것도 판정하지 못한 것이 구분되지 않는다. 매칭 규칙을 조일 때
조용히 후자가 된다. FastAPI 백엔드는 컨트롤러 파서가 없어 `맞는 계약 없음` 으로 집계되며, 그
숫자가 곧 남은 범위다. 호출별 사유는 `--report` 로 본다.

`--selftest` 는 검사기 자신을 본다. 파서가 읽은 핸들러와 필수 파라미터 수를 줄 단위 독립 카운트와
대조하고, 과거에 놓쳤던 호출을 다시 넣어 잡는지 확인한다. 정규식 파서는 조용히 망가질 수 있고
그때 "위반 0" 은 곧 "검사기가 죽었음" 을 뜻하기 때문이다.

### 새 호출을 추가할 때

1. 부르는 법은 `lib/server/**` 의 모듈에 둔다. 페이지 로더나 BFF 라우트에 URL 을 직접 쓰지 않는다.
2. 실패를 폴백으로 접을 거면 `softLoad` 를 쓴다. `catch {}` 로 삼키지 않는다.
3. 폴백의 의미가 호출부마다 다르면 조회 함수는 **던지고**, 접는 판단은 호출부가 한다.
