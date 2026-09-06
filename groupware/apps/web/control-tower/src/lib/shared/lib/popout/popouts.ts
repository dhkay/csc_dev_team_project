import type { PopoutDescriptor } from '@csc/shared-ui/popout';

/**
 * control-tower 팝아웃 단일 출처: url/name/size 를 한 곳에서 관리한다.
 *
 * 새 팝아웃 추가 절차:
 *   1) 여기에 디스크립터 빌더 추가(url 은 아래 라우트 폴더와 1:1 로 일치)
 *   2) src/routes/(app)/organizations/popout/<...>/+page.svelte 라우트 생성
 *   3) opener 에서 openPopout(popouts.<key>(...)) 호출
 *
 * url 은 반드시 가드 그룹((app)) 하위에 둔다. +layout.server.ts(isPlatformAdmin) 인증이 상속된다.
 */
export const popouts = {
  orgCreate: (): PopoutDescriptor => ({
    url: '/organizations/popout/create',
    name: 'popout:org-create',
    size: 'md',
  }),
  orgDetail: (orgId: number): PopoutDescriptor => ({
    url: `/organizations/popout/${orgId}`,
    name: `popout:org-detail:${orgId}`,
    size: 'md',
  }),
  adminCreate: (): PopoutDescriptor => ({
    url: '/admins/popout/create',
    name: 'popout:admin-create',
    size: 'md',
  }),
  adminDetail: (adminId: number): PopoutDescriptor => ({
    url: `/admins/popout/${adminId}`,
    name: `popout:admin-detail:${adminId}`,
    size: 'md',
  }),
};
