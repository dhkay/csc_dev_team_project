// mesdb pgEnum 정의. 값 문자열은 @csc/mes-contracts 의 TS enum 과 같아야 한다.
// (계약 어휘가 DB, 서버, Rust 클라이언트 셋을 관통한다)
import { pgEnum } from 'drizzle-orm/pg-core';

/** 동기화 쓰기 종류. INTENT 는 절대값이 아니라 상태 전이 의도 */
export const mesSyncOpEnum = pgEnum('mes_sync_op_enum', [
  'CREATE',
  'UPDATE',
  'DELETE',
  'INTENT',
]);

/** 멱등 원장에 기록되는 op 처리 결과 */
export const mesSyncOpStatusEnum = pgEnum('mes_sync_op_status_enum', [
  'APPLIED',
  'DUPLICATE',
  'REJECTED',
]);

/** 현장 단말 상태. REVOKED 는 즉시 401 로 이어진다(탈취 대응 경로) */
export const mesDeviceStatusEnum = pgEnum('mes_device_status_enum', [
  'ACTIVE',
  'REVOKED',
]);
