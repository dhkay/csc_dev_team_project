// 채널 데이터 접근(브라우저): 같은 origin BFF(/api/marketing/channels)만 frontClient 로 호출
// 조직 스코프는 BFF 가 세션에서 주입하므로 여기선 organizationId 를 다루지 않는다.
import { frontClient } from '$lib/infrastructure/http/clientInstances';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import type { Channel } from '../types';
import { run, type ApiResult } from './result';

const CHANNELS = ROUTES.MARKETING.CHANNELS;

export function listChannels(): Promise<ApiResult<Channel[]>> {
  return run<Channel[]>(() => frontClient().GET(CHANNELS));
}

export function addChannel(name: string): Promise<ApiResult<Channel>> {
  return run<Channel>(() => frontClient().POST(CHANNELS, { name }));
}

export function updateChannel(id: number, name: string): Promise<ApiResult<Channel>> {
  return run<Channel>(() => frontClient().PATCH(`${CHANNELS}/${id}`, { name }));
}

export function removeChannel(id: number): Promise<ApiResult> {
  return run(() => frontClient().DELETE(`${CHANNELS}/${id}`));
}

export function reorderChannels(orderedIds: number[]): Promise<ApiResult> {
  return run(() => frontClient().PUT(`${CHANNELS}/order`, { orderedIds }));
}

