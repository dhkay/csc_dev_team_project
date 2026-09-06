import { OrgPosition } from '@csc/entitlements';
import type { PageServerLoad } from './$types';
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { fileAccessUrl } from '$lib/server/upload/fileUrl';
import { loadAssetSets } from '$lib/server/marketing/assetSets';
import { hasRootAuthority } from '$lib/shared/lib/auth/access';
import type {
  AssetAxisView,
  AssetSetView,
  CommonAssetRecord,
  CommonAssetView,
} from '$lib/features/marketing-assets/types';

// 조직 마케팅영상 자산: 플랫폼 공통(scope='common', 읽기전용) + 조직(scope='organization', ROOT/대표/팀장 편집)
//   접근 게이트(뷰)는 부모 [toolSlug] 레이아웃(marketing-video 접근). 편집 권한(canManage)은 여기서 계산해 page 로 전달
//   organizationId 를 백엔드로 전달해 common ∪ 자기 org 만 조회(타 org 격리). uploadId → 접근 URL 재구성

export const load: PageServerLoad = async (event) => {
  // 버전 게이트는 여기가 아니라 [channelSlug] 레이아웃이 소유한다(모든 섹션이 그것을 지난다)
  //   섹션마다 두면 새 섹션이 게이트 없이 추가될 수 있고, 그 빠짐은 주소로 열어 봐야 드러난다.
  const user = await event.locals.getUser();
  const orgId = user?.organization?.id ?? null;
  const position = (user as { position?: OrgPosition | null } | null)?.position ?? null;
  const canManage = hasRootAuthority(user) || position === OrgPosition.TeamLeader;

  const query = orgId ? `?organizationId=${orgId}` : '';

  let commonAssets: CommonAssetView[] = [];
  let assetSets: AssetSetView[] = [];
  let axes: AssetAxisView[] = [];

  try {
    const res = await serverMarketingClient().GET<CommonAssetRecord[]>(`/common-assets${query}`);
    commonAssets = (res.data ?? []).map((a) => ({
      id: a.id,
      category: a.category,
      scope: a.scope,
      uploadId: a.uploadId,
      name: a.name,
      url: fileAccessUrl(a.uploadId) ?? '',
      kind: a.category === 'FONT' ? 'font' : a.mimeType.startsWith('audio/') ? 'audio' : 'image',
      tags: a.tags ?? [],
    }));
  } catch (e) {
    console.error('공통 에셋 조회 실패:', e instanceof Error ? e.message : 'unknown');
  }

  try {
    // 태그 카탈로그(축+태그): organizationId 로 공통 ∪ 우리 조직 축/태그를 함께 받는다. 태깅/관리 UI 가 소비
    const res = await serverMarketingClient().GET<AssetAxisView[]>(`/asset-catalog/axes${query}`);
    axes = res.data ?? [];
  } catch (e) {
    console.error('태그 카탈로그 조회 실패:', e instanceof Error ? e.message : 'unknown');
  }

  assetSets = await loadAssetSets(orgId);

  return { commonAssets, assetSets, canManage, axes };
};
