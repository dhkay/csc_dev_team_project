# scalar-gateway: 통합 API 문서 포털

5개 백엔드(NestJS 3 + FastAPI 2)의 OpenAPI 스펙을 **한 페이지(Scalar UI)** 에서 조회하고,
Try-it-out 으로 실제 호출 테스트까지 한다. 내부 전용(nginx IP allowlist + BasicAuth).

## 설계: 확장은 registry 한 줄

서버 목록의 **단일 진실원은 [`src/registry.ts`](src/registry.ts)** 다. UI 드롭다운, 스펙 프록시, 호출
프록시가 전부 이 배열에서 파생된다.

**신규 백엔드 추가:**
1. `src/registry.ts` 에 항목 1개 추가(`name`/`label`/`kind`/`baseUrl`).
2. 그 백엔드의 `ALLOWED_SERVICES` 에 `scalar-gateway` 등록(서비스토큰 호출 허용).
3. (NestJS면) 그 서버 `main.ts` 에서 `setupOpenApi(app, { title })` 호출: `/openapi.json` 노출.
4. compose 에 `<NAME>_API_URL` env 주입(내부 컨테이너명:포트).

UI(Scalar)는 표준 OpenAPI 만 소비하는 **교체 가능 레이어**: registry/프록시에만 결합한다.

## 라우트

| 경로 | 설명 |
|------|------|
| `GET /` | Scalar UI (registry 소스 드롭다운) |
| `GET /specs/:name/openapi.json` | 백엔드 스펙 수집(서비스토큰) + `servers` 를 `/proxy/:name` 으로 rewrite |
| `ALL /proxy/:name/*` | 백엔드로 프록시. `X-Service-Token` 주입, 유저 JWT(Bearer)만 통과 |
| `GET /health` | 헬스체크(인증 면제) |

## 환경변수

| 변수 | 용도 | dev 기본값 |
|------|------|-----------|
| `PORT` | 리슨 포트(로컬 충돌 회피용 3300, 도커는 env 로 3000 주입) | `3300` |
| `SERVICE_TOKEN_SECRET` | 서비스토큰 서명(전 서버 공유) | dev 폴백 |
| `SWAGGER_USER` / `SWAGGER_PASSWORD` | BasicAuth(미설정 시 비활성) | 미설정 |
| `GROUPWARE_API_URL` | csc-groupware 내부 base | `http://localhost:3000` |
| `CONTROL_TOWER_API_URL` | csc-control-tower 내부 base | `http://localhost:3001` |
| `USER_API_URL` | user 내부 base | `http://localhost:3002` |
| `VIDEO_SERVICE_URL` | marketing-video 내부 base | `http://localhost:8000` |
| `FILE_SERVICE_URL` | file-upload 내부 base | `http://localhost:8001` |

## 한계

게이트웨이는 **서비스토큰 계층만** 통과시킨다. 유저 JWT 가 필요한 엔드포인트(예: `user` 보호 라우트)는
Scalar 의 Authorization 입력란에 access token 을 직접 넣어야 실제 호출이 된다. 게이트웨이는 유저 토큰을
발급/대행하지 않는다.

## 로컬 실행

`pnpm run dev`(turbo)에 **자동 포함**된다. 워크스페이스 패키지의 `dev` 스크립트를 turbo 가 모두 실행한다.
포털은 **http://localhost:3300** 에 뜬다(백엔드 3000~3002, 8000~8001 과 겹치지 않게 3300 기본).

```bash
pnpm run dev                              # 전체(백엔드+web+포털) 한 번에
# 또는 포털만
pnpm --filter @csc/scalar-gateway dev     # tsx watch (src/index.ts)
```

백엔드가 떠 있는 서버만 스펙이 채워지고, 안 떠 있는 서버는 비어 보인다(정상).
`pnpm kill:scalar-gateway`(또는 `kill:all`)로 포트 정리.
