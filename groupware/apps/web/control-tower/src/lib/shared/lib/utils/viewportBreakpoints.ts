// src/lib/shared/lib/utils/viewportBreakpoints.ts

/**
 * 뷰포트 가로 길이 분류 기준: 단일 출처(single source of truth)
 *
 * 폰 세로 / 태블릿 세로 / 세로형 피봇 모니터 / 데스크탑 을 "레이아웃 공간"(가로 길이 +
 * 방향)으로 구분한다. UA 하드웨어 타입(deviceStore: mobile/tablet/desktop)과는 독립적이다.
 * 예: iPad(하드웨어 tablet)도 가로 모드면 가로 폭이 넓어 `desktop` 클래스로 분류된다.
 */

/** UI 레이아웃 모드: 가로 공간 기준. 디바이스 하드웨어 타입과 독립적 */
export type UIMode = 'portrait' | 'landscape';

/** 뷰포트 크기 분류: 가로 길이(+ 넓은 화면일 때 방향) 기반 */
export type ViewportClass = 'phone' | 'tablet' | 'pivot-monitor' | 'desktop';

/** 폰 세로 ↔ 태블릿 세로 경계(px) */
export const TABLET_MIN_WIDTH = 480;

/**
 * 좁은 화면 ↔ 넓은 화면 경계(px). = UI 모드(portrait ↔ landscape) 경계
 *
 * 1024 = iPad Pro 12.9" 세로 폭. 이 값 미만은 portrait, 이상은 landscape.
 * 비율(width > height)이 아니라 가로 길이로 가르므로, 세로형 피봇 모니터
 * (예: 1080×1920)는 세로가 길어도 이 폭을 넘어 landscape 로 분류된다.
 */
export const WIDE_MIN_WIDTH = 1024;

/**
 * 뷰포트를 명명된 크기 클래스로 분류: 분류의 단일 결정 지점
 * - phone:         가로 < TABLET_MIN_WIDTH
 * - tablet:        TABLET_MIN_WIDTH ≤ 가로 < WIDE_MIN_WIDTH
 * - pivot-monitor: 가로 ≥ WIDE_MIN_WIDTH 이면서 세로 방향(height > width)
 * - desktop:       가로 ≥ WIDE_MIN_WIDTH 이면서 가로 방향
 */
export function classifyViewport(width: number, height: number): ViewportClass {
  if (width < TABLET_MIN_WIDTH) return 'phone';
  if (width < WIDE_MIN_WIDTH) return 'tablet';
  return height > width ? 'pivot-monitor' : 'desktop';
}

/**
 * 크기 클래스 → UI 모드. portrait/landscape 는 클래스의 coarsening 일 뿐이므로
 * 경계 판정을 중복하지 않고 classifyViewport 결과를 그대로 묶는다.
 * - 좁은 화면(phone/tablet) → portrait
 * - 넓은 화면(pivot-monitor/desktop) → landscape
 */
export function uiModeForClass(viewportClass: ViewportClass): UIMode {
  return viewportClass === 'phone' || viewportClass === 'tablet'
    ? 'portrait'
    : 'landscape';
}
