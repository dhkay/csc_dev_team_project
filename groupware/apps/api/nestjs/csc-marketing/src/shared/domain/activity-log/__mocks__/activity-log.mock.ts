import type { ActivityLogPort } from '../activity-log.port';

/**
 * 활동 로그 Mock 팩토리: 도메인 4개(기획안/원천/최종/채널) 스펙이 공유한다.
 *
 * 포트가 공유 자산이라 mock 도 포트 옆에 둔다(도메인별 __mocks__ 에 복제하면 시그니처 변경 시
 * 네 곳을 고쳐야 한다)
 */
export const createActivityLogMock = (): jest.Mocked<ActivityLogPort> => ({
  log: jest.fn(),
});
