// 에셋 세트 SSR 로드: 워크스페이스(세트 적용 피커)와 에셋 섹션(세트 편집)이 같은 목록을 쓴다.
//
// 두 로더에 같은 조회와 같은 매핑이 글자까지 똑같이 복제돼 있었다. 그 상태의 문제는 중복 자체보다
// 한쪽만 고쳐질 수 있다는 점이다(uploadId → 접근 URL 재구성처럼 규칙이 바뀌는 자리다)
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';
import { softLoad } from '$lib/server/http/softLoad';
import { fileAccessUrl } from '$lib/server/upload/fileUrl';
import type { AssetSetRecord, AssetSetView } from '$lib/features/marketing-assets/types';

/**
 * 공통 ∪ 자기 조직의 에셋 세트. organizationId 를 백엔드로 전달해 타 조직을 격리한다.
 * orgId 가 없으면 공통만 온다(쿼리 생략)
 *
 * 실패하면 빈 목록으로 접는다. 세트는 보조 자원이라 못 불러왔다고 화면 전체를 막지 않는다.
 */
export function loadAssetSets(organizationId: number | null): Promise<AssetSetView[]> {
  const query = organizationId ? `?organizationId=${organizationId}` : '';
  return softLoad<AssetSetView[]>(
    '에셋 세트',
    async () => {
      const res = await serverMarketingClient().GET<AssetSetRecord[]>(`/asset-sets${query}`);
      // uploadId → 표시용 서명 접근 URL(require_signed_download 대비, OFF 면 무해)
      return (res.data ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        scope: s.scope,
        frameUrl: fileAccessUrl(s.frameUploadId),
        outroUrl: fileAccessUrl(s.outroUploadId),
        overlays: s.overlays ?? null
      }));
    },
    []
  );
}