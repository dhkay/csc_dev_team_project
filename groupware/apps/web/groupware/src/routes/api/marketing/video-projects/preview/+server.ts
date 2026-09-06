// 미리보기 산출물 등록 BFF: csc-marketing `POST /video-projects/preview` 로 중계. 개발 전용
//
// 왜 있는가: 이 도구 버전의 '영상 생성' 은 작업 공간 배치와 서버 저장을 함께 하는 버튼이다. 그런데
// 진행 화면 미리보기는 유료 렌더를 돌리지 않으므로 그 시점까지 서버에 아무 행도 없어, 그 버튼이 실제로
// 무엇을 하는지 확인할 방법이 없었다. 캐시에만 카드를 넣어 봤더니 그 뒤의 모든 동작(보관, 삭제,
// 재렌더)이 서버가 모르는 id 로 나가 400 이 됐다. 그래서 미리보기도 실제 행을 만든다.
//
// prod 에서는 이 라우트가 없다(dev 게이트 + 백엔드도 같은 판정). 두 겹인 이유: 프론트 게이트만
// 두면 백엔드에 그 경로가 남고, 백엔드만 두면 브라우저가 부를 수 있는 주소가 남는다.
import type { RequestEvent } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail } from '$lib/server/http/bff';
import {
  mapMarketingError,
  parseChannelId,
  parseClientRequestId,
  requireOrgUserVersion,
  versionedPath,
} from '$lib/server/marketing/bff';
import { withVideoProjectUrls, type RawVideoProject } from '$lib/server/marketing/videoProjectUrls';

/** 미리보기 산출물 등록: POST /api/marketing/video-projects/preview?version=&channelId= */
export async function POST(event: RequestEvent) {
  // 운영에서는 없는 경로다. 막혔다고 알리지 않는다(렌더 없이 완성본을 만드는 기능은 제품에 없다)
  if (!dev) return fail('Not found', { status: 404 });

  const auth = await requireOrgUserVersion(event);
  if ('error' in auth) return auth.error;

  const channelId = parseChannelId(event.url.searchParams.get('channelId'));
  if (!channelId) return fail('채널이 지정되지 않았습니다.', { status: 400 });

  try {
    const body = await event.request.json();
    const resultUploadId = typeof body?.resultUploadId === 'string' ? body.resultUploadId : '';
    const title = typeof body?.title === 'string' ? body.title : '';
    if (!resultUploadId || !title) return fail('잘못된 요청입니다.', { status: 400 });

    const res = await serverMarketingClient().POST<RawVideoProject>(
      versionedPath(auth.version, '/video-projects/preview'),
      {
        organizationId: auth.orgId,
        ownerUserId: auth.userId,
        channelId,
        title,
        videoModel: typeof body?.videoModel === 'string' ? body.videoModel : '',
        resultUploadId,
        // 빈 값을 실어 보내면 백엔드가 "그림이 있다" 로 읽어 확정할 수 없는 자산을 기다린다.
        ...(typeof body?.thumbnailUploadId === 'string' && body.thumbnailUploadId.trim()
          ? { thumbnailUploadId: body.thumbnailUploadId }
          : {}),
        ...(parseClientRequestId(body?.clientRequestId)
          ? { clientRequestId: parseClientRequestId(body.clientRequestId) }
          : {}),
      },
    );
    return ok(withVideoProjectUrls(res.data));
  } catch (error) {
    return mapMarketingError(error, '미리보기 산출물을 등록하지 못했습니다.');
  }
}
