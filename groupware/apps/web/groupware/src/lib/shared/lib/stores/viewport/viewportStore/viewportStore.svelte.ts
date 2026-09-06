import { browser } from '$app/environment';
import { getDeviceInfo } from '$lib/shared/lib/utils/deviceUtils';

/**
 * 뷰포트 측정 스토어: windowSize / screen* 와 관련 리스너만 보유한다.
 *
 * 싱글톤 lifetime 동안만 사는 리스너라 cleanup 이 없다. 키보드 휴리스틱용 모바일 판정은 UA 를
 * 직접 보고 deviceStore 에 의존하지 않는다.
 *
 * SSR 에서는 기본값(1024x768)으로 렌더하고(`ready === false`) 브라우저에서 모듈 import 시점에
 * 즉시 measure 한다. 소비자는 `{#if viewportStore.ready}` 로 플리커를 막을 수 있다.
 *
 * 모바일에서 가상 키보드가 열리면 innerHeight 가 줄어 높이 계산이 흔들린다. 너비가 그대로이고
 * 높이만 줄어든 경우는 키보드로 보고 height 갱신을 건너뛴다.
 */
class ViewportStore {
  private _windowSize = $state({ width: 1024, height: 768 });
  private _ready = $state(false);
  private _initialHeight = 0;
  private _isMobileLike = false;

  constructor() {
    if (browser) {
      const info = getDeviceInfo(navigator.userAgent);
      this._isMobileLike = info.type === 'mobile' || info.type === 'tablet';
      this.measure();
      this._ready = true;
      window.addEventListener('resize', this.measure, { passive: true });
      window.addEventListener('orientationchange', this.measure, { passive: true });
      window.visualViewport?.addEventListener('resize', this.measure, { passive: true });
    }
  }

  /** 현재 뷰포트 너비 (px) */
  get screenWidth(): number {
    return this._windowSize.width;
  }

  /** 현재 뷰포트 높이 (px): 모바일 키보드 열림 시 갱신 skip 됨 */
  get screenHeight(): number {
    return this._windowSize.height;
  }

  /** 브라우저에서 viewport 측정이 완료되었는지: SSR 기본값 vs 실제값 차이로 인한 플리커 가드용 */
  get ready(): boolean {
    return this._ready;
  }

  private measure = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // 초기 높이 기록
    if (this._initialHeight === 0) {
      this._initialHeight = height;
    }

    // 모바일에서 너비 불변 + 높이만 줄어든 경우 → 키보드 열림으로 간주, 높이 갱신 건너뜀
    const widthUnchanged = width === this._windowSize.width;
    const heightShrunk = height < this._initialHeight * 0.85;
    if (this._isMobileLike && widthUnchanged && heightShrunk) {
      return;
    }

    // 키보드가 닫혀서 높이가 복원된 경우 초기 높이 갱신
    if (height >= this._initialHeight) {
      this._initialHeight = height;
    }

    this._windowSize = { width, height };
  };
}

export const viewportStore = new ViewportStore();