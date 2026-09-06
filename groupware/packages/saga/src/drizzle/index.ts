/**
 * Drizzle 사가 저장소
 *
 * 앱이 하는 일은 둘이다.
 *   1. `export const xSagas = sagaTable('x_sagas')` 를 자기 스키마에 두고 마이그레이션을 생성한다.
 *   2. `createDrizzleSagaStore(xDb, xSagas)` 를 `SagaModule.forRoot({ store })` 에 끼운다.
 *
 * 표는 그 앱의 DB 에 있어야 한다(DB 소유권 경계). 두 앱이 한 표를 공유하면 서로의 사가를 이어 가려 하고,
 * 정의를 모르니 건너뛰기만 반복한다.
 */
export * from './saga-table';
export * from './saga-store';
