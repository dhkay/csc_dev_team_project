# 인증 프로세스 플로우

## 개요

csc 웹 인증은 **BFF 패턴** 기반으로, 모든 토큰을 HTTP-only 쿠키에 저장하며 브라우저에 토큰을 노출하지 않는다.

인증/계정의 게이트키퍼는 **`apps/api/nestjs/user` (NestJS) 서버**다. 이 서버가 **다중 유저 타입**
(`APP_USER` / `WEB_USER` / `ADMIN_USER`)의 로그인, 회원가입, 토큰 발급/갱신을 담당한다.

| web 앱 | 로그인 유저 타입 | 정체성 테이블 / 로그인 엔드포인트 |
|--------|----------------|----------------------------------|
| `apps/web/groupware` (일반 사용자 웹) | `WEB_USER` | `organization_users`(조직유저), `POST /user-api/login/email` |
| `apps/web/control-tower` (관리자 웹) | `ADMIN_USER` | `admin_users`(벤더 운영자), `POST /user-api/login/platform/email` |
| (모바일/외부 클라이언트) | `APP_USER` | `organization_users`(조직유저) |

> 브라우저는 자기 web 서버의 `routes/api/...` BFF 만 호출하고, BFF 가 `user` 서버로 중계하며
> 토큰을 HTTP-only 쿠키에 심는다. 토큰 발급 시 유저 타입(audience)을 클레임에 포함한다.
>
> **정체성 분리(멀티테넌시 2계층)**: 관리자유저(control-tower)는 `admin_users`, 조직유저(groupware)는
> `organization_users` 테이블로 **분리**되어 별개 로그인 경로를 씁니다. 토큰의 `principalType`(ADMIN_USER /
> ORGANIZATION_USER)이 refresh/find-data 의 조회 테이블을 라우팅한다. 조직유저는 토큰의 `features`/`aiTools`
> (유효 엔타이틀먼트 key)로 기능, AI도구 인가를 받는다. 자세한 설계는 [multi-tenancy.md](./multi-tenancy.md) 참고.

---

## 토큰 구조

| 토큰 | 발급 서버 | JWT Secret | JWT 만료 | 쿠키 maxAge | sameSite | 상태 |
|------|----------|-----------|---------|------------|---------|------|
| Access Token | `user` 서버 | `JWT_SECRET` | 60일 | 1일 | lax | 구현 |
| Refresh Token | `user` 서버 | `JWT_REFRESH_SECRET` | ~10일 | 10일 | lax | 구현 |
| Service Token | 각 서버 | `SERVICE_TOKEN_SECRET` | 1시간 | N/A (헤더) | N/A | 구현 |
| OAuth Bridge | BFF | base64 인코딩 | 5분 | 5분 | lax | **미구현**(소셜 로그인 계획) |

> **쿠키 maxAge < JWT 만료**: 쿠키가 먼저 만료되어 proactive refresh를 유도
> **userType(audience)**: Access Token 클레임에 `userType`(APP_USER|WEB_USER|ADMIN_USER)을 담아
> 각 백엔드 서버가 대상 유저군을 구분/인가한다.
> **principalType(테이블 라우팅)**: Access, Refresh 토큰 **양쪽**에 `principalType`(ADMIN_USER|ORGANIZATION_USER)을 담는다.
> `admin_users.id` / `organization_users.id` 가 독립 시퀀스라 refresh/logout/find-data 가 이 값으로 조회 테이블을 정한다
> (레거시 토큰: 구 `PLATFORM_ADMIN→ADMIN_USER`, `TENANT_USER`/`SERVICE_USER`→`ORGANIZATION_USER`, 클레임 없으면 `ORGANIZATION_USER` 폴백). 플랫폼(관리자유저) 토큰은 `organizationId` 없이 `organizationType=PLATFORM` 으로 발급된다.
> **엔타이틀먼트(features/aiTools)**: 조직유저 access 토큰에 유효 기능/AI도구 key 목록을 실어 다운스트림이 토큰만으로 인가한다(관리자/플랫폼 토큰은 생략).

---

## 쿠키 설정

```
모든 인증 쿠키 공통 옵션:
- path: '/'
- httpOnly: true
- secure: true (prod/staging), false (dev)
- sameSite: 'lax'
```

| 쿠키 이름 | 용도 | maxAge | 상태 |
|-----------|------|--------|------|
| `access_token` | JWT 액세스 토큰 | 1일 | 구현 |
| `refresh_token` | JWT 리프레시 토큰 | 10일 | 구현 |
| `oauth_bridge` | OAuth 리다이렉트 임시 토큰 | 5분 | **미구현**(소셜 로그인 계획) |
| `google_id_token` | 소셜 회원가입용 Google ID Token | 10분 | **미구현**(소셜 로그인 계획) |

### sameSite 정책

- `lax`: 인증 토큰 (access_token, refresh_token), OAuth 관련 쿠키
  - top-level navigation(리다이렉트, 링크 클릭)에서 쿠키 전송됨
  - cross-site POST 요청에는 미전송 → CSRF 방어
  - OAuth 리다이렉트(Google → 우리 사이트)에서 쿠키 유지 보장
- `strict`는 사용하지 않음. OAuth cross-site 리다이렉트에서 쿠키 유실 위험

### 로컬 dev 호스트 분리 (쿠키 격리)

인증 쿠키는 `domain` 미지정 = **host-only** 이고 **포트로 격리되지 않는다.** 따라서 dev 에서 두 web 앱을
같은 `localhost` 로 띄우면 `access_token`/`refresh_token`(같은 이름)을 **한 쿠키 jar 로 공유**해, 한 앱
로그인이 다른 앱 토큰을 덮어쓴다(예: groupware 테넌트 로그인 → control-tower 플랫폼 API 가 테넌트 토큰을
들고 가 `PlatformAdminGuard` 403). prod 는 도메인이 갈려(`example.com` ↔ `admin.example.com`) 자동 격리되므로
dev 에서도 **앱별 호스트를 분리**해 동일 모델을 유지한다.

| 앱 | dev 접속 URL | prod 대응 |
|----|-------------|-----------|
| web-groupware | `http://localhost:5173` | apex (example.com) |
| web-control-tower | `http://admin.localhost:5174` | admin.example.com |

- `*.localhost` 는 브라우저가 자동으로 127.0.0.1 루프백 처리(hosts 편집 불필요).
- control-tower `hooks.server.ts` 가 **dev 에서 `localhost`/`127.0.0.1` 문서 네비게이션을 `admin.localhost` 로 307 리다이렉트**해, 실수로 bare localhost 를 열어도 격리가 유지된다(prod 무관: `import.meta.env.DEV` 가드).
- 향후 내부 admin 앱 추가 시 동일 패턴(`<app>.localhost` dev / `<app>.example.com` prod).

---

## 이메일 로그인 플로우

```
1. 브라우저
   └─ POST /api/auth/login { email, password }

2. BFF (+server.ts)
   ├─ 점검 모드 체크 (checkMaintenanceForLogin)
   ├─ POST /auth/login/email → user 서버 (userType 은 web 앱별로 결정)
   ├─ 응답: { token, refreshToken, profile }
   ├─ cookies.set('access_token', token, AUTH_COOKIE_CONFIG)
   ├─ cookies.set('refresh_token', refreshToken, AUTH_COOKIE_CONFIG)
   └─ return { success: true, data: { profile } }

3. 브라우저
   └─ window.location.href = '/'   (또는 /dashboard)

4. hooks.server.ts (리다이렉트 도착)
   ├─ 쿠키에서 access_token 읽기
   ├─ checkTokenStatus() → 'valid'
   ├─ event.locals.accessToken = token
   └─ event.locals.userId = payload.id

5. +page.server.ts (대상 페이지)
   ├─ ensureTokens() → 정규 토큰 확인 → 통과
   └─ authClient(event) → 사용자 정보 조회 → 페이지 렌더링
```

---

## Google OAuth 로그인 플로우 (미구현: 설계만)

> **아직 코드가 없다.** 이 절과 다음 절(브릿지 토큰)은 소셜 로그인을 붙일 때의 설계이고, 지금
> 저장소에는 그 구현이 없다. `oauth_bridge`/`google_id_token` 쿠키, `/auth/callback` 라우트,
> `oauthTokenManager`, user 서버의 `/auth/login/social` 중 어느 것도 존재하지 않는다.
> 지금 동작하는 로그인 경로는 위의 **이메일 로그인** 하나뿐이다.
>
> 붙일 때는 이 흐름을 그대로 구현하고 이 경고 문단을 지운다. 설계를 지우지 않는 이유는, 쿠키
> 수명과 브릿지 토큰의 존재 이유(리다이렉트 중 쿠키 유실 대비)가 다시 정할 값이 아니기 때문이다.

```
1. 브라우저
   └─ Google OAuth 버튼 클릭
   └─ redirect → accounts.google.com/o/oauth2/v2/auth

2. Google
   └─ 사용자 인증 후
   └─ redirect → /auth/callback?code=xxx&state=xxx

3. /auth/callback (+page.server.ts)
   ├─ exchangeCodeForToken(code) → Google API
   │   └─ 응답: { id_token, access_token }
   ├─ extractEmailFromIdToken(id_token) → 이메일 추출
   ├─ 점검 모드 체크 (checkMaintenanceForLogin)
   ├─ POST /auth/login/social → user 서버
   │   ├─ 성공 (201): { token, refreshToken }
   │   └─ 실패 (403): 회원가입 필요
   │
   ├─ [성공 시]
   │   ├─ tokenManager.setRegularTokens() → 정규 토큰 쿠키 즉시 설정
   │   ├─ tokenManager.setBridgeToken() → 브릿지 토큰 fallback 설정
   │   └─ redirect 302 → '/'   (또는 /dashboard)
   │
   └─ [회원가입 필요 시]
       ├─ cookies.set('google_id_token', id_token)
       └─ redirect 302 → /login?social_signup=required

4. hooks.server.ts (리다이렉트 도착)
   ├─ 쿠키에서 access_token 읽기 (정규 토큰이 이미 설정됨)
   ├─ checkTokenStatus() → 'valid'
   └─ event.locals.accessToken 설정

5. +page.server.ts (대상 페이지)
   ├─ ensureTokens() → 정규 토큰 확인 + 브릿지 토큰 정리
   └─ 페이지 렌더링
```

### OAuth 브릿지 토큰 메커니즘

브릿지 토큰은 OAuth 리다이렉트 과정에서의 안전망:
1. `/auth/callback`에서 정규 토큰 + 브릿지 토큰 모두 설정
2. 리다이렉트 후 대상 페이지의 `ensureTokens()`에서:
   - 정규 토큰이 있으면 → 브릿지 토큰만 정리
   - 정규 토큰이 없으면 → 브릿지 토큰에서 변환 (fallback)
3. 변환 후 브릿지 토큰 삭제

---

## 토큰 자동 갱신 (hooks.server.ts)

**모든 페이지/API 요청마다** `hooks.server.ts`의 `handleTokenRefresh()`가 실행됨.

```
요청 도착
  ↓
[/api/auth/* 경로?] → Yes: 기존 쿠키만 반영, 갱신 건너뜀
  ↓ No
handleTokenRefresh()
  ↓
checkTokenStatus(accessToken, refreshToken)
  ├─ 'no_access_token' (둘 다 없음) → 비인증 상태, 통과
  ├─ 'valid' (액세스 토큰 유효) → locals에 설정, 통과
  ├─ 'no_refresh_token' (액세스 만료 + 리프레시 없음) → 쿠키 삭제
  └─ 'needs_refresh' (액세스 만료 + 리프레시 있음)
       ↓
     PATCH /auth/refresh → user 서버 (refresh_token 전달)
     (retryOnNetworkError: 배포 전환 대응)
       ├─ 성공: 새 토큰 쌍 쿠키 저장 + locals 설정
       ├─ 401/403: 쿠키 삭제 (토큰 무효화됨)
       └─ 네트워크 에러: 기존 토큰 유지 (페이지에서 재시도 기회)
```

### /api/auth/* 경로 바이패스

인증 관련 BFF 엔드포인트(`/api/auth/login`, `/api/auth/logout`, `/api/auth/refresh`)는 토큰 갱신 훅을 건너뜀:
- 로그인: 새 토큰을 설정하는 중이므로 갱신 불필요
- 로그아웃: 토큰을 삭제하는 중이므로 갱신 불필요
- 리프레시: 자체적으로 갱신하므로 hooks 갱신과 충돌 방지

---

## 로그아웃 플로우

```
1. 브라우저
   └─ POST /api/auth/logout

2. BFF (+server.ts)
   ├─ cookies.delete('access_token', AUTH_COOKIE_CONFIG.ACCESS_TOKEN.options)
   ├─ cookies.delete('refresh_token', AUTH_COOKIE_CONFIG.REFRESH_TOKEN.options)
   └─ return { success: true }

3. 브라우저
   └─ window.location.href = '/login'
```

> 백엔드 호출 없이 쿠키만 삭제. Refresh Token Rotation으로 이전 토큰은 자동 무효화됨.

---

## 클라이언트 에러 인터셉터

**파일:** `lib/infrastructure/http/interceptors/errorInterceptor.ts`

브라우저에서 401 응답을 받으면:
1. `/api/auth/logout` 호출 → 쿠키 삭제
2. `window.location.href = '/login'` → 로그인 페이지 이동

> `/login` 경로에서는 무한 루프 방지를 위해 동작하지 않음

---

## 세션 사용자 조회 (hooks.server.ts)

루트 `+layout.server.ts` 는 없다. 세션 사용자는 `hooks.server.ts` 가 `event.locals.getUser` 로
한 번 심어 두고, 그것을 필요한 곳(BFF 핸들러, 페이지 서버 로드)이 꺼내 쓴다.

```
hooks.server.ts
  ├─ 쿠키에서 access_token 확인 + 필요하면 갱신(위 절)
  ├─ event.locals.accessToken / userId 설정
  └─ event.locals.getUser = () => 토큰 클레임에서 사용자 해석

각 BFF/페이지 로드
  └─ const user = await event.locals.getUser()   → 없으면 401/리다이렉트
```

**왜 레이아웃이 아니라 훅인가:** 레이아웃 로드는 그 레이아웃 아래 라우트에만 걸리고, BFF
(`routes/api/...`)에는 걸리지 않는다. 훅은 두 경로를 모두 지나므로 검증 지점이 하나로 모인다.

권한 게이트는 이 값을 받아 도메인별 헬퍼가 판정한다(예: `lib/server/marketing/bff.ts` 의
`requireOrgId`/`requireOrgUser`/`requireChannelManager`).

---

## 로그인 페이지 가드

**파일:** `routes/login/+page.server.ts`

이미 로그인된 상태(locals.accessToken 존재)이면:
- redirect 302 → `/`   (또는 /dashboard)

---

## 점검 모드 (Maintenance Guard) (미구현: 설계만)

> **아직 코드가 없다.** `lib/infrastructure/maintenance/` 는 `.gitkeep` 만 있는 예약 자리이고,
> `MAINTENANCE_MODE` 를 읽는 코드도 그 값을 담을 설정 테이블도 없다. 아래 표의 회원가입 엔드포인트
> (`/api/signup/*`)와 OAuth 콜백도 마찬가지로 존재하지 않는다.
>
> 붙일 때는 이 설계대로 구현하고 이 경고 문단을 지운다. Fail-open 과 30초 TTL 은 다시 정할 값이
> 아니라서 남긴다(설정 서버가 죽었을 때 로그인이 막히면 점검 모드가 장애를 키운다).

**파일(예정):** `lib/infrastructure/maintenance/maintenanceGuard.ts`

BFF 레벨에서 로그인/회원가입을 차단하는 메커니즘:
- 설정 서버(csc-control-tower 또는 user 서버)의 설정 테이블에서 `MAINTENANCE_MODE` 조회
- 30초 TTL 인메모리 캐시
- 화이트리스트 이메일은 점검 중에도 허용
- Fail-open: 설정 서버 장애 시 점검 모드 비활성으로 처리

적용 지점:
| BFF 엔드포인트 | 차단 시 응답 |
|---------------|------------|
| `POST /api/auth/login` | `errorCode: 'MAINTENANCE_LOGIN_BLOCKED'` |
| `POST /api/signup/register` | 403 |
| `POST /api/signup/social-register` | 403 |
| `GET /auth/callback` (OAuth) | redirect → `/login?error=maintenance_blocked` |

---

## 쿠키 삭제 규칙

**중요:** 쿠키 삭제 시 반드시 설정 시와 동일한 옵션(`AUTH_COOKIE_CONFIG.*.options`)을 사용해야 함.
`{ path: '/' }`만 전달하면 `sameSite`, `secure`, `httpOnly` 불일치로 브라우저가 쿠키를 삭제하지 못할 수 있음.

```typescript
// 올바른 삭제
cookies.delete(AUTH_COOKIE_CONFIG.ACCESS_TOKEN.name, AUTH_COOKIE_CONFIG.ACCESS_TOKEN.options);

// 잘못된 삭제 (옵션 불일치 위험)
cookies.delete(AUTH_COOKIE_CONFIG.ACCESS_TOKEN.name, { path: '/' });
```

---

## 파일 위치 요약 (apps/web/groupware 기준: apps/web/control-tower 도 동일 구조)

경로는 `apps/web/groupware/src/` 기준이다.

| 역할 | 파일 |
|------|------|
| **쿠키 설정** | `lib/app/config/cookies.ts` |
| **토큰 유틸** | `lib/shared/lib/utils/authTokenUtils.ts` |
| **서버 훅**(토큰 갱신 + 세션 사용자) | `hooks.server.ts` |
| **이메일 로그인 BFF** | `routes/api/auth/login/+server.ts` |
| **로그아웃 BFF** | `routes/api/auth/logout/+server.ts` |
| **로그인 페이지 가드** | `routes/login/+page.server.ts` |
| **에러 인터셉터** | `lib/infrastructure/http/interceptors/errorInterceptor.ts` |
| **HTTP 클라이언트** | `lib/infrastructure/http/serverClientInstances.ts` |

토큰 갱신에는 **BFF 라우트가 없다.** `hooks.server.ts` 가 user 서버 `/user-api/refresh` 를 직접
호출한다(위 "토큰 자동 갱신" 절). 훅이 `/api/auth/*` 를 건너뛰는 것은 로그인, 로그아웃 핸들러가
쿠키를 쓰는 중에 끼어들지 않기 위한 것이다.

아직 없는 파일(위 미구현 절들이 붙을 자리):

| 역할 | 파일(예정) |
|------|-----------|
| 소셜 로그인 BFF | `routes/api/auth/social-login/+server.ts` |
| OAuth 콜백 | `routes/auth/callback/+page.server.ts` |
| OAuth 토큰 매니저 | `lib/features/account/oauth/services/oauthTokenManager.ts` |
| 점검 모드 | `lib/infrastructure/maintenance/maintenanceGuard.ts` |

---

## 인증 스펙 문서

상세 스펙(비밀번호 규칙, 에러 코드, 계정 상태, 유저 타입별 권한 등)은 [auth-specification.md](../../docs/specs/auth-specification.md) 참고.
