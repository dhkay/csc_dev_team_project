import { viewportStore } from '../viewportStore/viewportStore.svelte';
import {
  classifyViewport,
  uiModeForClass,
} from '$lib/shared/lib/utils/viewportBreakpoints';

/**
 * 레이아웃 모드 파생 스토어: viewportStore 측정값을 가로 길이 기준으로 분류한다.
 *
 * viewportStore(원시 px) 와 viewportBreakpoints(분류 규칙) 사이의 얇은 파생 계층
 * 컴포넌트는 px 비교나 임계값을 직접 다루지 않고 이 스토어의 의미값만 소비한다.
 *
 * deviceStore(UA 하드웨어 타입)와 구분할 것:
 * - deviceStore   = "이 기기가 무엇인가" (mobile/tablet/desktop, 세션 불변)
 * - viewportMode  = "지금 화면이 얼마나 넓은가" (리사이즈/회전에 따라 변함)
 */
class ViewportModeStore {
  /** phone | tablet | pivot-monitor | desktop */
  viewportClass = $derived(
    classifyViewport(viewportStore.screenWidth, viewportStore.screenHeight),
  );

  /** portrait | landscape: viewportClass 의 coarsening */
  uiMode = $derived(uiModeForClass(this.viewportClass));

  isPortrait = $derived(this.uiMode === 'portrait');
  isLandscape = $derived(this.uiMode === 'landscape');
}

export const viewportModeStore = new ViewportModeStore();
