import type { ResourceKey } from '../types';

/** 서버 모니터링 쿼리 키 팩토리: 무효화/캐시 참조 단일 출처 */
export const serverKeys = {
  all: ['servers'] as const,
  metrics: () => [...serverKeys.all, 'metrics'] as const,
  top: (id: string, resource: ResourceKey) => [...serverKeys.all, id, 'top', resource] as const,
  hardware: (id: string) => [...serverKeys.all, id, 'hardware'] as const,
};
