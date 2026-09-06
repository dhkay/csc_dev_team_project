/**
 * 결과 확인 화면의 표기 규칙
 *
 * 이 값들은 사용자가 "무엇이 만들어졌는가" 를 판단하는 근거다. 틀려도 예외가 나지 않아, 24초짜리
 * 영상이 0초로 적히거나 시각이 하루 밀려도 화면은 멀쩡히 그려진다.
 */
import { describe, it, expect } from 'vitest';
import {
  completedAtLabel,
  durationLabel,
  lengthSummary,
  resultFromProgress,
  shortLinkLabel,
  type GenerationResult,
} from '$lib/pages/tools/marketing-video/generationResult';
import type {
  GenerationProgress,
  SegmentProgress,
} from '$lib/pages/tools/marketing-video/generationProgress';

function result(over: Partial<GenerationResult> = {}): GenerationResult {
  return {
    videoUrl: null,
    posterUrl: null,
    durationSec: 24,
    segmentCount: 3,
    videoModel: 'VEO3',
    completedAt: 0,
    title: '테스트 영상',
    driveUrl: null,
    ...over,
  };
}

describe('resultFromProgress', () => {
  const META = { videoModel: 'VEO3', title: '테스트 영상', completedAt: 1_700_000_000_000 };

  function progress(...segments: SegmentProgress[]): GenerationProgress {
    return { stage: 'COMPLETED', startedAt: 0, segments };
  }

  it('완료된 세그먼트만 세고 길이를 합한다', () => {
    const r = resultFromProgress(
      progress(
        { order: 1, status: 'done', durationSec: 8 },
        { order: 2, status: 'done', durationSec: 8 },
        { order: 3, status: 'waiting' },
      ),
      META,
    );
    expect(r.segmentCount).toBe(2);
    expect(r.durationSec).toBe(16);
  });

  it('길이를 모르는 세그먼트가 있으면 합계도 모르는 것이다', () => {
    // 모르는 조각을 0 으로 세면 24초짜리가 16초로 적힌다. 그건 틀린 값이지 모르는 값이 아니다.
    const r = resultFromProgress(
      progress(
        { order: 1, status: 'done', durationSec: 8 },
        { order: 2, status: 'done' },
      ),
      META,
    );
    expect(r.durationSec).toBeNull();
    expect(r.segmentCount).toBe(2);
  });

  it('주소 셋은 비운다: 서버가 실어 보내야 알 수 있다', () => {
    // 지어내면 눌러 본 뒤에야 아무 데도 가지 않는다는 것이 드러난다. 아는 쪽이 반환값에 얹는다.
    const r = resultFromProgress(progress({ order: 1, status: 'done', durationSec: 8 }), META);
    expect(r.videoUrl).toBeNull();
    expect(r.posterUrl).toBeNull();
    expect(r.driveUrl).toBeNull();
  });

  it('메타는 그대로 싣는다', () => {
    const r = resultFromProgress(progress(), META);
    expect(r.videoModel).toBe('VEO3');
    expect(r.title).toBe('테스트 영상');
    expect(r.completedAt).toBe(META.completedAt);
  });
});

describe('durationLabel', () => {
  it('분과 초를 자리수를 채워 적는다', () => {
    expect(durationLabel(24)).toBe('00:24');
    expect(durationLabel(65)).toBe('01:05');
  });

  it('음수는 0 으로 본다', () => {
    // 길이가 음수인 영상은 없다. 그런 값이 오면 화면에 -1:-1 을 내보내지 않는다.
    expect(durationLabel(-5)).toBe('00:00');
  });
});

describe('lengthSummary', () => {
  it('길이와 세그먼트 수를 함께 적는다', () => {
    expect(lengthSummary(result())).toBe('24초 (세그먼트 3개)');
  });

  it('길이를 모르면 세그먼트 수만 적는다', () => {
    // `0초` 라고 쓰면 길이가 0 인 영상이 만들어진 것처럼 읽힌다. 모르는 것은 적지 않는다.
    expect(lengthSummary(result({ durationSec: null }))).toBe('세그먼트 3개');
  });

  it('소수점 길이는 반올림한다', () => {
    expect(lengthSummary(result({ durationSec: 23.6 }))).toBe('24초 (세그먼트 3개)');
  });
});

describe('shortLinkLabel', () => {
  it('스킴을 떼고 가운데를 줄인다', () => {
    // 표의 값 칸은 좁은데 보관 주소는 길다. 그대로 두면 그 줄이 표 높이를 늘리고 위의 실제 정보를 가린다.
    expect(shortLinkLabel('https://drive.google.com/file/d/1a2B3c4D5e6F7g8H9i0J/view')).toBe(
      'drive.google.com/file/d/1a2B...H9i0J/view',
    );
  });

  it('짧은 주소는 그대로 둔다', () => {
    // 줄일 것이 없는데 줄이면 읽을 수 있던 주소가 읽을 수 없게 된다.
    expect(shortLinkLabel('https://drive.google.com/abc')).toBe('drive.google.com/abc');
  });

  it('양 끝을 남긴다: 어느 서비스이고 어떤 형태의 링크인지가 정보의 대부분이다', () => {
    const short = shortLinkLabel('https://drive.google.com/file/d/1a2B3c4D5e6F7g8H9i0J/view');
    expect(short.startsWith('drive.google.com')).toBe(true);
    expect(short.endsWith('/view')).toBe(true);
  });
});

describe('completedAtLabel', () => {
  it('로컬 시간대로 초까지 적는다', () => {
    // 사용자는 자기 시계로 일한다. UTC 로 적으면 "방금 끝났다" 가 아홉 시간 전으로 보인다.
    const local = new Date(2026, 7, 15, 14, 36, 12);
    expect(completedAtLabel(local.getTime())).toBe('2026-08-15 14:36:12');
  });

  it('한 자리 값도 자리수를 채운다', () => {
    const local = new Date(2026, 0, 2, 3, 4, 5);
    expect(completedAtLabel(local.getTime())).toBe('2026-01-02 03:04:05');
  });
});
