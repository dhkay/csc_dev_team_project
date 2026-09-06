import { browser } from '$app/environment';

// 창 간 메시징(BroadcastChannel): 팝아웃(다른 문서)에서 여는 창으로 결과를 알린다.
// 팝아웃은 자체적으로 처리(검증/스토어 반영 대상 데이터 생성)를 끝낸 뒤 메시지를 보내고 닫고,
// 여는 창은 메시지를 받아 목록을 갱신(스토어 반영)만 한다.

/** 팝아웃 ↔ 여는 창 공용 채널명(모듈 내부 전용: 외부는 헬퍼 함수만 사용) */
const POPOUT_CHANNEL = 'csc:popout';

/** groupware 팝아웃 메시지 계약 */
export type PopoutMessage =
  | { type: 'member:changed' }
  | { type: 'account:changed' };

/** 팝아웃에서 여는 창으로 메시지 전송(전송 후 채널 닫음) */
export function postPopout(message: PopoutMessage): void {
  if (!browser || typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(POPOUT_CHANNEL);
  channel.postMessage(message);
  channel.close();
}

/** 여는 창에서 팝아웃 메시지 구독. 반환된 함수로 해제(onMount/$effect 정리에서 호출) */
export function subscribePopout(handler: (message: PopoutMessage) => void): () => void {
  if (!browser || typeof BroadcastChannel === 'undefined') return () => {};
  const channel = new BroadcastChannel(POPOUT_CHANNEL);
  const listener = (event: MessageEvent<PopoutMessage>) => handler(event.data);
  channel.addEventListener('message', listener);
  return () => {
    channel.removeEventListener('message', listener);
    channel.close();
  };
}
