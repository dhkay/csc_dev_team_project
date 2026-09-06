// 화면비 계약. 여기가 깨지면 화면의 상자와 실제 영상의 모양이 갈리는데, 카드가 object-cover 라
// 그림은 멀쩡해 보이고 결과 영상을 열어 봐야 드러난다.
import { describe, it, expect } from 'vitest';
import {
  aspectHeightFactor,
  aspectPromptLabelFor,
  aspectRatioCss,
  imageSizeFor,
  isAspectRatio,
} from './aspect';

describe('화면비 해석', () => {
  it('이미지 크기와 프롬프트 라벨이 같은 화면비에서 나온다', () => {
    // 둘이 각자 리터럴이면 화면비만 바꾸고 하나를 잊는다. 그러면 4:5 캔버스에 9:16 이미지가 들어가
    //   위아래가 잘리고, 그 사실은 결과 영상을 보고서야 드러난다.
    expect(imageSizeFor('4:5')).toBe('1024x1280');
    expect(aspectPromptLabelFor('4:5')).toBe('vertical (4:5)');
    expect(imageSizeFor('9:16')).toBe('1024x1536');
    expect(aspectPromptLabelFor('9:16')).toBe('vertical (9:16)');
  });

  it('지원하지 않는 화면비는 던진다', () => {
    // 조용히 기본값으로 대신하면 다른 모양의 영상이 성공으로 끝난다. 버전 표의 값이 이 카탈로그와
    //   어긋나는 것은 배선 오류이고, CI 게이트가 먼저 잡는다.
    expect(() => imageSizeFor('3:4')).toThrow(/화면비/);
    expect(() => aspectPromptLabelFor('')).toThrow(/화면비/);
    expect(() => aspectRatioCss('9:16 ')).toThrow(/화면비/);
  });

  it('지원 여부를 물어볼 수 있다', () => {
    expect(isAspectRatio('4:5')).toBe(true);
    expect(isAspectRatio('3:4')).toBe(false);
  });
});

describe('aspectRatioCss', () => {
  it('비율 문자열에서 CSS 값을 만든다', () => {
    expect(aspectRatioCss('9:16')).toBe('9 / 16');
    expect(aspectRatioCss('1:1')).toBe('1 / 1');
    expect(aspectRatioCss('16:9')).toBe('16 / 9');
    expect(aspectRatioCss('4:5')).toBe('4 / 5');
  });

  it('CSS 값과 높이 배수가 같은 비율에서 나온다', () => {
    // 카드 상자(CSS)와 캔버스 높이(배수)가 갈리면 화면의 상자와 그 안의 그림이 다른 모양이 된다.
    for (const ratio of ['1:1', '9:16', '4:5', '16:9']) {
      const [w, h] = aspectRatioCss(ratio).split(' / ').map(Number);
      expect(aspectHeightFactor(ratio)).toBeCloseTo(h / w);
    }
  });
});

describe('aspectHeightFactor', () => {
  it('가로 대비 세로 배수를 준다', () => {
    // 캔버스로 그리는 산출물(인포그래픽 씬 이미지, 썸네일)이 이 값으로 높이를 정한다.
    expect(aspectHeightFactor('9:16')).toBeCloseTo(16 / 9);
    expect(aspectHeightFactor('1:1')).toBe(1);
    expect(aspectHeightFactor('16:9')).toBeCloseTo(9 / 16);
  });

  it('세로 비율은 1 보다 크고 가로 비율은 1 보다 작다', () => {
    // 부호가 뒤집히면 세로 영상 자리에 가로 상자가 그려진다(1024x576 짜리 인포그래픽 등)
    expect(aspectHeightFactor('9:16')).toBeGreaterThan(1);
    expect(aspectHeightFactor('4:5')).toBeGreaterThan(1);
    expect(aspectHeightFactor('16:9')).toBeLessThan(1);
  });
});
