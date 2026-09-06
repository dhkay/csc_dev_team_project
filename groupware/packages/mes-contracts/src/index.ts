/**
 * @csc/mes-contracts: MES 계약 공유 커널 (zero-dep)
 *
 * 소비자 셋이 같은 어휘를 본다.
 *   1. apps/api/nestjs/csc-mes  (서버)
 *   2. apps/desktop/mes         (현장 PC. Rust 미러가 별도로 존재)
 *   3. apps/web/groupware       (관리자 집계 화면. Phase 3)
 *
 * TS 가 SSOT 이고 Rust 미러(apps/desktop/mes/src-tauri/crates/mes-contracts)와의 동기화는
 * scripts/check-mes-contracts.mjs 가 CI 에서 강제한다.
 */
// 경로 상수(`/v1/sync/changes` 등)는 여기 두지 않는다. Phase 0 에는 소비자가 없어
// 문서(docs/specs/mes-sync-protocol.md)와 두 벌이 되고, 그 둘의 일치를 강제하는 것이
// 아무것도 없다. Phase 1 에서 서버 라우트와 Rust 클라이언트가 실제로 쓸 때 추가한다.
export * from './errors';
export * from './sync';
export * from './version';
