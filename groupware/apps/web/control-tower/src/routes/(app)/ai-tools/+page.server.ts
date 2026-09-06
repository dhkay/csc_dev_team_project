import { redirect } from '@sveltejs/kit';
import { AiToolKey } from '@csc/entitlements';
import type { PageServerLoad } from './$types';
import {
  authControlClient,
  serverMarketingClient,
} from '$lib/infrastructure/http/serverClientInstances';
import { hasAdminFeature } from '$lib/shared/lib/auth/platform';
import { fileAccessUrl } from '$lib/server/upload/fileUrl';
import type { AiToolCatalogItem } from '$lib/features/ai-tools/types';
import type {
  AssetAxisView,
  CommonAsset,
  CommonAssetRecord,
} from '$lib/features/common-assets/types';
import type { AssetSet, AssetSetRecord } from '$lib/features/asset-sets/types';

// AI 도구 카탈로그 로드: csc-control-tower `GET /platform/ai-tools`(→ user 서버) 실데이터
// 접근 차단: ROOT 또는 'ai-tools-management' 옵션을 가진 관리자만
// marketing-video 설정 scene(?settings=marketing-video) 진입 시에만 공통 에셋 + 에셋 세트도 함께 로드
export const load: PageServerLoad = async (event) => {
  if (!hasAdminFeature(await event.locals.getUser(), 'ai-tools-management')) {
    throw redirect(302, '/');
  }

  let commonAssets: CommonAsset[] = [];
  let assetSets: AssetSet[] = [];
  let axes: AssetAxisView[] = [];
  if (event.url.searchParams.get('settings') === AiToolKey.MarketingVideo) {
    try {
      const res = await serverMarketingClient().GET<CommonAssetRecord[]>('/common-assets');
      commonAssets = (res.data ?? []).map((a) => ({
        ...a,
        tags: a.tags ?? [],
        accessUrl: fileAccessUrl(a.uploadId),
      }));
    } catch (e) {
      console.error('공통 에셋 조회 실패:', e instanceof Error ? e.message : 'unknown');
    }
    try {
      const res = await serverMarketingClient().GET<AssetSetRecord[]>('/asset-sets');
      assetSets = (res.data ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        sortOrder: s.sortOrder,
        frameUrl: s.frameUploadId ? fileAccessUrl(s.frameUploadId) : null,
        outroUrl: s.outroUploadId ? fileAccessUrl(s.outroUploadId) : null,
        overlays: s.overlays ?? null,
      }));
    } catch (e) {
      console.error('에셋 세트 조회 실패:', e instanceof Error ? e.message : 'unknown');
    }
    try {
      const res = await serverMarketingClient().GET<AssetAxisView[]>('/asset-catalog/axes');
      axes = res.data ?? [];
    } catch (e) {
      console.error('태그 카탈로그 조회 실패:', e instanceof Error ? e.message : 'unknown');
    }
  }

  try {
    const res = await authControlClient(event).GET<AiToolCatalogItem[]>('/platform/ai-tools');
    return { aiTools: res.data ?? [], commonAssets, assetSets, axes };
  } catch (e) {
    console.error('AI 도구 목록 조회 실패:', e instanceof Error ? e.message : 'unknown');
    return { aiTools: [] as AiToolCatalogItem[], loadError: true, commonAssets, assetSets, axes };
  }
};
