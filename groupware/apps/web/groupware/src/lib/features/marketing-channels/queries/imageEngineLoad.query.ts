// 이미지 엔진 부하(공유 GPU 큐) 조회 레이어: TanStack Query.
//   자체 모델이면 { running, pending }, 외부 벤더(큐 없음)면 null.
//   워크스페이스가 열려 있는 동안 주기 폴링해 "지금 앞에 몇 건"을 최신으로 보여준다.
import { queryOptions } from '@tanstack/svelte-query';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import type { ImageEngineLoad } from '../types';
import * as api from '../apis/planApi';

/** 부하 폴링 간격(ms): 큐는 초 단위로 바뀌므로 자주 보되, 서버/GPU 를 몰지 않게 5초 */
const POLL_MS = 5000;

// 쿼리 키에 채널 축이 없다: 부하는 내가 고른 이미지 모델의 엔진에 달렸고 채널과 무관하다.
//   채널로 키를 잡으면 같은 값이 채널 수만큼 따로 캐시되고 채널을 옮길 때마다 다시 받는다.
// 버전 축은 있다: 이미지 모델 선택이 버전 슬롯에 있으므로 버전이 다르면 다른 엔진의 큐일 수 있다.
export const imageEngineLoadKeys = {
  mine: (version: VersionMode) => ['marketing-image-engine-load', version] as const,
};

/**
 * 부하 조회 옵션: 소비자가 `enabled` 로 켠다(워크스페이스가 열려 있을 때만 폴링)
 *   응답 null = "이 엔진엔 큐가 없다"(외부 벤더)라는 정상 값이라, 그때는 폴링을 멈춘다(무의미한 요청 방지)
 *   부하는 보조 정보라 실패해도 조용히 접는다(재시도 1회로 충분, 화면엔 표시만 안 함)
 */
export function imageEngineLoadQueryOptions(version: VersionMode, enabled = true) {
  return queryOptions({
    queryKey: imageEngineLoadKeys.mine(version),
    enabled,
    queryFn: async (): Promise<ImageEngineLoad | null> => {
      const res = await api.getImageEngineLoad(version);
      if (!res.success) {
        throw new Error(res.error ?? '이미지 엔진 부하를 불러오지 못했습니다.');
      }
      return res.data;
    },
    // 자체 모델(큐 있음)일 때만 계속 폴링. 외부(null)면 멈춘다. 물어봐야 늘 null 이라 무의미
    refetchInterval: (query) => (query.state.data === null ? false : POLL_MS),
    // 큐 값은 금세 stale: 재진입/포커스 시 즉시 새로 본다.
    staleTime: 0,
  });
}
