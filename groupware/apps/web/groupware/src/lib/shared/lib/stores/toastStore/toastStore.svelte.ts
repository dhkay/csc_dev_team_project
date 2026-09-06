/**
 * 전역 토스트 알림 스토어 (Svelte 5 runes, 싱글톤)
 *
 * 전역인 이유는 실패가 어디서 나든 사용자가 같은 자리에서 같은 방식으로 통보받아야 하기
 * 때문이다. 각 화면이 자기 배너를 만들면 위치와 수명과 접근성이 갈리고 라우트를 옮기면 사라진다.
 *
 * 책임 경계: 문구는 호출부(도메인)가 소유하고 표시 규칙은 여기가 소유한다.
 *   - 수명: variant 기본값(실패는 자동 소멸 없음)
 *   - 개수: TOAST_MAX_VISIBLE 초과 시 가장 오래된 것 제거
 *   - 중복: 같은 key 는 쌓지 않고 갱신 + 횟수 카운트
 *
 * 알림을 띄우는 일은 부르는 쪽을 다시 실행시키지 않는다. 이 계약이 없으면 `$effect` 안에서
 * 부른 알림이 그 effect 를 무한히 깨운다. 쓰는 메서드가 목록을 읽고 그다음 쓰는데, 그 읽기가
 * 부르는 쪽의 의존성으로 잡히면 쓰기가 곧 재실행 신호가 되기 때문이다. 그래서 내부 읽기는
 * `untrack` 으로 가둔다(`current`). 공개 getter(`items`)는 추적을 유지한다. 호스트는 그 갱신을
 * 봐야 그린다.
 */
import { untrack } from 'svelte';
import {
  TOAST_DEFAULT_DURATION_MS,
  TOAST_MAX_VISIBLE,
  type Toast,
  type ToastInput,
  type ToastVariant,
} from './toast.types';

/** 브라우저/테스트 양쪽에서 동작하는 id 생성: 충돌만 피하면 되므로 형식은 무관 */
let seq = 0;
function nextId(): string {
  seq += 1;
  return `toast-${seq}`;
}

class ToastStore {
  private _items = $state<Toast[]>([]);
  /** id → 자동 소멸 타이머. 수동 닫기/갱신 시 정리해 유령 타이머가 남지 않게 한다. */
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** hover/focus 로 멈춘 상태인지: 중복 이벤트에 타이머를 반복 재설정하지 않기 위한 가드 */
  private paused = false;

  /** 화면에 떠 있는 목록(오래된 것부터). 호스트가 이 배열만 렌더한다(추적된다) */
  get items(): Toast[] {
    return this._items;
  }

  /**
   * 쓰기 직전에 현재 목록을 의존성 없이 읽는 통로
   *
   * 아래 메서드들은 전부 이 통로로만 읽는다. `this._items` 를 직접 읽으면 그 읽기가 부르는 쪽
   * effect 의 의존성이 되어, 뒤따르는 쓰기가 그 effect 를 다시 깨운다(파일 머리말의 1000회 사고)
   */
  private get current(): Toast[] {
    return untrack(() => this._items);
  }

  /**
   * 알림 표시: 같은 key 가 이미 있으면 갱신 + 횟수 증가(새로 쌓지 않는다)
   * 반환값은 토스트 id 로, 호출부가 나중에 직접 닫을 때 쓴다(예: 재시도 성공 시)
   */
  show(input: ToastInput): string {
    const variant: ToastVariant = input.variant ?? 'info';
    const key = input.key ?? `${variant}:${input.title}`;
    const durationMs = input.durationMs ?? TOAST_DEFAULT_DURATION_MS[variant];

    const existing = this.current.find((t) => t.key === key);
    if (existing) {
      // 같은 사유가 다시 왔다. 자리를 옮기지 않고 내용만 갱신한다(사용자가 읽던 위치를 유지)
      const updated: Toast = {
        ...existing,
        variant,
        title: input.title,
        detail: input.detail,
        action: input.action,
        durationMs,
        count: existing.count + 1,
      };
      this._items = this.current.map((t) => (t.key === key ? updated : t));
      this.arm(updated.id, durationMs);
      return updated.id;
    }

    const toast: Toast = {
      id: nextId(),
      key,
      variant,
      title: input.title,
      detail: input.detail,
      action: input.action,
      durationMs,
      count: 1,
    };
    // 상한 초과 시 오래된 것부터 제거: 새 알림이 항상 보이도록. 단 동작 버튼이 붙은 알림은
    //   마지막에 밀어낸다: 그 버튼이 사용자의 유일한 복구 수단인 경우가 있다(기획안 저장 실패의
    //   '다시 저장': 이미지가 브라우저 메모리에만 있어 놓치면 되돌릴 수 없다). 배포 중에는 실패가
    //   몰려서, 단순히 오래된 것부터 지우면 그 복구 수단이 뒤이은 잡음에 밀려 사라진다.
    const overflow = this.current.length + 1 - TOAST_MAX_VISIBLE;
    if (overflow > 0) {
      const evictionOrder = [
        ...this.current.filter((t) => !t.action),
        ...this.current.filter((t) => t.action),
      ];
      for (const stale of evictionOrder.slice(0, overflow)) this.dismiss(stale.id);
    }
    this._items = [...this.current, toast];
    this.arm(toast.id, durationMs);
    return toast.id;
  }

  /**
   * 실패 알림: 자동 소멸하지 않는다(사용자가 읽고 조치를 판단해야 한다)
   * 다른 성격은 `show({ variant, title })` 로 직접 부른다. 래퍼를 성격마다 두면 시그니처 변경이
   * 배수로 늘어난다(실제 호출부가 있는 error 만 남긴다)
   */
  error(title: string, detail?: string, extra?: Omit<ToastInput, 'variant' | 'title' | 'detail'>) {
    return this.show({ ...extra, variant: 'error', title, detail });
  }

  /** 하나 닫기(타이머도 정리). 이미 없으면 무해 */
  dismiss(id: string): void {
    this.clearTimer(id);
    this._items = this.current.filter((t) => t.id !== id);
  }

  clear(): void {
    for (const t of this.current) this.clearTimer(t.id);
    this._items = [];
  }

  /**
   * 자동 소멸 일시정지/재개: 호스트가 hover/focus 에서 호출한다.
   * 읽는 중에 사라지거나, 버튼을 누르려는 순간 없어지는 일을 막는다.
   *
   * `paused` 플래그로 중복 호출을 흘려보낸다. hover 와 focus 가 함께 발화하고, 스택 안에서 버튼을
   * 오갈 때도 이벤트가 반복되므로, 매번 전체 타이머를 지우고 다시 거는 낭비를 막는다.
   */
  pauseAutoDismiss(): void {
    if (this.paused) return;
    this.paused = true;
    for (const [id, timer] of this.timers) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }

  resumeAutoDismiss(): void {
    if (!this.paused) return;
    this.paused = false;
    for (const t of this.current) this.arm(t.id, t.durationMs);
  }

  // 내부

  /** duration>0 이면 자동 소멸 타이머를 새로 건다(기존 타이머는 교체) */
  private arm(id: string, durationMs: number): void {
    this.clearTimer(id);
    // 멈춘 동안(읽는 중) 새로 뜬 알림도 타이머를 걸지 않는다. 벗어날 때 resume 이 한꺼번에 건다.
    if (durationMs <= 0 || this.paused) return;
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id);
        this._items = this.current.filter((t) => t.id !== id);
      }, durationMs),
    );
  }

  private clearTimer(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }
}

export const toastStore = new ToastStore();
