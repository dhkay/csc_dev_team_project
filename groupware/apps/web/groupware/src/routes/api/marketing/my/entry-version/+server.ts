// 진입 기본 버전 BFF: csc-marketing `/user-settings/entry-version` 중계
// PUT 만 둔다. 조회는 도구 랜딩이 SSR 로 읽어 리다이렉트에 쓰므로 브라우저가 물어볼 일이 없다.
//
// "지금 보는 버전" 이 아니다. 그건 주소가 정한다(`/{org}/{tool}/{version}/{channel}`). 이 값은
//   다음에 도구를 열 때 어디로 보낼지의 힌트뿐이라 버전 스코프가 아니다(`?version=` 을 받지 않는다)
//   이 값이 AI 모델 슬롯 키를 겸하면 화면과 실제 쓰이는 모델이 갈린다.
// ownerUserId 는 세션에서 나온다(본문 값을 쓰면 남의 설정을 바꿀 수 있다)
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { mapMarketingError, requireOrgUser } from '$lib/server/marketing/bff';
import { parseVersionMode } from '$lib/shared/lib/versionMode/versionMode';

/** 지정: PUT /api/marketing/my/entry-version { version } → { data: { version } } */
export async function PUT(event: RequestEvent) {
  const auth = await requireOrgUser(event);
  if ('error' in auth) return auth.error;

  const body = (await event.request.json().catch(() => null)) as { version?: unknown } | null;
  // 모르는 값은 여기서 기본으로 좁힌다. 진입 기본값이라 막을 이유가 없고(도구에 못 들어가면 안 된다),
  //   걸러 보내야 응답의 버전과 화면이 어긋나는 순간이 생기지 않는다. 요청 축의 버전은 반대다(400)
  const version = parseVersionMode(body?.version);

  try {
    const res = await serverMarketingClient().PUT<{ version: string }>(
      '/user-settings/entry-version',
      { organizationId: auth.orgId, ownerUserId: auth.userId, version },
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapMarketingError(error, '진입 버전을 기록하지 못했습니다.');
  }
}
