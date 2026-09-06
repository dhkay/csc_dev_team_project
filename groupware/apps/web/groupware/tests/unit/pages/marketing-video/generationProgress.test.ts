/**
 * 생성 진행상태 뷰모델
 *
 * 이 값들은 화면의 숫자가 되고, 틀려도 예외가 나지 않는다. 다 만들어진 생성이 87% 에서 멈춘 것처럼
 * 보이거나 경과 시간이 뒤로 가도 화면은 멀쩡히 그려진다. 그래서 규칙 자체를 여기서 잠근다.
 */
import { describe, it, expect } from 'vitest';
import {
  GENERATION_STAGES,
  awaitingSegmentsNotice,
  awaitsSegments,
  doneCount,
  elapsedLabel,
  isComplete,
  overallPercent,
  stageLabel,
  type GenerationProgress,
  type GenerationStage,
  type SegmentProgress,
  type SegmentStatus,
} from '$lib/pages/tools/marketing-video/generationProgress';

function segments(...statuses: SegmentStatus[]): SegmentProgress[] {
  return statuses.map((status, i) => ({ order: i + 1, status }));
}

function progress(over: Partial<GenerationProgress> = {}): GenerationProgress {
  return { stage: 'SPLITTING', startedAt: 0, segments: [], ...over };
}

describe('단계 카탈로그', () => {
  it('가중치 합이 정확히 100 이다', () => {
    // 이 표의 계약. 모자라면 다 끝나도 100 에 닿지 못하고, 넘치면 중간에 100 을 지나쳐 버린다.
    const sum = GENERATION_STAGES.reduce((acc, s) => acc + s.weight, 0);
    expect(sum).toBe(100);
  });

  it('모든 단계에 라벨이 있고 서로 다른 키를 쓴다', () => {
    // 라벨이 비면 배지가 빈 칸이 되고, 키가 겹치면 진행률 누적이 그 지점에서 멈춘다.
    const keys = GENERATION_STAGES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of GENERATION_STAGES) expect(stageLabel(s.key)).toBeTruthy();
  });

  it('세그먼트 생성이 가장 큰 몫을 갖는다', () => {
    // 모델 호출이 세그먼트 수만큼 일어나 실제로 압도적으로 길다. 여기가 작아지면 진행 바가
    //   초반에 급히 차오른 뒤 가장 긴 구간에서 멈춰 있는 것처럼 보인다.
    const seg = GENERATION_STAGES.find((s) => s.key === 'SEGMENT_GENERATING');
    const rest = GENERATION_STAGES.filter((s) => s.key !== 'SEGMENT_GENERATING');
    expect(seg!.weight).toBeGreaterThan(rest.reduce((acc, s) => acc + s.weight, 0));
  });
});

describe('overallPercent', () => {
  it('첫 단계는 0 에서 시작한다', () => {
    expect(overallPercent(progress({ stage: 'SPLITTING' }))).toBe(0);
  });

  it('단계가 넘어가면 앞 단계의 가중치가 그대로 더해진다', () => {
    // 세그먼트 단계 직전까지는 10 + 15 다
    expect(overallPercent(progress({ stage: 'SEGMENT_GENERATING' }))).toBe(25);
    // 세그먼트가 끝나면 그 65 가 통째로 더해진다.
    expect(overallPercent(progress({ stage: 'MERGING' }))).toBe(90);
  });

  it('세그먼트 단계는 완료 1, 생성 중 0.5 로 센다(백엔드 _compose_progress 와 같은 규칙)', () => {
    // 나중에 서버 값을 받아 쓸 때 화면의 수가 튀지 않아야 한다.
    const p = progress({
      stage: 'SEGMENT_GENERATING',
      segments: segments('done', 'done', 'running', 'waiting'),
    });
    // 25 + 65 × (2 + 0.5) / 4 = 65.625 → 66
    expect(overallPercent(p)).toBe(66);
  });

  it('세그먼트가 하나도 없으면 그 단계의 진척은 0 이다', () => {
    // 0 으로 나누지 않는다. 개수를 아직 모르는 순간이 실제로 있다.
    expect(overallPercent(progress({ stage: 'SEGMENT_GENERATING', segments: [] }))).toBe(25);
  });

  it('마지막 단계에서도 100 을 넘지 않는다', () => {
    const p = progress({ stage: 'MERGING', segments: segments('done', 'done') });
    expect(overallPercent(p)).toBeLessThanOrEqual(100);
  });

  it('완료는 100 이다', () => {
    // 종료 단계의 가중치는 0 이라 앞의 넷이 그대로 100 이 된다. 남은 세그먼트가 있어도 마찬가지다.
    //   (끝났다고 말한 것은 서버이고, 화면이 그것을 세그먼트 수로 반박하지 않는다)
    expect(overallPercent(progress({ stage: 'COMPLETED' }))).toBe(100);
    expect(
      overallPercent(progress({ stage: 'COMPLETED', segments: segments('done', 'waiting') })),
    ).toBe(100);
  });

  it('모르는 단계는 전체 가중치가 더해진다(빠짐이 진행률을 되돌리지 않게)', () => {
    // 서버가 우리가 모르는 단계를 보내오는 날, 바가 0 으로 되돌아가는 대신 끝까지 간다.
    const p = progress({ stage: 'UNKNOWN' as GenerationStage });
    expect(overallPercent(p)).toBe(100);
  });
});

describe('isComplete', () => {
  it('종료 단계일 때만 참이다', () => {
    // 끝났다는 것을 값으로 받는다. "마지막 단계이고 세그먼트가 다 완료" 로 역추론하면 병합만
    //   남은 순간과 진짜 완료가 구분되지 않아, 화면이 결과로 넘어갈 시점을 스스로 지어내게 된다.
    expect(isComplete(progress({ stage: 'COMPLETED' }))).toBe(true);
    expect(
      isComplete(progress({ stage: 'MERGING', segments: segments('done', 'done') })),
    ).toBe(false);
  });
});

describe('doneCount', () => {
  it('완료된 세그먼트만 센다', () => {
    const p = progress({ segments: segments('done', 'running', 'waiting', 'waiting', 'done') });
    expect(doneCount(p)).toBe(2);
  });
});

describe('awaitsSegments', () => {
  it('칸이 없고 끝나지 않았으면 기다리는 중이다', () => {
    // 칸 수는 서버가 입력을 나눈 뒤 프로젝트가 나른다. 그 전에 화면이 어림한 수로 칸을 그리면
    //   틀린 수를 확신하듯 보여주므로, 이 값이 참인 동안 격자 대신 인디케이터를 그린다.
    expect(awaitsSegments(progress({ stage: 'SPLITTING', segments: [] }))).toBe(true);
    expect(awaitsSegments(progress({ stage: 'PREPARING', segments: [] }))).toBe(true);
  });

  it('칸이 하나라도 있으면 기다리는 중이 아니다', () => {
    expect(awaitsSegments(progress({ stage: 'PREPARING', segments: segments('waiting') }))).toBe(
      false,
    );
  });

  it('끝난 생성은 칸이 없어도 기다리는 중이 아니다', () => {
    // 완료인데 칸이 없는 것은 받은 것이 없는 것이다. 인디케이터를 돌리면 끝난 것이 도는 것으로 보인다.
    expect(awaitsSegments(progress({ stage: 'COMPLETED', segments: [] }))).toBe(false);
  });
});

describe('awaitingSegmentsNotice', () => {
  it('칸 수를 정하기 전의 두 단계는 각자 무엇을 기다리는지 말한다', () => {
    // 나누는 중과 준비하는 중은 기다리는 것이 다르다. 한 문장으로 두면 어느 쪽 독자도 자기 상태를
    //   읽지 못한다.
    const splitting = awaitingSegmentsNotice('SPLITTING');
    const preparing = awaitingSegmentsNotice('PREPARING');
    expect(splitting).toContain('계산');
    expect(preparing).toContain('준비');
    expect(splitting).not.toBe(preparing);
  });

  it('그 뒤 단계에서 칸이 없으면 공통 문장으로 떨어진다', () => {
    // 세그먼트 생성 단계인데 칸이 없는 것은 서버가 세그먼트를 아직 싣지 않은 경우다. 빈 격자보다
    //   그 사실을 적는 편이 낫다.
    expect(awaitingSegmentsNotice('SEGMENT_GENERATING')).toBeTruthy();
    expect(awaitingSegmentsNotice('UNKNOWN' as GenerationStage)).toBeTruthy();
  });
});

describe('elapsedLabel', () => {
  it('0초는 00:00:00 이다', () => {
    expect(elapsedLabel(1000, 1000)).toBe('00:00:00');
  });

  it('자리수를 채운다', () => {
    expect(elapsedLabel(0, 9_000)).toBe('00:00:09');
    expect(elapsedLabel(0, 65_000)).toBe('00:01:05');
  });

  it('한 시간을 넘겨도 시 자리로 이어진다', () => {
    expect(elapsedLabel(0, 3_723_000)).toBe('01:02:03');
  });

  it('시계가 뒤로 가도 음수를 보이지 않는다', () => {
    // 기기 시각 보정이 실제로 일어난다. 그때 '-1:59:59' 같은 값을 화면에 내보내지 않는다.
    expect(elapsedLabel(10_000, 0)).toBe('00:00:00');
  });
});
