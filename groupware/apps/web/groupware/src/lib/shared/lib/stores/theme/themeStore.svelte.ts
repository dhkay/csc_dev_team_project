import { browser } from '$app/environment';

/**
 * 명명된 테마 id: 확장 지점. 지금은 light/dark 둘뿐이지만, 향후 'sepia' / 'high-contrast' /
 * 브랜드 테마 등을 여기에 추가하면 된다.
 *
 * 새 테마 추가 절차(3단계):
 *   1) 이 유니온에 id 추가 (예: 'sepia')
 *   2) 아래 THEME_CLASS 에 id→클래스 매핑 추가 (예: sepia: 'sepia')
 *   3) app.css 에 대응 variant 추가: `@custom-variant sepia (&:where(.sepia, .sepia *));`
 *      이후 컴포넌트에서 `sepia:bg-...` 로 스타일링
 */
export type ThemeId = 'light' | 'dark';

/** 사용자 선택 모드: 테마 id 직접 지정 또는 시스템 설정 추종('system') */
export type ThemeMode = ThemeId | 'system';

/**
 * 테마 id → 적용 클래스(app.css 의 @custom-variant 대상)
 * light 는 기본 테마라 클래스가 없다(''). dark 는 '.dark'. 새 테마는 여기에 한 줄 추가
 */
const THEME_CLASS: Record<ThemeId, string> = {
  light: '',
  dark: 'dark',
};

const STORAGE_KEY = 'groupware.theme';

/** 영속값 검증용: 알려진 모드(테마 id + 'system'). THEME_CLASS 확장 시 자동 반영 */
const KNOWN_MODES = new Set<string>(['system', ...Object.keys(THEME_CLASS)]);

/**
 * 테마 스토어: 앱 전역 단일 출처(runes 싱글톤)
 *
 * 상태는 전역이지만 스타일 적용은 ThemeScope(테마 클래스)로 서브트리에 스코프한다.
 * (현재는 마케팅 영상 제작 페이지 한정). 다른 페이지도 ThemeScope 로 감싸면 이 상태를 공유한다.
 *
 * 이진(light/dark)이 아니라 '명명된 테마 id + 클래스 레지스트리'로 모델링해 테마 확장에 열려 있다.
 * 영속: localStorage(browser 가드). 'system' 모드는 matchMedia 로 OS 라이트/다크를 반영한다.
 * 기본값은 'light': 스타일이 일부 페이지에만 있어 최소 놀람(명시적 opt-in)
 */
class ThemeStore {
  private _mode = $state<ThemeMode>('light');
  private _systemDark = $state(false);

  /** 실제 적용될 테마 id: 모드 해석('system' → OS 라이트/다크) */
  resolvedTheme = $derived<ThemeId>(
    this._mode === 'system' ? (this._systemDark ? 'dark' : 'light') : this._mode,
  );

  /** ThemeScope 가 서브트리에 붙일 클래스(테마 레지스트리 매핑) */
  themeClass = $derived(THEME_CLASS[this.resolvedTheme]);

  /** 편의 파생: 다크 여부(2상태 토글/조건부 UI용) */
  isDark = $derived(this.resolvedTheme === 'dark');

  constructor() {
    if (!browser) return;

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && KNOWN_MODES.has(saved)) {
      this._mode = saved as ThemeMode;
    }

    // 시스템 다크 선호 + 변경 추적(싱글톤 수명: 해제하지 않음)
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    this._systemDark = mq.matches;
    mq.addEventListener('change', (e) => {
      this._systemDark = e.matches;
    });
  }

  get mode(): ThemeMode {
    return this._mode;
  }

  /** 임의 테마/모드로 설정: 테마 피커 등 확장 UI 진입점 */
  setMode(mode: ThemeMode): void {
    this._mode = mode;
    if (browser) localStorage.setItem(STORAGE_KEY, mode);
  }

  /** 현재 유효 다크 여부 기준 light ↔ dark 전환(간단 토글용: 다테마 순환은 setMode 로) */
  toggle(): void {
    this.setMode(this.isDark ? 'light' : 'dark');
  }
}

export const themeStore = new ThemeStore();
