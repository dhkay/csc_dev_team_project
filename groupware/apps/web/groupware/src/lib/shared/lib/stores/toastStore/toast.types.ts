/**
 * 전역 토스트 알림 타입: 스토어와 호스트 컴포넌트의 계약
 *
 * 확장 지점을 타입으로 고정한다: 새 종류(variant)나 새 동작(action)을 추가할 때 여기만 넓히면
 * 스토어/호스트가 컴파일 타임에 따라온다. 문구는 호출부가 소유하고(도메인 지식), 표시 규칙은
 * 스토어가 소유한다(수명, 개수 상한, 중복 병합)
 */

/** 알림 성격: 색/아이콘/기본 수명/스크린리더 우선도가 이 값에서 파생된다. */
export type ToastVariant = 'error' | 'warning' | 'success' | 'info';

/** 토스트에 붙는 버튼: 문구와 동작만 받는다(닫기는 호스트가 항상 제공) */
export interface ToastAction {
  label: string;
  // 눌렀을 때 실행. 실행 후 토스트는 자동으로 닫힌다.
  run: () => void;
}

/** 호출부가 알림을 요청할 때 넘기는 값 */
export interface ToastInput {
  variant?: ToastVariant;
  // 한 줄 제목: 무엇이 일어났는지
  title: string;
  // 상세 사유/조치: 서버가 준 문구를 그대로 실어도 된다.
  detail?: string;
  // 중복 병합 키. 같은 key 로 다시 오면 새로 쌓지 않고 기존 것을 갱신하고 횟수를 센다.
  // 폴링 경로(렌더 상태 감시 등)가 같은 실패를 반복 보고해도 화면이 도배되지 않는다.
  // 미지정 시 `variant:title` 을 키로 쓴다.
  key?: string;
  // 자동 소멸까지의 시간(ms). 0 이면 수동으로 닫을 때까지 유지. 미지정 시 variant 기본값
  durationMs?: number;
  action?: ToastAction;
}

/** 화면에 떠 있는 토스트 1건: 입력에 스토어가 정한 값(id/key/수명/횟수)을 채운 형태 */
export interface Toast {
  id: string;
  key: string;
  variant: ToastVariant;
  title: string;
  detail?: string;
  durationMs: number;
  action?: ToastAction;
  // 같은 key 로 몇 번 왔는지(1이면 표시하지 않는다)
  count: number;
}

/**
 * variant 별 기본 수명
 * 실패는 사용자가 읽고 조치를 판단해야 하므로 자동으로 사라지지 않는다(0). 성공/정보는 짧게
 */
export const TOAST_DEFAULT_DURATION_MS: Record<ToastVariant, number> = {
  error: 0,
  warning: 10_000,
  success: 4_000,
  info: 6_000,
};

/** 동시에 띄울 최대 개수: 넘치면 가장 오래된 것을 밀어낸다(화면을 잠식하지 않게) */
export const TOAST_MAX_VISIBLE = 4;
