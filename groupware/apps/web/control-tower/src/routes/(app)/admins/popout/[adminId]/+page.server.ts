import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { authControlClient } from '$lib/infrastructure/http/serverClientInstances';
import { isPlatformRoot } from '$lib/shared/lib/auth/platform';
import type { AdminSummary, AdminFeatureCatalogItem } from '$lib/features/admins/types';

// 관리자 상세 팝아웃 로드: ROOT 전용. 목록에서 adminId 로 찾고, 옵션(현재 부여), 카탈로그를 함께 내려준다.
export const load: PageServerLoad = async (event) => {
  if (!isPlatformRoot(await event.locals.getUser())) throw redirect(302, '/');

  const id = Number(event.params.adminId);
  if (!Number.isFinite(id)) throw error(404, '관리자를 찾을 수 없습니다.');

  const client = authControlClient(event);
  const [adminsRes, catalogRes, featuresRes] = await Promise.all([
    client.GET<AdminSummary[]>('/platform/admins'),
    client.GET<AdminFeatureCatalogItem[]>('/platform/admin-features'),
    client.GET<string[]>(`/platform/admins/${id}/features`),
  ]);

  const admin = (adminsRes.data ?? []).find((a) => a.id === id);
  if (!admin) throw error(404, '관리자를 찾을 수 없습니다.');

  return { admin, catalog: catalogRes.data ?? [], features: featuresRes.data ?? [] };
};
