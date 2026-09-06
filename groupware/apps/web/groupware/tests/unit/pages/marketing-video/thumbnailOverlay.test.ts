/**
 * 썸네일 합성 규칙
 *
 * 미리보기와 저장본이 같은 함수로 그려진다는 것이 이 모듈의 계약이다. 그래서 여기서 잠그는 것은
 * 그리기 순서(바탕 → 덮기 → 글자)와, 해상도가 달라도 결과가 같은 비율로 나온다는 것이다. 어긋나면
 * 화면에서는 멀쩡한데 받은 파일만 다르다.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_OVERLAY,
  MAX_FONT_SCALE,
  MIN_FONT_SCALE,
  THUMBNAIL_FONT_FAMILY,
  clampFontScale,
  clampFontWeight,
  TEXT_COLORS,
  MAX_FONT_WEIGHT,
  MIN_FONT_WEIGHT,
  drawThumbnail,
  overlayLines,
  type ThumbnailOverlay,
} from '$lib/pages/tools/marketing-video/thumbnailOverlay';

/** 호출을 순서대로 기록하는 가짜 2D 컨텍스트. 그리기 순서가 계약이라 값만으로는 부족하다. */
function fakeCtx() {
  const calls: string[] = [];
  const ctx = {
    calls,
    font: '',
    fillStyle: '' as string,
    strokeStyle: '' as string,
    lineWidth: 0,
    lineJoin: '' as CanvasLineJoin,
    miterLimit: 0,
    textAlign: '' as CanvasTextAlign,
    textBaseline: '' as CanvasTextBaseline,
    clearRect: vi.fn(() => calls.push('clearRect')),
    drawImage: vi.fn(() => calls.push('drawImage')),
    fillRect: vi.fn(() => calls.push(`fillRect:${ctx.fillStyle}`)),
    strokeText: vi.fn((t: string) => calls.push(`strokeText:${t}`)),
    fillText: vi.fn((t: string) => calls.push(`fillText:${t}:${ctx.fillStyle}`)),
  };
  return ctx;
}

function overlay(over: Partial<ThumbnailOverlay> = {}): ThumbnailOverlay {
  return { ...DEFAULT_OVERLAY, text: '한 줄', ...over };
}

describe('overlayLines', () => {
  it('줄바꿈으로 나누고 빈 줄은 버린다', () => {
    // 문구 끝의 개행 하나가 글자 블록을 위로 밀어 올리지 않게
    expect(overlayLines('첫 줄\n\n  둘째 줄  \n')).toEqual(['첫 줄', '둘째 줄']);
  });

  it('공백만 있으면 아무 줄도 남지 않는다', () => {
    expect(overlayLines('   \n  ')).toEqual([]);
  });
});

describe('카탈로그', () => {
  it('기본 오버레이가 프리셋 색과 크기/굵기 범위 안에 있다', () => {
    expect(TEXT_COLORS).toContain(DEFAULT_OVERLAY.color);
    expect(DEFAULT_OVERLAY.fontScale).toBeGreaterThanOrEqual(MIN_FONT_SCALE);
    expect(DEFAULT_OVERLAY.fontScale).toBeLessThanOrEqual(MAX_FONT_SCALE);
    expect(DEFAULT_OVERLAY.weight).toBeGreaterThanOrEqual(MIN_FONT_WEIGHT);
    expect(DEFAULT_OVERLAY.weight).toBeLessThanOrEqual(MAX_FONT_WEIGHT);
  });
});

describe('clampFontWeight', () => {
  it('범위 안의 값은 그대로 둔다', () => {
    expect(clampFontWeight(400)).toBe(400);
  });

  it('범위 밖은 양끝으로 자른다', () => {
    expect(clampFontWeight(0)).toBe(MIN_FONT_WEIGHT);
    expect(clampFontWeight(9999)).toBe(MAX_FONT_WEIGHT);
  });

  it('정수로 맞춘다', () => {
    // ctx.font 는 CSS 문법이라 소수 weight 를 받지 않는다. 그런 값이 들어가면 font 대입이 통째로
    //   무시되어 글자만 조용히 사라진다(예외도 나지 않는다)
    expect(clampFontWeight(432.7)).toBe(433);
  });

  it('숫자가 아니면 기본값이다', () => {
    expect(clampFontWeight(Number.NaN)).toBe(DEFAULT_OVERLAY.weight);
  });
});

describe('drawThumbnail', () => {
  it('바탕 → 덮기 → 글자 순으로 그린다', () => {
    const ctx = fakeCtx();
    const base = {} as CanvasImageSource;
    drawThumbnail(ctx as never, base, overlay(), 320, 320);
    expect(ctx.calls).toEqual([
      'clearRect',
      'drawImage',
      'fillRect:rgba(0, 0, 0, 0.45)',
      'strokeText:한 줄',
      `fillText:한 줄:${DEFAULT_OVERLAY.color}`,
    ]);
  });

  it('바탕이 없으면 단색으로 칠한다', () => {
    // 영상 주소가 없거나 로드에 실패한 경우다. 그때도 글자 편집과 저장은 그대로 동작해야 한다.
    const ctx = fakeCtx();
    drawThumbnail(ctx as never, null, overlay(), 320, 320);
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(ctx.calls[1]).toMatch(/^fillRect:#/);
  });

  it('투명도가 0 이면 덮지 않는다', () => {
    const ctx = fakeCtx();
    drawThumbnail(ctx as never, {} as CanvasImageSource, overlay({ dimOpacity: 0 }), 320, 320);
    expect(ctx.calls.filter((c) => c.startsWith('fillRect'))).toEqual([]);
  });

  it('문구가 없으면 글자를 그리지 않는다', () => {
    const ctx = fakeCtx();
    drawThumbnail(ctx as never, {} as CanvasImageSource, overlay({ text: '  ' }), 320, 320);
    expect(ctx.fillText).not.toHaveBeenCalled();
    // 바탕과 덮기는 그대로다(문구를 지웠다고 그림이 사라지지는 않는다)
    expect(ctx.drawImage).toHaveBeenCalled();
  });

  it('여러 줄을 순서대로 그린다', () => {
    const ctx = fakeCtx();
    drawThumbnail(ctx as never, null, overlay({ text: '첫 줄\n둘째 줄' }), 320, 320);
    const drawn = ctx.fillText.mock.calls.map((c) => c[0]);
    expect(drawn).toEqual(['첫 줄', '둘째 줄']);
  });

  it('글자마다 테두리를 먼저 깔고 색을 얹는다', () => {
    // 덧그은 획이 글자를 두껍게 만든다. 순서가 뒤집히면 획이 글자 위를 덮어 가장자리가 뭉갠다.
    const ctx = fakeCtx();
    drawThumbnail(ctx as never, null, overlay({ text: 'A\nB' }), 320, 320);
    expect(ctx.calls.filter((c) => c.startsWith('strokeText') || c.startsWith('fillText'))).toEqual([
      'strokeText:A',
      'fillText:A:#facc15',
      'strokeText:B',
      'fillText:B:#facc15',
    ]);
  });

  it('테두리 색이 글자 색과 같다', () => {
    // 고른 색이 그대로 글자의 색이어야 한다. 테두리가 다른 색으로 고정돼 있으면 어떤 색을 골라도
    //   그 윤곽이 따라붙어 고른 색으로 보이지 않는다. 그림은 멀쩡히 그려져 눈으로만 드러난다.
    const ctx = fakeCtx();
    drawThumbnail(ctx as never, null, overlay({ text: '문구', color: '#22d3ee' }), 320, 320);
    expect(ctx.strokeStyle).toBe('#22d3ee');
    expect(ctx.fillStyle).toBe('#22d3ee');
  });

  it('글자 크기가 높이에 비례한다: 해상도가 달라도 같은 그림이 나온다', () => {
    // 미리보기(작은 캔버스)와 저장본(큰 캔버스)이 같은 비율로 그려져야 한다. 이것이 어긋나면
    //   화면에서 고른 크기가 받은 파일에서 달라진다.
    const small = fakeCtx();
    const large = fakeCtx();
    drawThumbnail(small as never, null, overlay({ fontScale: 0.1 }), 320, 320);
    drawThumbnail(large as never, null, overlay({ fontScale: 0.1 }), 1280, 1280);
    expect(small.font).toContain('32px');
    expect(large.font).toContain('128px');
  });

  it('크기와 투명도가 범위를 벗어나도 잘라 쓴다', () => {
    // 저장된 값이 범위 밖일 수 있다(다른 화면이 만든 값, 손으로 고친 값)
    const ctx = fakeCtx();
    drawThumbnail(ctx as never, {} as CanvasImageSource, overlay({ fontScale: 9, dimOpacity: 5 }), 100, 100);
    expect(ctx.font).toContain(`${100 * MAX_FONT_SCALE}px`);
    expect(ctx.calls).toContain('fillRect:rgba(0, 0, 0, 1)');
  });

  it('크기가 숫자가 아니면 기본값으로 되돌린다', () => {
    // 사람이 직접 입력하는 칸이라 빈 칸과 지우는 도중의 상태가 그대로 들어온다. NaN 이 흘러가면
    //   ctx.font 대입이 통째로 무시되어 글자만 조용히 사라진다(예외도 나지 않는다)
    const ctx = fakeCtx();
    drawThumbnail(ctx as never, null, overlay({ fontScale: Number.NaN }), 1000, 1000);
    expect(ctx.font).toContain(`${1000 * DEFAULT_OVERLAY.fontScale}px`);
  });

  it('고른 굵기가 그대로 그려진다', () => {
    const light = fakeCtx();
    const heavy = fakeCtx();
    drawThumbnail(light as never, null, overlay({ weight: 200 }), 320, 320);
    drawThumbnail(heavy as never, null, overlay({ weight: 800 }), 320, 320);
    expect(light.font.startsWith('200 ')).toBe(true);
    expect(heavy.font.startsWith('800 ')).toBe(true);
  });

  it('테두리가 굵기 조절의 폭을 잡아먹지 않는다', () => {
    // 테두리는 글자 색과 같은 색이라 두께로만 보인다. 그래서 굵기와 하는 일이 겹치는데, 그 두께가
    //   크면 어느 굵기를 골라도 비슷하게 두꺼워 보여 굵기를 여는 의미가 없어진다.
    //   획은 경로에 걸쳐 그려져 절반만 바깥으로 번지므로, 실제로 더해지는 두께는 lineWidth 의 절반이다.
    const ctx = fakeCtx();
    drawThumbnail(ctx as never, null, overlay({ fontScale: 0.1 }), 1000, 1000);
    const fontSize = 100;
    expect(ctx.lineWidth).toBeLessThanOrEqual(fontSize * 0.03);
  });

  it('Noto Sans 를 먼저 쓰고 시스템 글꼴로 떨어진다', () => {
    // 첫 자리가 실제로 받아 오는 글꼴이고(thumbnailFont), 뒤는 못 받았을 때의 폴백이다.
    //   글자가 안 그려지는 것보다 다른 글꼴로라도 그려지는 편이 낫다.
    const ctx = fakeCtx();
    drawThumbnail(ctx as never, null, overlay(), 640, 640);
    expect(ctx.font).toContain(`"${THUMBNAIL_FONT_FAMILY}"`);
    expect(ctx.font).toContain('sans-serif');
    expect(ctx.font.indexOf(THUMBNAIL_FONT_FAMILY)).toBeLessThan(ctx.font.indexOf('system-ui'));
  });
});

describe('clampFontScale', () => {
  it('범위 안의 값은 그대로 둔다', () => {
    expect(clampFontScale(0.1)).toBe(0.1);
  });

  it('범위 밖은 양끝으로 자른다', () => {
    expect(clampFontScale(0)).toBe(MIN_FONT_SCALE);
    expect(clampFontScale(99)).toBe(MAX_FONT_SCALE);
  });

  it('숫자가 아니면 기본값이다', () => {
    // 입력 칸을 비운 순간이 이 경로다(Number('') 는 0 이 아니라 빈 문자열 → NaN 인 경우도 있다)
    expect(clampFontScale(Number.NaN)).toBe(DEFAULT_OVERLAY.fontScale);
  });

  it('사람이 고를 수 있는 폭이 넓다', () => {
    // '임의로 설정' 이 목적이라 범위는 취향을 좁히는 장치가 아니라 뜻이 없는 값을 막는 장치다.
    expect(MIN_FONT_SCALE).toBeLessThanOrEqual(0.02);
    expect(MAX_FONT_SCALE).toBeGreaterThanOrEqual(0.4);
  });
});
