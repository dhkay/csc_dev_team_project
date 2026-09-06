// 진입 채널(개인) 데이터 접근(브라우저). BFF(/api/marketing/my/default-channel) frontClient 호출
// 대상 유저는 BFF 가 세션에서 정한다(요청에 담지 않는다)
import { frontClient } from '$lib/infrastructure/http/clientInstances';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import { run, type ApiResult } from './result';

type DefaultChannel = { channelId: number | null };

export function getMyDefaultChannel(): Promise<ApiResult<DefaultChannel>> {
  return run<DefaultChannel>(() => frontClient().GET(ROUTES.MARKETING.MY_DEFAULT_CHANNEL));
}

/** null = 지정 해제(첫 채널로 돌아간다) */
export function setMyDefaultChannel(channelId: number | null): Promise<ApiResult<DefaultChannel>> {
  return run<DefaultChannel>(() =>
    frontClient().PUT(ROUTES.MARKETING.MY_DEFAULT_CHANNEL, { channelId }),
  );
}
