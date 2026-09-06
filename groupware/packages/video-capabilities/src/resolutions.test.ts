// 화질표 계약. 여기가 깨지면 프론트가 보여준 선택지와 서버가 받아들이는 값이 갈린다.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_VIDEO_RESOLUTION,
  RESOLUTION_KEYS,
  resolveVideoResolution,
  supportsResolutionChoice,
  videoResolutionsFor,
} from './resolutions';

describe('videoResolutionsFor', () => {
  it('지원 모델은 고를 수 있는 값을 돌려준다', () => {
    expect(videoResolutionsFor('grok-imagine-video')).toEqual(['480p', '720p']);
  });

  it('모르는 모델은 빈 배열이다(조정 미지원)', () => {
    expect(videoResolutionsFor('wan-2.2-ti2v-5b')).toEqual([]);
    expect(videoResolutionsFor('')).toEqual([]);
  });
});

describe('supportsResolutionChoice', () => {
  it('선택지가 둘 이상이면 고를 수 있다', () => {
    expect(supportsResolutionChoice('grok-imagine-video')).toBe(true);
  });

  it('선택지가 없으면 고를 수 없다(고정 화질)', () => {
    expect(supportsResolutionChoice('wan2.2-ti2v-5b')).toBe(false);
  });
});

describe('resolveVideoResolution', () => {
  it('지원하는 값은 그대로 통과한다', () => {
    expect(resolveVideoResolution('grok-imagine-video', '480p')).toBe('480p');
  });

  it('미지정이면 기본값이다', () => {
    expect(resolveVideoResolution('grok-imagine-video', null)).toBe(DEFAULT_VIDEO_RESOLUTION);
    expect(resolveVideoResolution('grok-imagine-video', undefined)).toBe(DEFAULT_VIDEO_RESOLUTION);
  });

  it('지원하지 않는 값은 기본값으로 clamp 한다(클라이언트를 신뢰하지 않는다)', () => {
    expect(resolveVideoResolution('grok-imagine-video', '1080p')).toBe(DEFAULT_VIDEO_RESOLUTION);
    expect(resolveVideoResolution('wan-2.2-ti2v-5b', '480p')).toBe(DEFAULT_VIDEO_RESOLUTION);
  });
});

describe('표 자체의 무결성', () => {
  it('기본값은 유효한 화질이다', () => {
    expect(RESOLUTION_KEYS).toContain(DEFAULT_VIDEO_RESOLUTION);
  });

  it('어떤 모델도 표에 없는 화질을 선언하지 않는다', () => {
    // 선언과 유효값이 갈리면 프론트가 서버가 모르는 값을 보여주게 된다.
    for (const model of ['grok-imagine-video']) {
      for (const r of videoResolutionsFor(model)) {
        expect(RESOLUTION_KEYS).toContain(r);
      }
    }
  });
});
