import type { PopoutDescriptor } from '@csc/shared-ui/popout';

/**
 * groupware 팝아웃 단일 출처: url/name/size 를 한 곳에서 관리한다.
 *
 * 새 팝아웃 추가 절차:
 *   1) 여기에 디스크립터 빌더 추가(url 은 아래 라우트 폴더와 1:1 로 일치)
 *   2) 가드 아래에 `popout/<...>/+page.svelte` 라우트 생성 + 그 폴더에 `+layout@.svelte`(셸 리셋)
 *   3) opener 에서 openPopout(popouts.<key>(...)) 호출
 *
 * url 은 반드시 가드 라우트 하위에 둔다. 그 트리의 +layout.server.ts 가 로드 체인에서 함께 실행된다.
 *   - 관리자 화면: [orgSlug]/admin (인증/역할)
 */
export const popouts = {
  employeeDirectory: (orgSlug: string): PopoutDescriptor => ({
    url: `/${orgSlug}/admin/popout/employee-directory`,
    name: 'popout:employee-directory',
    size: 'lg',
  }),
  notice: (orgSlug: string, id: string): PopoutDescriptor => ({
    url: `/${orgSlug}/admin/popout/notice/${id}`,
    name: `popout:notice:${id}`,
    size: 'sm',
  }),
  memberCreate: (orgSlug: string): PopoutDescriptor => ({
    url: `/${orgSlug}/admin/popout/member-create`,
    name: 'popout:member-create',
    size: 'sm',
  }),
  memberDetail: (orgSlug: string, memberId: number): PopoutDescriptor => ({
    url: `/${orgSlug}/admin/popout/member-detail/${memberId}`,
    name: `popout:member-detail:${memberId}`,
    size: 'sm',
  }),
  accountSettings: (orgSlug: string): PopoutDescriptor => ({
    url: `/${orgSlug}/admin/popout/account-settings`,
    name: 'popout:account-settings',
    size: 'md',
  }),
  chatbot: (orgSlug: string): PopoutDescriptor => ({
    url: `/${orgSlug}/admin/popout/chatbot`,
    name: 'popout:chatbot',
    size: 'md',
  }),
};
