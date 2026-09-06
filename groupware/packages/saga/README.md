# @csc/saga

다단계 쓰기(로컬 DB 행 + 원격 부수효과)를 오케스트레이션 사가로 돌리는 공유 엔진.

`db.transaction` 으로 묶을 수 없는 쓰기를 위한 것이다. 부수효과가 우리 트랜잭션 밖에 있으면(다른
서비스의 자산, 벤더 잡) 실패와 크래시가 중간 상태를 남기는데, 그 중간 상태를 되돌리거나 이어 가는
일을 코드가 아니라 사람의 기억이 담당하기 시작하면 새 쓰기마다 빠뜨린다.

설계 근거와 규칙의 단일 출처는 [docs/specs/marketing-write-consistency.md](../../docs/specs/marketing-write-consistency.md) 4.5 절이다.
이 문서는 **다른 앱이 이 엔진을 붙이는 방법**만 다룬다.

---

## 이 패키지가 정하는 것과 앱이 정하는 것

| 이 패키지 | 앱 |
|---|---|
| 단계 실행 순서, 진행 기록 시점, 역순 보상 | 어떤 단계가 무엇을 하는가(정의) |
| 실행권(한 사가에 한 실행), 중단분 복구, 보존기간 정리 | 사가 표를 어느 DB 에 두는가 |
| payload/context 저장 규칙 검사 | HTTP 표면(운영 엔드포인트, 상태코드) |

코어(`@csc/saga`)는 **런타임 의존성이 0 이다.** 프레임워크도 ORM 도 모른다. NestJS 배선은
`@csc/saga/nest`, Drizzle 저장소는 `@csc/saga/drizzle`, 테스트 도구는 `@csc/saga/testing` 에 있다.

---

## 붙이는 순서 (네 단계)

### 1. 사가 표를 그 앱의 DB 에 만든다

```ts
// packages/database/src/<db>/schema/<x>-tables.ts
import { sagaTable } from '@csc/saga/drizzle';

export const xSagas = sagaTable('x_sagas');
```

표를 손으로 적지 않는다. 러너의 의미가 컬럼에 걸려 있어서(`step`+`context` = 재개 지점,
`claimed_at` = 실행권, 부분 유니크 = 멱등키 하나) 다시 적으면 그중 하나가 조용히 빠진다.
마이그레이션은 그 DB 를 소유한 쪽이 평소대로 생성한다(`drizzle-kit generate`).

**표는 반드시 그 앱의 DB 에 둔다.** 다른 앱의 표를 보게 하면 그 앱의 사가를 이어 가려 하는데 정의를
모르니 건너뛰기만 반복하고, 실행권도 서로 다투게 된다.

### 2. 엔진에 우리 DB 를 끼운다

```ts
// src/shared/saga.module.ts
const sagaEngine = SagaModule.forRoot({
  store: {
    provide: SAGA_STORE_PORT,
    useFactory: () => createDrizzleSagaStore(xDb, xSagas),
  },
});

@Module({ imports: [sagaEngine], exports: [sagaEngine] })
export class XSagaModule {}
```

`forRoot` 를 **한 번만** 부르고 그 결과를 다시 내보낸다. 도메인 모듈마다 부르면 러너와 저장소가
모듈마다 따로 생겨(실행권을 공유하지 않는 인스턴스들) 같은 사가를 함께 돌 수 있다.

### 3. 사가를 정의하고 서비스가 러너에 위임한다

```ts
@Injectable()
export class CreateThingSaga implements SagaDefinition<CreateThingContext> {
  readonly type = 'thing.create';
  hydrate(payload, context) { /* payload + context → 컨텍스트 */ }
  readonly steps = [
    { name: 'reserve-row', execute: async (ctx) => ({ rowId: ... }), compensate: async (ctx) => { /* 그 행 삭제 */ } },
    { name: 'create-job',  execute: async (ctx) => ({ jobId: ... }), compensate: async (ctx) => { /* 그 잡 취소 */ } },
  ];
}

const outcome = await this.sagaRunner.run(this.createSaga, {
  organizationId, ownerUserId, clientRequestId, payload: { ... },
});
```

단계를 쓸 때의 규칙 셋. 엔진이 강제하지 못하고 작성자가 지켜야 하는 것들이다.

1. **산출물을 반환한다.** 다음 단계가 쓸 값은 컨텍스트로 돌려준다. 클로저 변수에 담으면 재개 때 사라진다.
2. **재실행에 안전해야 한다.** 진행 기록 직전에 죽으면 그 단계가 한 번 더 돈다.
3. **자기 단계만 되돌린다.** 앞 단계는 그 단계의 `compensate` 가 되돌린다.

payload/context 는 jsonb 로 영구 저장된다. 자격증명과 JSON 왕복이 깨지는 값(Date, Set, NaN)은
엔진이 저장 직전에 막는다(`saga-context.ts`). 필요한 값은 저장하지 말고 실행 시점에 다시 조립한다.

### 4. 복구와 오류 번역을 배선한다

```ts
// app.module.ts
ScheduleModule.forRoot(),
SagaRecoveryModule.forRoot({
  imports: [XSagaModule, ThingModule],
  definitions: [CreateThingSaga],   // ← 새 사가를 추가하면 여기 한 줄
}),

// main.ts
app.useGlobalFilters(new SagaBusyFilter());
```

`definitions` 에서 빠진 사가는 중단됐을 때 아무도 이어 가지 않는다(경고 한 줄을 남기고 방치되며,
화면에는 "만드는 중" 으로 보인다). 런타임으로는 잡히지 않으므로 **소스 검사 테스트**를 두는 것을
권한다. csc-marketing 의 `saga-registry.spec.ts` 가 참고 구현이다(소스에서 `implements SagaDefinition<`
를 찾아 배선 파일과 맞춘다).

운영 엔드포인트(`POST /internal/sagas/recover`)는 **앱이 직접 만든다.** 이 패키지가 컨트롤러를 들고
있으면 안정 식별자(`[PREFIX-NNN]`)가 두 서버에서 중복되고, 그 검사(`scripts/check-endpoint-ids.mjs`)는
`apps/api` 만 훑기 때문에 중복을 보지도 못한다. 엔드포인트는 그 서버의 문서에 속한다.

---

## 테스트

앱 테스트는 러너를 mock 하지 않는다. **진짜 러너 + 인메모리 저장소**로 돌려야 단계 순서와 보상이
검증 범위에 들어온다.

```ts
providers: [MyService, MySaga, ...sagaTestProviders(createInMemorySagaStore())]
```

`InMemorySagaStore` 는 진짜 어댑터와 같은 의미로 동작한다(claim/리스 갱신/보존기간 정리 포함). 크래시를
재현하는 `crashAt`, 방치를 재현하는 `backdate`, 저장 순서를 보는 `writes` 를 함께 제공한다.

---

## 확장 시 알아둘 것

- **엔트리 간 동일성.** 서브엔트리(nest/drizzle/testing)는 코어를 **패키지 이름으로** 참조한다
  (`tsup` external + tsconfig paths). 상대경로로 바꾸면 번들러가 엔트리마다 코어를 복사해, 같은
  클래스와 심볼이 엔트리마다 다른 것이 된다. 그러면 DI 토큰이 안 맞고 `@Catch(SagaBusyError)` 가
  잡지 못하는데, 둘 다 컴파일은 통과한다. 앱의 조립 스모크 테스트가 이 사고를 잡는 마지막 그물이다.
- **drizzle 판올림.** `@csc/saga/drizzle` 은 db 에게 `select/insert/update/delete` 네 메서드만 요구한다
  (전체 `PgDatabase` 를 요구하면 판올림마다 붙는 멤버 때문에 앱과 어긋난다).
- **리스와 복구 유예는 다른 값이다.** 리스(30초)는 "지금 살아 있는 실행이 있나", 복구 유예(5분)는
  "이 사가가 버려졌나" 를 묻는다. 리스는 진행 기록마다 갱신되므로 **한 단계의 상한**이다.
- **외부에 무언가를 만드는 단계는 `meta.idempotencyKey` 를 실어 보낸다.** 벤더 호출과 진행 기록
  사이(DB 쓰기 한 번 폭)에서 죽으면 그 단계가 한 번 더 돌기 때문이다. 키는 `사가 id + 단계 번호` 라
  재실행에도 같다. **받는 서비스가 그 키로 중복을 접어야** 완전히 닫힌다(csc-marketing → video-model
  `client_request_id` 가 참고 구현이다: 부분 유니크 + 사전 조회 + 충돌은 재조회로 접기).
  키의 유일성 범위는 받는 서비스 전체이므로 호출자 이름을 접두사로 붙인다.