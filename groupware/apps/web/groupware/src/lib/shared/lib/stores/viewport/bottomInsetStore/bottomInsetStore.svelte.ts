/**
 * 하단 인셋 스토어: 화면 하단을 점유한 셸 크롬의 높이를 모아둔다 (Svelte 5 runes, 싱글톤)
 *
 * `position: fixed; bottom: 0` 오버레이는 레이아웃 흐름 밖이라 셸이 하단에 깔아둔 바를 모른 채
 * 그 위를 덮는다. 오버레이마다 조건을 심으면 바 높이가 바뀌거나 셸이 늘 때마다 전부 고쳐야 한다.
 *
 * 그래서 하단을 점유하는 쪽이 자기 높이를 등록하고(`reserveBottomInset`), 하단 고정 오버레이는
 * 이 스토어의 `px` 만 읽어 그만큼 띄운다. 양쪽 다 상대를 모른다.
 *
 * 최댓값이 아니라 합으로 집계한다. 하단 바들은 셸의 세로 flex 열에 쌓여 각자 높이를 차지하므로,
 * 최댓값을 쓰면 바가 둘일 때 아래 것만 피하고 위 것을 덮는다.
 */
class BottomInsetStore {
  /** id → 점유 높이(px). id 는 등록 주체가 소유하며, 해제 시 제거된다. */
  private _reservations = $state<Record<string, number>>({});

  /** 하단 고정 오버레이가 비워야 할 총 높이(px). 등록이 없으면 0. */
  get px(): number {
    let total = 0;
    for (const value of Object.values(this._reservations)) total += value;
    return total;
  }

  /**
   * 등록/갱신. 같은 id 로 다시 부르면 값만 바뀐다(리사이즈, 반응형으로 바 높이가 변할 때)
   * 값이 같으면 아무것도 하지 않는다: ResizeObserver 는 변화 없는 콜백도 흘리므로,
   * 그대로 재대입하면 오버레이가 매번 무의미하게 다시 계산된다.
   */
  reserve(id: string, px: number): void {
    if (this._reservations[id] === px) return;
    this._reservations = { ...this._reservations, [id]: px };
  }

  /** 해제(언마운트). 없는 id 는 무해 */
  release(id: string): void {
    if (!(id in this._reservations)) return;
    const { [id]: _removed, ...rest } = this._reservations;
    this._reservations = rest;
  }
}

export const bottomInsetStore = new BottomInsetStore();
