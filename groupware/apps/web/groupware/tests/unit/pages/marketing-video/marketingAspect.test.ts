/**
 * 화면비 파생: 버전이 정하는 값과 행에 굳은 값이 서로 다른 규칙을 따른다는 것을 못박는다.
 *
 * 한 값으로 묶어 두는 동안 v1.0 은 배경 프레임 안 자리의 60% 를 버리고 렌더됐다. 그래서 두 버전이
 * 같은 모양을 돌려주는지부터 본다(같으면 그때로 돌아간 것이다)
 */
import { describe, expect, it } from 'vitest';
import {
  storedAspectCss,
  versionAspectCss,
  versionAspectHeightFactor,
} from '$lib/pages/tools/marketing-video/marketingAspect';

describe('버전별 화면비', () => {
  it('두 버전이 서로 다른 상자를 그린다', () => {
    // 값 자체가 아니라 갈린다는 사실을 단정한다. 비율을 조정할 여지는 남기고, 한 값으로
    //   되돌아가는 것은 막는다(그 회귀는 화면에서 조용하다: 카드가 object-cover 라 그림이 멀쩡하다)
    expect(versionAspectCss('v1.0')).not.toBe(versionAspectCss('v1.5'));
  });

  it('영상이 프레임 안에 앉는 버전은 숏폼 규격보다 넓다', () => {
    // 프레임의 빈 자리가 0.887(704x794)이라, 세로가 길수록 그 자리를 덜 쓴다.
    expect(versionAspectHeightFactor('v1.0')).toBeLessThan(versionAspectHeightFactor('v1.5'));
  });

  it('영상이 화면 전체인 버전은 숏폼 규격이다', () => {
    expect(versionAspectCss('v1.5')).toBe('9 / 16');
    expect(versionAspectHeightFactor('v1.5')).toBeCloseTo(16 / 9);
  });
});

describe('행에 굳은 화면비', () => {
  it('그 행의 값으로 상자를 그린다', () => {
    // 버전 규칙에서 다시 파생하면 옛 영상이 새 상자에 담겨 잘려 보인다.
    expect(storedAspectCss('1:1')).toBe('1 / 1');
    expect(storedAspectCss('16:9')).toBe('16 / 9');
  });

  it('모르는 값에 던지지 않고 렌더러 폴백 모양으로 그린다', () => {
    // 이 문자열은 DB 컬럼에서 온다. 던지면 그 카드 하나가 아니라 목록 전체가 그려지지 않는다.
    expect(storedAspectCss('')).toBe('9 / 16');
    expect(storedAspectCss('3:2')).toBe('9 / 16');
  });
});
