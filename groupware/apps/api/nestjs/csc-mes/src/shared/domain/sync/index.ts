/**
 * 동기화 계약 어휘 재노출
 *
 * SSOT 는 `@csc/mes-contracts` 이고 여기서는 재노출만 한다. 이 어휘는 서버, 데스크톱 TS,
 * 데스크톱 Rust 셋이 공유하며 Rust 미러와의 동기화는 scripts/check-mes-contracts.mjs 가
 * CI 에서 강제한다.
 */
export * from '@csc/mes-contracts';
