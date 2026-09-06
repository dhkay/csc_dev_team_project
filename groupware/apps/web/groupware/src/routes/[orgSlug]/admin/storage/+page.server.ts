import { loadStorageAccess } from '$lib/server/storage/access';
import type { PageServerLoad } from './$types';

/**
 * /[orgSlug]/admin/storage: 조직 스토리지(공통 / 조직 / 개인)
 *
 * 전 조직원이 들어온다. 개인 영역은 누구에게나 있어야 하고, 공통은 조직 전원이 함께 쓴다.
 * 상위 admin 레이아웃이 이미 조직유저와 slug 일치를 확인하므로 여기서는 추가 가드를 두지 않는다.
 * 무엇을 볼 수 있는지는 영역별 권한이 정하고, 그 집행은 file-upload 가 한다.
 *
 * 여기서 싣는 것은 신원과 접근 범위뿐이다. 폴더 내용과 사용량은 클라이언트 쿼리로 가져온다.
 * 로드가 영역이나 부서를 읽으면 좌측 nav 를 누를 때마다 페이지 전체가 다시 로드된다.
 */
export const load: PageServerLoad = async (event) => {
  const access = await loadStorageAccess(event);
  return {
    // 하단 공지 바는 선언하지 않는다. 관리자 셸의 기본이 "감춤" 이고 로비만 띄운다.
    //   (widgets/AdminShell/shellChrome.ts). 화면마다 false 를 되풀이하지 않는다.
    actor: {
      userId: access.userId,
      canManage: access.canManage,
      isTeamLeader: access.isTeamLeader,
      accessibleDepartmentIds: access.accessibleDepartmentIds
    },
    departments: access.departments,
    roster: access.roster,
    // 디렉터리 조회가 실패하면 부서와 이름이 비어 있다. 공통과 개인은 그대로 동작하므로
    //   화면을 막지 않고 그 사실만 알린다.
    loadError: access.departments.length === 0 && access.roster.length === 0
  };
};
