/**
 * 하단 크롬이 자기 높이를 예약하는 액션(`use:reserveBottomInset`)
 *
 * 붙인 요소의 실제 높이를 측정해 bottomInsetStore 에 등록하고, 언마운트 시 해제한다.
 * 하단 고정 오버레이(토스트 등)는 그 합만큼 위로 올라가므로 겹침 회피가 자동으로 유지된다.
 *
 * 높이를 상수로 넘기지 않고 측정하는 이유: `h-9` 같은 클래스 값을 오버레이 쪽에 복사해 두면
 * 바를 두 줄로 바꾸거나 반응형으로 높이가 달라지는 순간 조용히 어긋난다. 측정하면 그런 변경이
 * 자동으로 따라오고, 바가 조건부로 사라지면 액션도 함께 사라져 인셋이 0 으로 돌아간다.
 */
import { bottomInsetStore } from '$lib/shared/lib/stores/viewport/bottomInsetStore/bottomInsetStore.svelte';

/** 인스턴스 구분용. 같은 바가 여러 개 떠 있어도 각자 자리를 차지한다(값 충돌 없음) */
let seq = 0;

export function reserveBottomInset(element: HTMLElement) {
  seq += 1;
  const id = `bottom-inset-${seq}`;

  const measure = (): void => bottomInsetStore.reserve(id, element.offsetHeight);
  measure();

  // ResizeObserver 미지원 환경(jsdom 컴포넌트 테스트 등)에서는 최초 측정값만 유지한다.
  // 레이아웃 예약은 부가 기능이라, 없다고 렌더가 깨지면 안 된다.
  const observer =
    typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
  observer?.observe(element);

  return {
    destroy() {
      observer?.disconnect();
      bottomInsetStore.release(id);
    },
  };
}
