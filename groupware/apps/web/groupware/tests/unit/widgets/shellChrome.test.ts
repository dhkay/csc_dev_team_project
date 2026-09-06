import { describe, expect, it } from 'vitest';
import { shouldShowBottomBar } from '$lib/widgets/AdminShell/shellChrome';

/**
 * 하단 공지 바의 기본값 규칙
 *
 * 관리자 셸 아래는 거의 전부 작업 화면이라 기본이 "감춤" 이고, 로비 한 곳만 띄운다.
 * 비교를 뒤집으면 로비를 뺀 모든 화면에 공지 줄이 되살아나는데, 그 사고는 선언한 화면이 아니라
 * 선언하지 않은 화면들에서 드러난다. 그래서 여기서 못 박는다.
 */
describe('shouldShowBottomBar', () => {
  it('선언하지 않은 작업 화면에서는 감춘다', () => {
    expect(shouldShowBottomBar(undefined)).toBe(false);
    expect(shouldShowBottomBar({})).toBe(false);
  });

  it('true 로 선언한 화면에서만 띄운다', () => {
    expect(shouldShowBottomBar({ bottomBar: true })).toBe(true);
  });

  it('false 는 기본과 같다', () => {
    expect(shouldShowBottomBar({ bottomBar: false })).toBe(false);
  });
});
