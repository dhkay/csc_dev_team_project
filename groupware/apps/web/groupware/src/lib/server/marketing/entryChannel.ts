// 마케팅 영상 도구 진입: 어느 채널부터 열 것인가(서버 전용)
// 도구 랜딩(`/{org}/{tool}`)과 버전 랜딩(`/{org}/{tool}/{version}`)이 공유한다.
import type { ServerLoadEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { softLoad } from '$lib/server/http/softLoad';
import { fetchMyChannels, type MyChannel } from '$lib/server/marketing/myChannels';
import { channelPathSlug } from '$lib/features/marketing-channels/slugify';
import {
  DEFAULT_VERSION_MODE,
  parseVersionMode,
  type VersionMode
} from '$lib/shared/lib/versionMode/versionMode';

/**
 * 본인이 정한 진입 채널의 slug. 고른 적 없거나 그 채널이 지워졌으면 순서상 첫 채널
 *
 * 지정값을 지우지 않는다: 읽을 때 접으면 되고, 채널 삭제마다 정리하는 잡을 둘 이유가 없다.
 * 채널이 하나도 없거나 조회가 실패하면 null(호출부가 안내 화면을 그린다)
 */
export async function resolveEntryChannelSlug(event: ServerLoadEvent): Promise<string | null> {
  const user = await event.locals.getUser();
  const orgId = user?.organization?.id;
  if (!orgId || !user) return null;

  // 조회 실패는 빈 목록으로 접힌다. 아래 "채널 0개" 처리가 그 경우까지 같이 받는다.
  const channels = await softLoad<MyChannel[]>(
    '진입 채널 목록',
    () => fetchMyChannels(orgId, user.id),
    []
  );
  if (channels.length === 0) return null;

  // 설정 하나 때문에 도구 진입을 막지 않는다: 못 읽으면 첫 채널로 접는다.
  const preferredId = await softLoad<number | null>(
    '진입 기본 채널 설정',
    async () => {
      const res = await serverMarketingClient().GET<{ channelId: number | null }>(
        `/user-settings/default-channel?organizationId=${orgId}&ownerUserId=${user.id}`
      );
      return res.data?.channelId ?? null;
    },
    null
  );
  return channelPathSlug(channels.find((c) => c.id === preferredId) ?? channels[0]);
}

/**
 * 진입 기본 버전: 그 사람이 마지막으로 쓴 버전(고른 적 없으면 기본)
 *
 * 진입마다 기본 버전으로 리셋하지 않는다. 버전이 주소에서 오므로 저장값이 생성 경로의 입력이 아니고
 * (되살려도 화면과 실제 쓰이는 모델이 갈리지 않는다), 파이프라인이 갈린 두 버전은 사실상 다른
 * 도구라 v1.0 으로 일하는 사람을 매일 아침 v1.5 에 떨어뜨리는 것은 손해다.
 *
 * 조회 실패는 기본으로 접는다(버전 하나 때문에 도구 진입을 막지 않는다)
 */
export async function resolveEntryVersion(event: ServerLoadEvent): Promise<VersionMode> {
  const user = await event.locals.getUser();
  const orgId = user?.organization?.id;
  if (!orgId || !user) return DEFAULT_VERSION_MODE;
  return softLoad(
    '진입 기본 버전',
    async () => {
      const res = await serverMarketingClient().GET<{ version: string }>(
        `/user-settings/entry-version?organizationId=${orgId}&ownerUserId=${user.id}`
      );
      return parseVersionMode(res.data?.version);
    },
    DEFAULT_VERSION_MODE
  );
}
