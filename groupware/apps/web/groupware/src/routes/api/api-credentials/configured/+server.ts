// 등록된 프로바이더 조회 BFF: csc-groupware `/api-credentials/configured` 중계 (논-시크릿, org-member)
// GET: 조직에 실제 등록된(자격증명이 채워진) 프로바이더 key 목록만 반환(값/필드명 없음)
// 목록(GET /api/api-credentials)은 루트 전용이지만, 이 경로는 마케팅 AI 모델 게이팅용이라
// 조직 편집자(팀장 등)도 읽을 수 있게 org-member 게이트만 건다. organizationId 는 세션에서 도출
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { serverMainClient } from '$lib/infrastructure/http/serverClientInstances';
import { requireOrgId, mapApiCredentialError } from '$lib/server/api-credentials/bff';

/** 등록된 프로바이더 목록: GET /api/api-credentials/configured */
export async function GET(event: RequestEvent) {
  const auth = await requireOrgId(event);
  if ('error' in auth) return auth.error;

  try {
    const res = await serverMainClient().GET<string[]>(
      `/api-credentials/configured?organizationId=${auth.orgId}`
    );
    return json({ success: true, data: res.data });
  } catch (error) {
    return mapApiCredentialError(error, '등록된 API 정보를 불러오지 못했습니다.');
  }
}
