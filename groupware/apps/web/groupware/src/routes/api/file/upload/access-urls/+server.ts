// 서명 다운로드 URL 배치 발급 BFF: file-upload `POST /uploads/access-urls` 로 중계(서비스토큰 자동 주입)
//
// 클라이언트가 렌더 직전에 uploadId 목록으로 서명 URL 을 받는 용도(서버 렌더로 못 미리 서명하는 경우)
// 현재 소비자: 마케팅 플랜카드의 오디오(bgm/효과음) 미리보기: 라이브 편집이라 URL 이 클라 상태에서 나온다.
// 조직 스코프는 BFF 가 세션에서 도출해 강제(require_signed_download 시 자기 조직 자산만 발급됨)
import type { RequestEvent } from '@sveltejs/kit';
import { serverStorageClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail } from '$lib/server/http/bff';
import { requireOrgId } from '$lib/server/marketing/bff';

interface AccessUrlsResponse {
  urls: Record<string, string>;
}

export async function POST(event: RequestEvent) {
  const auth = await requireOrgId(event);
  if ('error' in auth) return auth.error;

  try {
    const { ids } = await event.request.json();
    if (!Array.isArray(ids) || ids.some((i) => typeof i !== 'string')) {
      return fail('잘못된 요청입니다.', { status: 400 });
    }
    if (ids.length === 0) return ok({ urls: {} });

    // 자기 조직 자산만 서명 발급(all_orgs=false): file-upload 가 소유 인덱스로 org 일치를 검증
    const res = await serverStorageClient().POST<AccessUrlsResponse>('/uploads/access-urls', {
      ids,
      organization_id: auth.orgId,
      all_orgs: false,
    });
    return ok({ urls: res.data.urls ?? {} });
  } catch {
    // 발급 실패는 치명 아님: 빈 맵 반환(호출측이 미표시/폴백). 목록 렌더를 막지 않는다.
    return ok({ urls: {} });
  }
}
