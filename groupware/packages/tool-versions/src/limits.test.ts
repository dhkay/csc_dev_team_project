// 동영상 수 상한과 그 안내. 서버와 화면이 같은 값을 읽는지는 컴파일이 보장하고, 값 자체를 여기서 못박는다.
import { describe, it, expect } from 'vitest';
import { MAX_SEGMENTS_PER_VIDEO, SEGMENT_LIMIT_EXCEEDED, segmentLimitMessage } from './index';

describe('동영상 수 상한', () => {
  it('8 이다', () => {
    // v1.0 은 자체 모델 창에 기획안 여러 벌이 들어야 하고, v1.5 는 숏츠 규격(8개 × 최대 10초)이다.
    //   바꾸면 화면의 개수 선택지와 서버의 clamp 가 함께 바뀐다(둘 다 이 값에서 나온다).
    expect(MAX_SEGMENTS_PER_VIDEO).toBe(8);
  });

  it('안내는 상한과 실제 수를 함께 말한다', () => {
    // 몇 개까지인지와 지금 몇 개인지를 둘 다 알아야 얼마나 합쳐야 하는지 가늠한다.
    const message = segmentLimitMessage(11);
    expect(message).toContain(`${MAX_SEGMENTS_PER_VIDEO}개`);
    expect(message).toContain('11개');
  });

  it('오류 코드는 안정적이다', () => {
    // 서버 400 본문의 code 와 BFF 판정이 이 문자열로 맞물린다. 바꾸면 양쪽이 같은 배포에 실려야 한다.
    expect(SEGMENT_LIMIT_EXCEEDED).toBe('SEGMENT_LIMIT_EXCEEDED');
  });
});
