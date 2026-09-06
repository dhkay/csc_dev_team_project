// 개인 마케팅영상 자산 presign(공용): file-upload `POST /uploads/presign` 로 중계(서비스토큰 자동 주입)
//
// partition 을 계층 경로로 주입한다: groupware/<orgId>/marketing-video/personal/<userId>/<uuid>.
//   → 조직별 + AI도구별 + 작업자 개인별 스토리지 분리. scope/partition 은 BFF 가 도출(클라 비선택)
//
// 라우트는 자산 종류마다 따로 두고 시퀀스만 여기서 공유한다. 그 라우트가 곧 "무엇을 어디에
// 올리는가" 의 선언이라 남의 이름으로 올리면 그 선언이 사실과 달라지고, 나중에 한 종류만 다른 곳에
// 두려 할 때 갈라낼 자리가 없다. 반대로 시퀀스를 복제하면 auth 게이트와 파티션 규칙이 두 벌이 된다.
import type { RequestEvent } from '@sveltejs/kit';
import { serverStorageClient } from '$lib/infrastructure/http/serverClientInstances';
import { AUTH_ERROR_RULES, ok, fail, mapHttpError } from '$lib/server/http/bff';
import { requireOrgUser } from '$lib/server/marketing/bff';

interface PresignResponse {
  upload_id: string;
  presigned_url: string;
}

/**
 * 그 작업자의 개인 자산 업로드 주소를 발급한다.
 *
 * `log` 는 실패 로그에 남길 자산 이름이다. 어느 업로더가 막혔는지가 로그의 첫 단서라, 두 라우트가
 * 같은 문장을 남기면 그 단서가 사라진다.
 */
export async function presignPersonalAsset(event: RequestEvent, log: string) {
  const auth = await requireOrgUser(event);
  if ('error' in auth) return auth.error;

  try {
    const { fileName, mimeType, size } = await event.request.json();
    if (typeof fileName !== 'string' || typeof mimeType !== 'string' || typeof size !== 'number') {
      return fail('잘못된 요청입니다.', { status: 400 });
    }

    const res = await serverStorageClient().POST<PresignResponse>('/uploads/presign', {
      file_name: fileName,
      mime_type: mimeType,
      size,
      scope: 'groupware',
      partition: `${auth.orgId}/marketing-video/personal/${auth.userId}`,
      organization_id: auth.orgId,
    });

    return ok({ uploadId: res.data.upload_id, presignedUrl: res.data.presigned_url });
  } catch (error) {
    return mapHttpError(error, {
      fallback: '업로드 준비에 실패했습니다.',
      log,
      table: {
        ...AUTH_ERROR_RULES,
        400: { message: '업로드할 수 없는 파일입니다.' },
      },
    });
  }
}
