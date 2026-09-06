# MES 클라이언트 호환성 정책

> 전제 한 줄: **구버전 클라이언트가 존재하는 것은 장애가 아니라 정상 상태다.**
>
> 현장 PC 는 즉시 업데이트되지 않는다. 공장이 폐쇄망이면 몇 주씩 뒤처지고, 교대 중에는
> 재시작조차 못 한다. 서버는 이 상태를 예외가 아니라 기본값으로 다룬다.

## 절대 불변식

> **`POST /v1/sync/operations` 는 어떤 클라이언트 버전 판정 상태에서도 수락한다.**

구버전 PC 를 차단해 놓고 그 PC 의 outbox 에 어제 생산실적 400건이 남아 있으면 영구 유실이다.
오프라인 우선 앱의 최대 사고 유형이고, 대개 차단 로직을 넣은 그날 발생한다.

이 불변식은 세 곳에 박혀 있다.

| 위치 | 형태 |
|---|---|
| 이 문서 | 지금 이 절 |
| TS 계약 | `packages/mes-contracts/src/version.ts` 의 `SYNC_PUSH_ALWAYS_ACCEPTED` |
| Rust | `crates/mes-core/src/version.rs` 의 `ClientStatus::blocks_sync_push()` (항상 false) |
| 테스트 | 같은 파일의 `sync_push_is_never_blocked` (전 상태 순회) |

`blocks_sync_push()` 는 상수를 반환하는 것처럼 보이지만, 여기에 조건을 넣고 싶어지는 날이
반드시 온다. 그때 테스트가 막는다.

push 는 최소 스키마(`clientOpId`, `entity`, raw payload)만 검증하고 나머지는 관용적으로
흡수한다.

---

## 1. 신원 헤더 (양방향)

**클라이언트 -> 서버** (모든 요청)

| 헤더 | 예 | 용도 |
|---|---|---|
| `X-Client-App` | `mes-desktop` | 클라이언트 종류 |
| `X-Client-Version` | `1.4.2` | 판정 대상 |
| `X-Device-Id` | `term-lineA-01` | 단말 식별 |
| `X-Local-Schema` | `7` | 로컬 SQLite `user_version` |

**서버 -> 클라이언트** (모든 응답)

| 헤더 | 예 |
|---|---|
| `X-Min-Supported-Client` | `0.1.0` |
| `X-Recommended-Client` | `0.1.0` |
| `X-Client-Status` | `ok` / `deprecated` / `soft-block` / `hard-block` |

**모든 응답에 싣는다.** 정책 조회 전용 엔드포인트를 두면 그 엔드포인트만 호출 안 하는 버그가
생긴다. 구현: `apps/api/nestjs/csc-mes/src/shared/http/client-version.interceptor.ts`
(전역 인터셉터, `main.ts` 에서 등록).

버전을 밝히지 않은 호출자(BFF, scalar-gateway, 컨테이너 헬스체크)와 형식이 깨진 버전은
`ok` 로 취급한다. **판정 불가는 차단 사유가 아니다.**

---

## 2. 3단 계단

| 단계 | 서버 | 앱 |
|---|---|---|
| `ok` | 정상 | 정상 |
| `deprecated` | 정상 + 헤더 | 상단 배너 "업데이트 권장" |
| `soft-block` | 신규 **쓰기** 만 409. 조회와 동기화 push 는 허용 | 전면 안내 + 미전송 전송 계속 |
| `hard-block` | 426 Upgrade Required. **단 동기화 push 는 수락** | 진단 화면 + 수동 업데이트 안내 |

인터셉터는 **헤더만 붙이고 차단하지 않는다.** 실제 거부는 쓰기 경로의 가드가 판단한다.
경계를 나눈 이유: 인터셉터가 막으면 동기화 push 까지 함께 막히고, 그게 위 불변식을 깬다.

클라이언트 쪽 해석은 `crates/mes-core/src/version.rs` 의 `ClientStatus::parse`.
**모르는 상태 문자열은 `ok` 로 본다.** 서버가 상태를 하나 늘리는 순간 현장 전체가 서면 안 된다.

---

## 3. API 버저닝

- 경로 프리픽스 `/v1`. **처음부터 붙인다.** 나중에는 못 붙인다.
- v1 안에서는 **additive 만** 허용한다.
  1. 필드 추가만 가능. 삭제, 타입 변경, 의미 변경 금지.
  2. 새 필드는 반드시 optional 또는 서버 기본값 보유.
  3. enum 값 추가 시 클라이언트는 **미지 값을 무시하고 통과**시킨다(닫힌 집합 가드로 throw 하지 않는다).
- breaking 이 필요하면 `/v2` 신설 후 `/v1` 을 최소 2개 릴리스 주기 병행 유지.
- `WIRE_VERSION`(계약 버전)은 필드 추가로는 올리지 않는다. 구버전 파서가 오해할 수 있는
  변경에만 올린다. 올리면 전 단말이 재부트스트랩에 들어가므로 값이 싸지 않다.

엔드포인트 식별자 접두사는 `MES` / `SYNC` / `DEVICE` / `EQUIP`.
`SYNC` 를 분리한 이유: 동기화 계약은 오프라인 클라이언트와 맞물려 하위호환 감사 대상이 다르다.
v2 호환성을 훑을 때 이 접두사가 검색 키가 된다.

---

## 4. 서버 스키마 마이그레이션: expand, migrate, contract

Drizzle 갈래이므로 `packages/database/src/mesdb/migrations/` 에 그대로 들어간다.
규칙만 추가한다.

1. **expand**: 새 컬럼을 nullable 또는 기본값과 함께 추가. 구버전 클라이언트가 안 보내도 성립해야 한다.
2. **migrate**: 백필. 신구 클라이언트 공존 기간 동안 양쪽 쓰기를 모두 수용.
3. **contract**: 구 컬럼 드롭. **`X-Min-Supported-Client` 가 그 컬럼을 안 쓰는 버전으로 올라간
   뒤에만** 실행하고, 마이그레이션 파일 상단에 조건을 주석으로 명시한다.

```sql
-- contract: requires MIN_SUPPORTED_CLIENT >= 1.5.0
ALTER TABLE mes_production_records DROP COLUMN legacy_qty;
```

가장 흔한 사고는 신규 컬럼에 NOT NULL 을 곧바로 거는 것이다. `deploy.sh` 가 마이그레이션 실패
시 앱 기동 전에 중단하므로 배포 자체는 안전하지만, 통과한 뒤 **구버전 클라이언트의 push 가
전부 500** 이 된다.

---

## 5. 로컬 SQLite 스키마

- `PRAGMA user_version` 이 **단일 진실원**이다. 별도 메타 테이블을 두지 않는다.
  부팅 최초 쿼리 이전에(테이블이 없을 수도 있는 시점에) 읽을 수 있어야 하기 때문이다.
- **단방향 마이그레이션만.** 현장에서 다운그레이드 실행은 데이터 손실 경로다.
- 마이그레이션 직전 자동 백업(`mes.db.bak-v<from>`, 최근 3개 유지). 현장은 복구 수단이 없으면
  아무것도 못 한다.
- **`user_version > CODE_SCHEMA_VERSION`** (앱을 롤백했는데 DB 는 신버전인 경우): 자동 처리하지
  않고 **읽기 전용 모드 + 진단 화면**으로 떨어진다. 그냥 열면 신버전 컬럼의 데이터가 조용히
  잘려 나간다.
- **outbox 의 `payload` 는 구조화 컬럼이 아니라 JSON TEXT 한 칸.** 도메인 스키마가 바뀌어도
  미전송 outbox 를 마이그레이션할 필요가 없다. 앱 업데이트 때문에 어제 실적이 사라지는 일을
  구조적으로 막는다.

구현: `crates/mes-store/src/migrate.rs`

### pragma

```
journal_mode = WAL
synchronous  = FULL
foreign_keys = ON
busy_timeout = 5000
```

`synchronous=FULL` 인 이유: 공장은 정전이 실제로 일어난다. NORMAL 은 파일 손상은 없어도 최근
트랜잭션을 잃을 수 있는데, 잃는 것이 실적 한 건이면 그 손실이 성능 이득보다 크다. 쓰기가 분당
몇 건 수준이라 비용도 사실상 없다.

---

## 6. 런타임 설정 (되돌릴 수 없는 결정)

우선순위: **`%APPDATA%/csc-mes/config.json` > 빌드 상수 > 하드코딩 기본값**

```jsonc
{
  "apiBaseUrl":     "https://mes.cscuniverse.com",
  "updateEndpoint": "https://mes.cscuniverse.com/desktop/latest.json",
  "channel":        "prod",
  "deviceId":       "term-lineA-01",
  "siteCode":       "A"
}
```

서버 주소와 업데이트 엔드포인트를 빌드에 구우면 이미 현장에 깔린 앱은 고칠 방법이 없다.
사람이 PC 마다 재설치하러 가야 한다. 이 앱은 클라우드와 온프렘 폐쇄망 양쪽에 **같은
바이너리**로 나가야 하므로 런타임 주입이 전제 조건이다.

파일 읽기는 Rust 가 한다(WebView 에 파일시스템 권한을 주지 않는다). **어떤 실패에도 예외를
올리지 않고 기본값으로 떨어진다.** 설정 파일이 깨졌다고 앱이 안 뜨면 현장에서 고칠 방법이 없다.
무엇이 적용됐는지는 진단 화면(`/diagnostics`)이 보여준다.

구현: `src-tauri/src/config.rs`(파일), `src/lib/app/config/appConfig.ts`(병합)

---

## 7. 릴리스 전 체크리스트

- [ ] v1 안의 변경이 additive 인가(필드 추가만)
- [ ] enum 을 늘렸다면 클라이언트가 미지 값을 무시하는가
- [ ] contract 마이그레이션이라면 `MIN_SUPPORTED_CLIENT` 가 먼저 올라갔는가
- [ ] `MIN_SUPPORTED_CLIENT` 를 올렸다면 그 아래 버전 단말이 현장에 없는지 확인했는가
      (`GET /internal/fleet` 으로 단말별 클라이언트 버전 조회. Phase 1)
- [ ] 로컬 스키마를 바꿨다면 `CODE_SCHEMA_VERSION` 과 마이그레이션 파일이 함께 올라갔는가
- [ ] 동기화 push 경로에 새 검증을 넣지 않았는가(위 불변식)
