import { describe, it, expect } from 'vitest';
import { imageEngineLoadQueryOptions } from '$lib/features/marketing-channels/queries/imageEngineLoad.query';

// 공유 이미지 GPU 부하 폴링: 자체 모델(큐 있음)일 때만 계속 물어보고, 외부 벤더(null=큐 없음)면 멈춘다.
// 이 규칙이 깨지면 외부 모델 채널에서 5초마다 무의미한 요청이 영원히 나간다.

function refetchInterval(enabled = true) {
  const opts = imageEngineLoadQueryOptions('v1.5', enabled) as unknown as {
    refetchInterval: (q: { state: { data: unknown } }) => number | false;
  };
  return opts.refetchInterval;
}

describe('이미지 엔진 부하 쿼리', () => {
  it('워크스페이스가 닫혀 있으면(enabled=false) 조회하지 않는다', () => {
    const opts = imageEngineLoadQueryOptions('v1.5', false) as { enabled?: boolean };
    expect(opts.enabled).toBe(false);
  });

  it('채널과 무관하되 버전으로는 갈린다', () => {
    // 채널로 키를 잡던 시절에는 채널 미선택이면 조회 자체를 막았다. 이제 막을 이유가 없다.
    // 버전은 키에 있다: 고른 이미지 모델이 버전 슬롯에 있어 버전이 다르면 다른 엔진의 큐일 수 있다.
    const opts = imageEngineLoadQueryOptions('v1.5') as {
      enabled?: boolean;
      queryKey?: readonly unknown[];
    };
    expect(opts.enabled).toBe(true);
    expect(opts.queryKey).toEqual(['marketing-image-engine-load', 'v1.5']);
  });

  it('자체 모델(큐 있음)이면 5초마다 폴링한다', () => {
    const fn = refetchInterval();
    expect(fn({ state: { data: { running: 1, pending: 4 } } })).toBe(5000);
    expect(fn({ state: { data: { running: 0, pending: 0 } } })).toBe(5000); // 한가해도 계속 본다
  });

  it('외부 벤더(null=큐 없음)면 폴링을 멈춘다', () => {
    const fn = refetchInterval();
    expect(fn({ state: { data: null } })).toBe(false);
  });
});
