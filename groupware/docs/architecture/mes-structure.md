# MES 구조 인수인계

> Phase 0(배선)까지 만들어진 것의 **지도**와 **확장 지점**이다.
> 각 결정의 이유는 아래 문서들이 갖고 있고, 이 문서는 그것을 반복하지 않는다.
>
> - 왜 이 레이어 구조인가: [structure-blueprint.md](./structure-blueprint.md) 5절
> - 동기화 프로토콜 전문: [../specs/mes-sync-protocol.md](../specs/mes-sync-protocol.md)
> - 구버전 클라이언트 정책: [../specs/mes-client-compatibility.md](../specs/mes-client-compatibility.md)
> - 앱 실행 방법: [apps/desktop/mes/README.md](../../apps/desktop/mes/README.md)

---

## 1. 다섯 축

MES 는 다섯 덩어리로 되어 있다. 어떤 작업이든 "이건 몇 번 축인가" 부터 정하면 손댈 파일이 좁혀진다.

```
1. 계약    packages/mes-contracts/           TS 가 SSOT
              +-- Rust 미러가 데스크톱 안에 별도로 존재. CI 가 일치를 강제
2. DB      packages/database/src/mesdb/      csc-mes 단독 소유
3. 서버    apps/api/nestjs/csc-mes/          :3004, 헥사고날
4. 클라    apps/desktop/mes/                 SvelteKit(SPA) + Rust(src-tauri)
5. 배선    scripts/, infra/, .github/        레지스트리와 파이프라인
```

### 1-1. 계약 (`packages/mes-contracts`)

zero-dep TS 패키지. 소비자가 셋이라 어느 한쪽에 둘 수 없어서 뺐다(서버, 데스크톱, 나중에 groupware 집계).

```
src/version.ts       WIRE_VERSION, MIN_SUPPORTED_CLIENT, X-Client-* 헤더 상수
src/errors.ts        MesErrorCode, RejectReason, REJECT_RETRYABLE 매핑
src/sync/entity.ts   SyncEntity (동기화 대상 어휘 14종)
src/sync/envelope.ts MutationEnvelope, PushRequest/Response, PullResponse
src/sync/cursor.ts   커서 인코딩. base64url 을 직접 구현(btoa/Buffer 안 씀)
fixtures/*.json      골든 픽스처 3종
```

**계약과 전송을 섞지 않는다.** 여기엔 타입과 상수만 있고 HTTP 클라이언트는 없다. 소비자마다
런타임이 달라서(NestJS axios, Tauri, SvelteKit BFF) 래퍼를 여기 두면 셋 중 둘이 못 쓴다.

**두는 기준은 하나다: 게이트가 검사하거나, 지금 누가 쓰거나.** 둘 다 아니면 스펙 문서에만
둔다. 경로 상수(`/v1/sync/changes` 등)를 뺀 이유가 그것이다. 소비자가 없는 상태에서 코드에
두면 문서와 두 벌이 되고, 그 둘의 일치를 강제하는 것이 아무것도 없다.

### 1-2. DB (`packages/database/src/mesdb`)

Phase 0 은 **동기화 인프라 3테이블**뿐이다. 도메인 테이블은 없다.

| 테이블 | 역할 |
|---|---|
| `mes_org_sequence` | 조직별 seq 할당기. 커밋 순서와 seq 순서를 일치시킨다 |
| `mes_sync_operations` | 멱등 원장. 재전송에 같은 응답을 돌려주는 근거 |
| `mes_devices` | 단말 등록부. 라인 스코프와 디바이스 토큰 해시 |

### 1-3. 서버 (`apps/api/nestjs/csc-mes`)

```
src/main.ts                          correlationId -> ValidationPipe -> ClientVersionInterceptor
src/app.module.ts                    ServiceTokenGuard 전역 (Phase 1 에 MesEdgeGuard 로 교체)
src/health/                          GET /health (비인증). 온라인 감지 프로브
src/shared/http/                     ClientVersionInterceptor (버전 정책 헤더)
src/shared/domain/sync/              @csc/mes-contracts 재노출
src/domains/                         비어 있다. Phase 1 에서 헥사곤이 들어온다
```

### 1-4. 클라이언트 (`apps/desktop/mes`)

```
src/lib/infrastructure/local/        로컬 저장소 포트 + 어댑터 2종(Tauri / 인메모리)
src/lib/infrastructure/sync/         Rust 워커 이벤트 구독
src/lib/infrastructure/device/       스캐너/프린터/PLC 포트 (프린터와 PLC 는 타입만)
src/lib/app/config/                  런타임 config.json 로더
src/routes/diagnostics/              진단 화면
src-tauri/                           Tauri 앱 crate 이자 Rust 워크스페이스 루트
  crates/mes-contracts/              계약 미러(serde) + 골든 픽스처 파싱 테스트
  crates/mes-core/                   outbox 상태 머신, 버전 판정. IO 없음
  crates/mes-store/                  SQLite 소유. rusqlite 가 밖으로 안 샌다
  crates/mes-sync/                   연결 판정(히스테리시스). Phase 1 에 pull/push
```

### 1-5. 배선

| 파일 | 등록한 것 |
|---|---|
| `pnpm-workspace.yaml` | `apps/desktop/*` 글롭 |
| `turbo.json` | `bundle` 태스크(`cache: false`) |
| `package.json`(루트) | `dev:mes`, `kill:mes`, `kill:mes-desktop`, `check:mes-contracts` |
| `scripts/dev-apps.mjs` | `APPS` 에 csc-mes(3004), 신규 `MANUAL_APPS` 에 mes-desktop(5175) |
| `scripts/kill.mjs` | tauri/cargo 프로세스 지문 |
| `scripts/check-endpoint-ids.mjs` | 접두사 `MES` `SYNC` `DEVICE` `EQUIP` |
| `scripts/check-mes-contracts.mjs` | **신규 게이트.** TS 와 Rust 계약 일치 |
| `apps/tools/scalar-gateway/src/registry.ts` | csc-mes 문서 포털 등록 |
| `infra/docker/{dev,staging,prod}/web/` | 서비스 + `MES_DATABASE_URL` + `mesdb` initdb |
| `.github/workflows/checks.yml` | `mes-contracts`, `desktop-rust` 잡 |
| `.github/workflows/release-desktop.yml` | **신규.** 데스크톱 릴리스(태그 트리거) |
| `.dockerignore` | `**/src-tauri/target` (없으면 전 이미지 빌드가 느려진다) |

---

## 2. 확장 지점: 무엇을 어디에

이 문서의 핵심이다. 각 행이 "그 작업에서 손대는 파일 전부" 다.

### 2-1. 동기화 엔티티 하나 추가 (예: 금형 마스터)

| 순서 | 파일 |
|---|---|
| 1 | `packages/mes-contracts/src/sync/entity.ts` 의 `SyncEntity` 에 한 줄 |
| 2 | `apps/desktop/mes/src-tauri/crates/mes-contracts/src/lib.rs` 의 같은 enum 에 한 줄 |
| 3 | `packages/database/src/mesdb/schema/` 에 테이블(공통 동기화 컬럼 5종 필수) |
| 4 | 서버: 그 도메인의 `ChangeFeedPort` / `EntityCommandPort` 어댑터 1개 |
| 5 | 클라: `crates/mes-store/migrations/` 에 로컬 캐시 테이블 |

**2번을 빠뜨리면 CI 가 막는다**(`check-mes-contracts.mjs`). 그게 이 게이트를 만든 이유다.

4번에서 sync 서비스 코드는 손대지 않는다. 어댑터를 레지스트리에 등록하는 것으로 끝나야 하고,
그렇지 않다면 sync 도메인의 포트 설계가 잘못된 것이다.

### 2-2. 도메인 헥사곤 하나 추가 (예: production)

`apps/api/nestjs/csc-mes/src/domains/production/` 을 만들고 `app.module.ts` imports 에 등록한다.
내부 구조는 `.claude/rules/api-architecture.md` 의 표준 헥사곤 그대로다. csc-marketing 의 도메인
하나를 복제하는 것이 가장 빠르다.

sync 도메인이 다른 도메인을 부를 때는 **그 도메인의 테이블을 직접 읽지 않는다.** 자기 outbound
포트를 정의하고 `adapters/outbound/external/` 어댑터가 상대 도메인의 inbound 포트 토큰을
주입받아 위임한다(의존성 역전).

### 2-3. 화면 하나 추가

| 순서 | 파일 |
|---|---|
| 1 | `src/routes/<path>/+page.svelte` (얇게. 페이지 컴포넌트만 import) |
| 2 | `src/lib/pages/<area>/<page>/<Name>Page.svelte` |
| 3 | `src/lib/features/<feature>/{apis,queries,mutations,services}/` |
| 4 | 상태가 필요하면 `src/lib/shared/lib/stores/<name>/<name>.svelte.ts` |

기존 web 앱과 레이어가 같다. **다른 점은 `apis/` 뿐이다.** `frontClient()` 대신
`localStore()` 를 부른다. feature 코드는 서버를 모르고 로컬 DB 만 안다.

### 2-4. 로컬 저장소에 읽기/쓰기 추가

| 순서 | 파일 |
|---|---|
| 1 | `src/lib/infrastructure/local/localStore.ts` 의 `LocalStore` 인터페이스에 메서드 |
| 2 | `tauriLocalStore.ts` 에 `invoke` 호출 |
| 3 | `memoryLocalStore.ts` 에 인메모리 구현 (**빠뜨리면 브라우저 개발이 깨진다**) |
| 4 | `src-tauri/crates/mes-store/src/store.rs` 에 실제 SQL |
| 5 | `src-tauri/src/lib.rs` 에 `#[tauri::command]` + `invoke_handler` 등록 |

3번을 습관으로 만든다. 이게 있어야 UI 작업이 Rust 진척을 기다리지 않는다.

### 2-5. 프린터 또는 PLC 추가 (Phase 3)

타입은 이미 `src/lib/infrastructure/device/devicePort.ts` 에 있다(`PrinterPort`, `PlcPort`).
구현이 없을 뿐이다.

- 구현은 **Rust 쪽**이다. OPC-UA 와 Modbus 는 브라우저에서 못 한다.
  `src-tauri/crates/` 에 `mes-device` crate 를 추가한다.
- **라벨 인쇄는 직접 호출이 아니라 outbox enqueue 로** 만든다. `SyncEntity.LabelPrint` 가
  이미 예약되어 있다. 새벽에 용지가 떨어진 프린터 때문에 인쇄 작업이 사라지면 안 되고,
  그건 outbox 가 이미 푼 문제다.
- PLC 이벤트는 설비 이벤트의 `source` 를 `PLC` 로 넣는다. 저장과 push 경로는 그대로 재사용된다.

### 2-6. 새 백엔드 서버가 csc-mes 를 호출

`infra/docker/{dev,staging,prod}/web/docker-compose.yml` 의 `api-csc-mes` 서비스에서
`ALLOWED_SERVICES` 에 호출자 이름을 추가하고, `docs/specs/service-http-contract.md` 의 표에도
같은 문자열을 넣는다. 세 환경 중 하나라도 빠뜨리면 그 환경에서만 401 이 난다.

### 2-7. 두 번째 데스크톱 앱 또는 태블릿

`crates/mes-core` 와 `crates/mes-sync` 는 Tauri 에 의존하지 않는다. 두 번째 클라이언트가
생기면 **폴더 이동만으로** `packages/` 급으로 승격된다. 그 전에는 추출하지 않는다.
올바른 추상화 경계는 두 번째 소비자가 실제로 생겨야 알 수 있다.

---

## 3. 깨면 안 되는 불변식

각각 이유가 있고, 대부분 코드나 CI 에 박혀 있다.

| # | 불변식 | 어디에 박혀 있나 |
|---|---|---|
| 1 | `SERVICE_TOKEN_SECRET` 을 데스크톱 바이너리에 넣지 않는다 | `service-http-contract.md`, `security-architecture.md` 의 예외 절 |
| 2 | 동기화 push 는 어떤 클라이언트 버전 상태에서도 수락한다 | `version.rs` 의 `blocks_sync_push()` + 전 상태 순회 테스트 |
| 3 | 커서는 `server_seq`. `updated_at` 도 `bigserial` 도 아니다 | `mes_org_sequence` 테이블 + 프로토콜 문서 1절 |
| 4 | 삭제는 tombstone. 하드 삭제 금지 | 프로토콜 문서 2절 |
| 5 | outbox 행은 조용히 사라지지 않는다 | `outbox.rs` 상태 머신(사람 판단 상태로만 빠진다) |
| 6 | outbox `payload` 는 JSON TEXT 한 칸 | `0001_init.sql`. 도메인 스키마가 바뀌어도 미전송분이 안전하다 |
| 7 | 계약은 TS 가 SSOT, Rust 는 미러 | `check-mes-contracts.mjs` (CI 게이트) |
| 8 | 서버 주소는 런타임 config 가 빌드 상수보다 우선 | `appConfig.ts` 우선순위 |
| 9 | `mes-core` 와 `mes-contracts` 는 IO 를 모른다 | crate 의존 방향. 리눅스 CI 에서 Tauri 없이 테스트된다 |
| 10 | 데스크톱은 `apps/web` 에 두지 않는다 | `structure-blueprint.md` 0절의 근거 3가지 |

2번과 3번이 특히 중요하다. 둘 다 **위반해도 당장은 동작하고**, 문제가 몇 주 뒤에 데이터 유실로
드러난다.

---

## 4. 아직 없는 것

Phase 0 은 기능이 0이다. 아래는 전부 비어 있다.

| 없는 것 | Phase | 자리는 있나 |
|---|---|---|
| 도메인 테이블(작업지시, 실적, 검사, 설비) | 1 이후 | `mesdb/schema/` 에 파일만 추가하면 된다 |
| 도메인 헥사곤 | 1 이후 | `csc-mes/src/domains/` 가 비어 있다 |
| pull / push 엔드포인트 | 1 | 계약과 DB 인프라는 완성 |
| 로컬 쓰기 경로(`LocalStore` enqueue + Rust 명령) | 1 | Phase 0 은 읽기 전용. outbox 테이블과 상태 머신은 완성 |
| `MesEdgeGuard`(디바이스 인증) | 1 | 지금은 공유 `ServiceTokenGuard` |
| Rust 동기화 워커(pull/push 루프) | 1 | 연결 판정과 outbox 상태 머신은 완성 |
| 바코드 스캐너 | 1 | `ScannerPort` 타입만 |
| `FeatureKey.Mes`, `PermissionKey.MesSupervision` | 1 | 결정은 `multi-tenancy.md` 에 기록됨 |
| nginx vhost 와 릴리스 호스팅 | 1 | 설정안이 릴리스 런북 3절에 |
| Tauri 번들링(아이콘, 서명키) | 1 | `bundle.active: false`. 켜는 절차가 런북 0절에 |
| 진단 번들 내보내기 | 1 | 진단 화면에 자리만 |
| 프린터, PLC | 3 | 포트 타입만 |

### 검증되지 않은 것 하나

**Rust 코드는 컴파일된 적이 없다.** 이 작업 환경에 cargo 와 rustc 가 없었다. 의존성은
최소화했지만(serde, rusqlite, thiserror, tauri) 첫 `cargo test` 에서 rustfmt 포맷 차이나
rusqlite API 시그니처 오류가 나올 수 있다. `.github/workflows/checks.yml` 의 `desktop-rust`
잡이 첫 실제 게이트다.

---

## 5. 인수 직후 할 일

```bash
# 1. Rust 툴체인이 있는 환경에서 첫 검증
cd apps/desktop/mes/src-tauri
cargo fmt --all --check
cargo clippy -p mes-contracts -p mes-core -p mes-store -p mes-sync -- -D warnings
cargo test -p mes-contracts -p mes-core -p mes-store -p mes-sync

# 2. 나머지는 이미 통과 확인됨
cd ../../../..
node scripts/check-mes-contracts.mjs
pnpm turbo run typecheck test

# 3. 데스크톱 창 확인 (Rust 필요)
pnpm dev:mes
```

Phase 1 착수 전 답이 필요한 것은 계획 문서의 7절에 있다. 그중 **작업지시 발행 주체**(고객사 ERP
자동 유입인지 groupware 수기 발행인지)가 스키마를 가른다. 전자면 `external_ref` 와 멱등 upsert
엔드포인트가 추가된다.
