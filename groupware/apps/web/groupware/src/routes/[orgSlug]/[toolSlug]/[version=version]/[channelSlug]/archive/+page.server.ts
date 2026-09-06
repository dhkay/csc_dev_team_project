// 보관함 SSR 로드: 조직 멤버 명부 + 지금 보는 사람의 id.
//
// 보관함은 조직 공용이라 남이 만든 항목이 섞인다. 카드가 "누가 만들었는지" 를 말해야 하고,
// 그러려면 id → 이름을 풀 명부가 필요하다(응답에는 ownerUserId 만 온다)
// 내 id 와 관리급 여부를 함께 내리는 이유: 삭제는 만든 사람 또는 관리급(대표/팀장)만 할 수 있어
// 화면이 고를 수 없는 카드를 구분해야 한다(실제 경계는 서버다. 이건 눌러도 아무 일도 일어나지 않는
// 상황을 만들지 않기 위한 것이다)
//
// 명부 조회가 실패해도 화면은 뜬다(loadOrgMemberRoster 가 빈 배열 폴백). 이름 자리에
// '알 수 없는 사용자 (#id)' 가 보일 뿐 보관함 자체는 막히지 않는다.
import { isToolManager } from '$lib/server/marketing/bff';
import { loadOrgMemberRoster } from '$lib/server/marketing/roster';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const user = await event.locals.getUser();
  return {
    members: await loadOrgMemberRoster(event),
    viewerUserId: user?.id ?? null,
    // 삭제 BFF 가 같은 함수로 판정한다: 화면과 서버가 같은 규칙을 본다.
    canManageAll: await isToolManager(event),
  };
};
