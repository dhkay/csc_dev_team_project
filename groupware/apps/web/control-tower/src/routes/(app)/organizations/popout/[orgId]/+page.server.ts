import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { authControlClient } from '$lib/infrastructure/http/serverClientInstances';
import { withOrgLogoUrl } from '$lib/server/organizations/orgView';
import type { OrganizationSummary } from '$lib/features/organizations/types';
import type { AiToolCatalogItem } from '$lib/features/ai-tools/types';

// 조직 상세 팝아웃 로드: 기존 목록 엔드포인트(/platform/organizations)에서 orgId 로 찾는다(신규 백엔드 없음)
// AI 도구 부여 토글 라벨은 카탈로그(/platform/ai-tools, 표시명 DB 단일 출처)에서 가져온다.
// 가드(isPlatformAdmin)는 상위 (app)/+layout.server.ts 가 담당
export const load: PageServerLoad = async (event) => {
  const id = Number(event.params.orgId);
  if (!Number.isFinite(id)) throw error(404, '조직을 찾을 수 없습니다.');

  const client = authControlClient(event);
  const [orgsRes, aiToolsRes] = await Promise.all([
    client.GET<OrganizationSummary[]>('/platform/organizations'),
    client.GET<AiToolCatalogItem[]>('/platform/ai-tools'),
  ]);
  const org = (orgsRes.data ?? []).find((o) => o.id === id);
  if (!org) throw error(404, '조직을 찾을 수 없습니다.');

  // 로고 uploadId → 표시용 서명 URL(+ 원본 uploadId 유지: 편집 폼 제출/baseline)
  return { org: withOrgLogoUrl(org), aiToolsCatalog: aiToolsRes.data ?? [] };
};
