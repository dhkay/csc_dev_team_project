/**
 * 계정 상태 표시명. 관리자 목록/상세와 조직 상세의 루트관리자 카드가 같은 값을 보여주므로
 * 한 곳에서만 정의한다(같은 상태가 화면마다 다른 말로 보이지 않게)
 */
const ACCOUNT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: '활성',
  LOCKED: '잠금',
  INACTIVE: '비활성',
  WITHDRAWN: '탈퇴'
};

/** 모르는 상태값은 그대로 표시한다(백엔드가 상태를 늘려도 화면이 비지 않게) */
export function accountStatusLabel(status: string): string {
  return ACCOUNT_STATUS_LABEL[status] ?? status;
}
