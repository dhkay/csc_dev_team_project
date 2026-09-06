# MES 동기화 프로토콜

> 이 문서는 계약의 단일 진실원이다. **백엔드(csc-mes)와 Rust 클라이언트가 이 문서만 보고
> 각자 구현할 수 있어야 한다.** 타입 정의는 `packages/mes-contracts`, Rust 미러는
> `apps/desktop/mes/src-tauri/crates/mes-contracts`, 둘의 일치는
> `scripts/check-mes-contracts.mjs` 가 CI 에서 강제한다.

## 전제

현장 PC 는 공장 네트워크가 끊겨도 라인을 멈출 수 없다. 그래서 **로컬 SQLite 가 1차 저장소**이고,
서버는 나중에 따라잡는 원장이다. 이 전제에서 나오는 요구가 셋이다.

1. **pull 은 델타여야 한다.** 매번 전량을 받으면 8시간 오프라인 뒤 복구가 불가능하다.
2. **push 는 멱등이어야 한다.** 재시도가 기본 동작인 이상, 응답을 못 받은 요청이 반드시 생긴다.
3. **어떤 경로로도 데이터가 조용히 사라지면 안 된다.** 현장에서 사라진 실적은 되찾을 방법이 없다.

---

## 1. 커서

커서는 **엔티티별 seq 맵**을 담은 opaque 토큰이다.

```
cursor = base64url(JSON.stringify({
  v:  1,                                        // 계약 버전 (WIRE_VERSION)
  sv: 3,                                        // 디바이스 scope_version
  s:  { work_order: 184190, production_record: 184203 }
}))
```

### 왜 스칼라가 아니라 맵인가

클라이언트가 `entities=` 로 부분집합을 요청하면, 요청하지 않은 엔티티의 변경이 스칼라 커서를
전진시킨다. 나중에 그 엔티티를 목록에 추가했을 때 그 사이의 변경은 **영구히** 누락된다.
맵이면 엔티티를 나중에 추가해도 그 엔티티만 0 부터 시작한다.

### 왜 `updated_at` 이 아니라 `server_seq` 인가

`updated_at` 은 두 가지로 행을 건너뛴다. 서버 간 clock skew, 그리고 같은 밀리초 동시 커밋의
tie. 둘 다 "커서를 지나쳤는데 아직 안 받은 행" 을 만들고, 그 행은 다시 나타나지 않는다.

### 왜 `bigserial` 이 아니라 할당기 테이블인가

**이 설계 전체가 서 있는 전제다.** `bigserial` 시퀀스는 트랜잭션 **밖에서** 증가한다.
그래서 seq 1000 을 받은 트랜잭션이 seq 1001 을 받은 트랜잭션보다 늦게 커밋할 수 있다.
그 사이에 pull 이 지나가면 1000 번 행은 영영 안 내려간다.

```sql
-- 쓰기 트랜잭션 안에서 n개를 예약한다.
UPDATE mes_org_sequence SET last_seq = last_seq + $n
WHERE organization_id = $org RETURNING last_seq;
```

행 잠금이 커밋까지 유지되므로 뒤에 온 트랜잭션은 앞 트랜잭션이 커밋될 때까지 seq 를 못 받는다.
결과적으로 **seq 오름차순 = 커밋 순서**가 되고 위 사고가 구조적으로 불가능해진다.

이 성질은 mock 으로 검증할 수 없다. 실제 Postgres 동시 트랜잭션 통합 테스트 하나를 반드시 둔다.

---

## 2. Pull: `GET /v1/sync/changes` `[SYNC-001]`

```
GET /v1/sync/changes?cursor=<opaque>&entities=work_order,production_record&limit=500
```

| 파라미터 | 기본 | 설명 |
|---|---|---|
| `cursor` | 없음 = 부트스트랩 | opaque 토큰 |
| `entities` | 전체 | 쉼표 구분. 미지 엔티티는 400 |
| `limit` | 500 | 최대 2000 |

**라인 스코프는 쿼리 파라미터가 아니다.** 서버가 `mes_devices.allowed_line_ids` 에서 강제한다.
파라미터로 두면 탈취된 단말이 공장 전체 데이터를 내려받는다. 이것이 "볼 권한 없는 데이터를
애초에 로컬로 내리지 않는다" 의 구현이고, 데스크톱이 SPA 라 화면 가드가 클라이언트에만 남는
것을 보완한다.

### 응답

```jsonc
{
  "cursor": "eyJ2IjoxLCJzdiI6MywicyI6ey4uLn19",
  "hasMore": true,
  "serverTime": "2026-08-10T02:13:44.512Z",
  "bootstrap": false,
  "windowFrom": null,
  "changes": [
    { "entity": "production_record", "op": "DELETE", "seq": 184190, "id": 90233,
      "version": null, "data": null, "deletedAt": "2026-08-10T01:40:02.000Z" },
    { "entity": "work_order", "op": "UPSERT", "seq": 184191, "id": 4471, "version": 3,
      "data": { "...": "..." }, "deletedAt": null }
  ]
}
```

`changes` 는 **엔티티가 섞여도 seq 오름차순**이다. 작업지시 생성이 그 실적보다 먼저 도착하는
인과 순서가 이 정렬로 보장된다.

### 페이지 절단 불변식

서버는 요청된 엔티티마다 이렇게 읽는다.

```sql
SELECT ... WHERE organization_id = $org AND server_seq > $cursor[e]
ORDER BY server_seq LIMIT $limit + 1
```

seq 로 병합 정렬해 앞에서 `limit` 개만 방출하고, 새 커서는 **엔티티별로 실제 방출한 마지막
seq** 로 갱신한다(방출 0건이면 이전 값 유지). 각 리스트가 오름차순이고 그 접두사만 취하므로
`newCursor[e]` 이하의 미방출 행은 존재할 수 없다. `hasMore` 는 어느 한 리스트라도 `limit+1`
번째가 남았으면 true.

### 삭제는 tombstone

하드 삭제를 금지한다. 오프라인 클라이언트는 "없어진 행" 을 스스로 알 방법이 없다.
삭제도 하나의 변경 이벤트여야 하므로 `deleted_at` 을 세팅하고 seq 를 새로 발급한다.

### 부트스트랩 (커서 없음)

마스터와 미종결 작업지시는 전량, 고볼륨 엔티티(`production_record`, `equipment_state_event`,
`inspection`)는 `MES_BOOTSTRAP_WINDOW_DAYS`(기본 30) 이내만 내려주고 `bootstrap: true` +
`windowFrom` 을 함께 반환한다. 신규 단말이 3년치 실적을 받을 이유가 없고, 그 요청 하나가
DB 를 정지시킨다.

### 클라이언트 측 불변식

**수신 페이지의 적용과 커서 저장은 로컬 SQLite 단일 트랜잭션이어야 한다.**
그래야 크래시 시 최악이 "같은 페이지 재적용"(UPSERT 라 멱등)이고 유실은 발생하지 않는다.

### 실패 모드

| 상태 | code | 클라이언트 행동 |
|---|---|---|
| 401 | `TOKEN_EXPIRED` | 토큰 갱신 후 1회 재시도. 실패하면 오프라인 모드 유지(로컬 작업 계속, outbox 축적) |
| 401 | `DEVICE_REVOKED` | 동기화 영구 중단, 관리자 문의 안내. **outbox 는 보존** |
| 403 | `FEATURE_NOT_GRANTED` | 동기화 중단 + 관리자 알림. 재시도 금지 |
| 409 | `CURSOR_VERSION_MISMATCH` | 서버 미러 테이블만 비우고 재부트스트랩. **outbox 는 절대 비우지 않는다** |
| 410 | `CURSOR_TOO_OLD` | 위와 동일(tombstone 보존기간 초과) |
| 429 | `RATE_LIMITED` | `Retry-After` 존중, 지수 백오프 |
| 5xx, 타임아웃 | 없음 | 지수 백오프. 커서 미갱신이므로 재시도가 안전 |

---

## 3. Push: `POST /v1/sync/operations` `[SYNC-002]`

```jsonc
{
  "deviceId": "term-lineA-01",
  "clientTime": "2026-08-10T02:13:40.001Z",
  "operations": [
    { "clientOpId": "018f...-a1", "clientSeq": 1204, "entity": "work_order",
      "op": "INTENT", "targetId": 4471, "baseVersion": 2, "intent": "START",
      "workerId": 88, "occurredAt": "2026-08-10T01:02:00.000Z", "payload": {} }
  ]
}
```

한도: 배치당 op 200개, 본문 1MB. 초과 시 413 + `MAX_BATCH_EXCEEDED`(클라이언트는 배치 크기를
반으로 줄여 재시도).

정본 예시는 `packages/mes-contracts/fixtures/` 의 골든 픽스처다. 그 파일들을 csc-mes 의
Jest, 데스크톱 Rust 의 serde 테스트, 데스크톱 TS 테스트가 **함께 읽는다.**

### 트랜잭션 경계는 op 1건

배치 전체를 한 트랜잭션으로 묶으면 한 건 실패가 나머지를 되돌려 부분 성공 계약이 성립하지
않는다. 다만 검사 헤더와 항목처럼 **한 aggregate 안은 반드시 한 트랜잭션**이다. 자식 행을
독립 동기화하면 "판정 없는 측정치" 같은 고아가 원장에 정상 상태로 남는다.

### 처리 순서는 요청 배열 순서 그대로

서버가 재정렬하면 클라이언트가 로컬에서 성립시킨 인과관계(지시 시작 -> 실적 등록)가 깨진다.
클라이언트는 의존 관계가 있는 op 를 같은 배치에 순서대로 넣는다.

### 멱등 처리 흐름

1. `(organization_id, client_op_id)` 로 `mes_sync_operations` 조회.
2. 있고 `request_hash` 동일 -> `DUPLICATE` + **저장된 `result` 를 그대로 반환**. 도메인 서비스 미호출.
3. 있고 `request_hash` 상이 -> `REJECTED` + `OP_ID_REUSED`. 클라이언트 버그이므로 상태를 건드리지 않는다.
4. 없음 -> 도메인 서비스 실행 -> 결과와 함께 원장 insert. insert 가 unique 위반(동시 중복 요청)이면 2번으로 폴백.

2번이 이 원장의 존재 이유다. 응답이 유실된 재전송에서 **같은 응답을 되돌려줘야** 클라이언트가
outbox 를 확정 삭제할 수 있다. 없으면 재시도가 중복 실적을 만들거나, 반대로 클라이언트가
영원히 확신하지 못한다.

### 응답 (항상 200)

```jsonc
{
  "serverTime": "2026-08-10T02:13:44.512Z",
  "clockSkewMs": 4511,
  "cursorHint": "eyJ2IjoxLCJ...",
  "results": [
    { "clientOpId": "018f...-a1", "status": "APPLIED", "entity": "work_order",
      "serverId": 4471, "serverSeq": 184205, "version": 3,
      "reason": null, "retryable": false, "message": null, "details": null },
    { "clientOpId": "018f...-a2", "status": "REJECTED", "entity": "production_record",
      "serverId": null, "serverSeq": null, "version": null,
      "reason": "QTY_EXCEEDS_PLAN", "retryable": false,
      "message": "지시 수량을 초과했습니다.",
      "details": { "plannedQty": 500, "producedQty": 498, "requestedQty": 120 } }
  ]
}
```

207 을 쓰지 않는 이유: log-server `POST /logs` 의 "항상 202 + 부분 성공 영수증" 선례를 따른다.
207 은 이 레포에 전례가 없고, 기존 HTTP 클라이언트들이 상태코드로 분기하지 않아 조용히
성공으로 처리될 위험이 있다.

### 거부 사유 코드

`retryable` 을 **응답에 함께 싣는다.** 클라이언트가 분류를 하드코딩하면 서버가 정책을 바꿀 때
전 단말 재배포가 필요해진다.

| reason | retryable | 클라이언트 행동 |
|---|---|---|
| `VALIDATION_FAILED` | false | outbox 에서 격리 보관, 작업자에게 표시 |
| `ENTITY_NOT_FOUND` | true(1회) | pull 1회 후 재시도, 그래도 실패면 격리 |
| `STALE_MASTER` | true | pull 후 재시도 |
| `VERSION_CONFLICT` | true | 응답의 `details.current` 로 리베이스 후 재시도 |
| `INVALID_TRANSITION` | false | op 폐기 + pull 로 갱신 |
| `DUPLICATE_NATURAL_KEY` | false | `serverId` 를 함께 주므로 **적용된 것으로 간주** |
| `QTY_EXCEEDS_PLAN` | false | 관리자 승인 필요, 작업자에게 표시 |
| `FORBIDDEN_SCOPE` | false | 즉시 격리 + 보안 로그 |
| `OP_ID_REUSED` | false | 클라이언트 버그. 격리 |
| `REQUIRES_ELEVATION` | false | 감독자 인증 후 재발행 |
| `TEMPORARILY_UNAVAILABLE` | true | 백오프 재시도 |

### 실패 모드

| 상황 | 클라이언트 행동 |
|---|---|
| 네트워크 실패, 타임아웃, 5xx | outbox 유지, 지수 백오프. `clientOpId` 가 있으므로 서버 적용 여부와 무관하게 안전 |
| 200 수신, 일부 `retryable: true` | 성공과 영구실패만 outbox 에서 제거, 재시도 대상만 남긴다 |
| 401/403 | pull 과 동일 |
| 413 | 배치 크기 반감 후 재시도 |
| **응답 유실**(전송 성공, 응답 못 받음) | 다음 재전송에서 `DUPLICATE` 로 동일 결과 수신 |

---

## 4. 충돌 해결 (데이터 종류별로 다르다)

| 데이터 | 방향 | 정책 |
|---|---|---|
| 생산실적, 검사결과, 설비 이벤트 | push only | append-only. **충돌 개념 자체가 없다.** 정정은 UPDATE 가 아니라 반대부호 보정 행(`correction_of`) |
| 작업지시 마스터(수량, 납기, 품목) | pull only | 서버 우선. 로컬을 무조건 덮어쓴다. 계획은 사무실이 소유한다 |
| 작업지시 상태 | 양방향 | 클라이언트가 절대값이 아니라 **의도**(START/PAUSE/COMPLETE) + `baseVersion` 을 보낸다. 불일치면 409 + 현재 상태 -> outbox `conflict` -> 보류함 |
| 화면 진행수량 | 파생 | `서버 확정값 + 내 미전송 합` 을 **분리 표시**한다 |

마지막 행이 실무에서 가장 중요하다. "확정 320, 대기 12" 처럼 나눠 적는다. 합쳐 놓으면 다른
PC 의 실적과 어긋날 때 작업자가 원인을 알 수 없다.

상태를 절대값이 아니라 의도로 보내는 이유: 오프라인 단말 둘이 서로 다른 절대값을 밀면 마지막에
도착한 쪽이 이기는데, 그건 "완료된 지시가 다시 진행중으로 되돌아가는" 결과를 만든다.

---

## 5. outbox 상태 머신 (클라이언트)

```
pending  --(워커가 집음, lease 설정)-->  sending
sending  --2xx 또는 DUPLICATE 응답-->     acked
sending  --네트워크 오류 / 5xx / 429-->   pending  (attempt+1)
sending  --409 의미적 충돌-->             conflict (사람이 판단)
sending  --400/403/422-->                 failed   (사람이 판단)
pending  --attempt > 20-->                dead     (사람이 판단)
```

구현: `apps/desktop/mes/src-tauri/crates/mes-core/src/outbox.rs`

- **조용히 버리지 않는다.** 어떤 경로로도 행이 사라지지 않고, 사람이 판단해야 하는 상태로만 빠진다.
- 기동 시 복구: `status='sending' AND lease_expires_at < now` 인 행은 `pending` 으로 되돌린다
  (기본 lease 2분). 멱등키가 있으므로 재전송이 안전하다.
- 백오프: `min(2s * 2^attempt, 5min)` + full jitter. 오프라인에서 온라인으로 전환되는 순간
  모든 `pending` 의 `next_attempt_at` 을 즉시로 당기되 **`attempt_count` 는 보존한다.**
  그래야 진짜로 깨진 행 하나가 복구 순간에 서버를 두드리지 않는다.
- 동시성 1. 순서와 lease 의미론이 병렬에서 급격히 복잡해지고, 얻는 처리량은 이 데이터 양에서
  무의미하다.

---

## 6. 시계

단말 시계는 믿지 않는다. 하지만 작업자가 실제로 버튼을 누른 시점은 실적 분석에 필요하다.
그래서 둘을 **분리 저장**한다.

| 컬럼 | 출처 | 용도 |
|---|---|---|
| `occurred_at` | 단말 주장 | 실적 분석, 교대 집계 |
| `received_at` | 서버 수신 | 감사, 지연 측정 |
| `server_seq` | 서버 할당 | **정렬과 커서는 오직 이것** |

`clock_skew_ms` 가 임계(예: 5분)를 넘으면 응답에 경고를 싣되 **op 는 거부하지 않는다.**
시계 오류로 생산이 멈추면 안 된다.

---

## 7. 온라인 감지

`navigator.onLine` 을 쓰지 않는다. 공장 네트워크는 링크가 살아 있고 게이트웨이만 죽는 상황이
흔해 거짓 양성이 나온다.

Rust 가 `GET /health` 를 15초 간격으로 능동 프로브한다. 히스테리시스는 비대칭이다.

- **연속 2회 실패에서 offline.** 한 번 튄 패킷으로 화면이 오프라인이 되면 작업자가 불안해하며
  입력을 멈춘다.
- **1회 성공에서 online.** 복구는 즉시 알려야 밀린 실적이 빨리 나간다.
- 응답이 2초를 넘으면 `degraded`. 화면이 "동기화 지연" 으로 구분해 보여준다.

`/health` 를 의도적으로 **비인증**으로 둔 이유: 토큰이 만료돼도 응답해야 "오프라인" 과
"토큰 만료" 가 화면에서 구분된다. 둘을 구분 못 하면 현장에서 원인을 못 찾는다.

구현: `apps/desktop/mes/src-tauri/crates/mes-sync/src/connectivity.rs`

---

## 8. 구현 상태

| 항목 | Phase | 위치 |
|---|---|---|
| 계약 타입(TS) | 0 완료 | `packages/mes-contracts/src/` |
| 계약 미러(Rust) | 0 완료 | `apps/desktop/mes/src-tauri/crates/mes-contracts/src/lib.rs` |
| 골든 픽스처 | 0 완료 | `packages/mes-contracts/fixtures/` |
| 미러 게이트 | 0 완료 | `scripts/check-mes-contracts.mjs` |
| seq 할당기 / 멱등 원장 / 단말 등록부 | 0 완료 | `packages/database/src/mesdb/schema/sync-tables.ts` |
| outbox 상태 머신 | 0 완료 | `crates/mes-core/src/outbox.rs` |
| 연결 판정 | 0 완료 | `crates/mes-sync/src/connectivity.rs` |
| pull / push 엔드포인트 | 1 | `apps/api/nestjs/csc-mes/src/domains/sync/` |
| pull / push 클라이언트 | 1 | `crates/mes-sync/` |
| `MesEdgeGuard`(디바이스 인증) | 1 | `apps/api/nestjs/csc-mes/src/shared/guards/` |

## 참고

- [mes-client-compatibility.md](./mes-client-compatibility.md): 구버전 클라이언트 정책
- [service-http-contract.md](./service-http-contract.md): 서비스토큰 계약과 그 예외
