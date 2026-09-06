// 공용 API 자격증명 BFF: csc-groupware `/api-credentials` 중계 (루트 권한자 전용)
// GET: 조직의 프로바이더 자격증명 뷰(설정된 필드 목록 + 비시크릿 필드의 값. 시크릿 값은 오지 않는다)
// POST: 등록/교체(저장 시 백엔드가 실검증). DELETE: 등록 해제
// organizationId 는 세션에서 도출해 BFF 가 주입한다(브라우저 비신뢰)
//
// 응답 타입은 화면과 같은 선언을 쓴다. 여기 따로 두면 응답에 필드가 늘어도 이쪽만 낡은 채 남고,
// 중계라 런타임은 그대로 통과해 아무도 눈치채지 못한다.
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { serverMainClient } from '$lib/infrastructure/http/serverClientInstances';
import type { ApiCredentialView } from '$lib/features/api-credentials/types';
import {
  requireApiCredentialManager,
  mapApiCredentialError
} from '$lib/server/api-credentials/bff';

/** 목록 조회: GET /api/api-credentials */
export async function GET(event: RequestEvent) {
  const auth = await requireApiCredentialManager(event);
  if ('error' in auth) return auth.error;

  try {
    const res = await serverMainClient().GET<ApiCredentialView[]>(
      `/api-credentials?organizationId=${auth.orgId}`
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapApiCredentialError(error, '자격증명을 불러오지 못했습니다.');
  }
}

/** 등록/교체: POST /api/api-credentials { provider, credentials } */
export async function POST(event: RequestEvent) {
  const auth = await requireApiCredentialManager(event);
  if ('error' in auth) return auth.error;

  const body = (await event.request.json().catch(() => null)) as {
    provider?: string;
    credentials?: Record<string, string>;
  } | null;
  if (!body || typeof body.provider !== 'string' || typeof body.credentials !== 'object') {
    return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  }

  try {
    const res = await serverMainClient().POST<ApiCredentialView>('/api-credentials', {
      organizationId: auth.orgId,
      provider: body.provider,
      credentials: body.credentials
    });
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapApiCredentialError(error, '자격증명을 저장하지 못했습니다.');
  }
}

/** 등록 해제: DELETE /api/api-credentials { provider } */
export async function DELETE(event: RequestEvent) {
  const auth = await requireApiCredentialManager(event);
  if ('error' in auth) return auth.error;

  const body = (await event.request.json().catch(() => null)) as { provider?: string } | null;
  if (!body || typeof body.provider !== 'string') {
    return json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  }

  try {
    await serverMainClient().DELETE<{ success: boolean }>('/api-credentials', {
      organizationId: auth.orgId,
      provider: body.provider
    });
    return json({ success: true, data: null });
  } catch (error) {
    return mapApiCredentialError(error, '자격증명을 삭제하지 못했습니다.');
  }
}
