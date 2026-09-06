import { redirect } from '@sveltejs/kit';
import { hasRootAuthority } from '$lib/shared/lib/auth/access';
import {
  canEditToolSettings,
  canViewActivityLogs,
  isToolManagerSubject
} from '$lib/server/marketing/toolAccess';
import { loadOrgAiTools } from '$lib/server/ai-tools/orgAiTools';
import { signUserImages } from '$lib/server/upload/signUserImages';
import type { LayoutServerLoad } from './$types';

/**
 * /[orgSlug]/[toolSlug] 셸 가드: AI 도구 랜딩(현재 플레이스홀더)의 앱바 셸 + 인가
 *
 * 서버 게이트(관리자 대시보드 보조앱바 필터와 동일 규칙): 조직 부여(GET /organizations/{id}/ai-tools)
 * ∩ 유저 엔타이틀먼트(루트 권한자(ROOT/대표) 또는 aiTools 클레임 보유). 버튼이 안 보이는 유저가 주소로 직접 진입해도
 * 차단한다(UI 가시성과 서버 집행 일치). 인가 단일 출처는 백엔드 검증(getUser → find/data) +
 * user 서버 엔타이틀먼트다. slug 는 플랫폼(control-tower)이 관리: DB 가 단일 출처
 * ('admin' 은 정적 세그먼트라 이 동적 [toolSlug] 보다 우선 매칭됨. /[orgSlug]/admin 영향 없음.)
 *
 * user 는 앱바(로고/아바타/이름) 표시용으로 함께 내려준다(admin 레이아웃과 동형)
 */

/** 조직에 부여된(resolved) AI 도구: csc-groupware 응답 형태(표시명 name + 라우팅 slug) */
export const load: LayoutServerLoad = async (event) => {
  const user = await event.locals.getUser();
  if (!user?.organization?.slug || !user.organization.id) {
    throw redirect(302, '/login');
  }

  // 자기 조직에만 접근: slug 불일치면 자기 조직 경로로 교정(admin 레이아웃 가드와 동형)
  if (user.organization.slug !== event.params.orgSlug) {
    throw redirect(307, `/${user.organization.slug}/${event.params.toolSlug}`);
  }

  // slug 없는 항목은 주소로 맞출 수 없으므로 걸러낸다. 조회가 실패하면 빈 목록이 되어
  //   아래 게이트가 통과시키지 않는다(도구 미확인 → 관리자 홈으로)
  const resolved = await loadOrgAiTools(event, user.organization.id);
  const tools = resolved.filter((t) => typeof t?.slug === 'string');

  const owned = new Set<string>(user.aiTools ?? []);
  const tool = tools.find((t) => t.slug === event.params.toolSlug);
  if (!tool || !(hasRootAuthority(user) || owned.has(tool.key))) {
    throw redirect(302, `/${user.organization.slug}/admin`);
  }

  // 세 플래그의 판정 규칙은 $lib/server/marketing/toolAccess 가 소유한다. BFF 게이트
  //   (requireToolSettingsEditor / requireToolManager / requireLogViewer)가 같은 함수를 부르므로
  //   여기 가시성과 저쪽 집행이 어긋날 수 없다. 규칙을 바꿀 때는 그 파일만 고친다.
  // 클라이언트로 내리는 user 에는 position 이 없어(아래 반환값 참고) 브라우저가 이 판정을 다시 하면
  //   대표와 팀장을 놓친다. 화면은 반드시 이 서버 플래그로 판정한다.
  //
  // 지침 편집 = 루트권한자(ROOT/대표) 또는 (팀장 + 이 도구 보유). UI 비활성용 힌트이고 하드 검증은 BFF.
  //   개인 설정(AI 모델, 브랜드/컨셉)은 여기 해당하지 않는다: 누구나 자기 것을 고친다(게이트 없음)
  const canEditSettings = canEditToolSettings(user, tool.key);

  // 관리급 = 루트/대표/팀장. 운영 정보 화면(프로세스/가격표)과 조직 공용 자산(에셋/세트) 관리를 가린다.
  //   채널 관리는 여기 해당하지 않는다: 채널이 개인 소유가 되어 누구나 자기 것을 만들고 지운다.
  const isToolManager = isToolManagerSubject(user);

  // 로그 열람 = 관리급(루트/대표/팀장). 조직 전체 원장이 보인다(모든 채널, 두 버전).
  //   지금은 isToolManager 와 같은 판정이지만 플래그를 따로 두는 이유는 toolAccess 주석에 있다.
  const canViewLogs = canViewActivityLogs(user);

  // 보고 있는 버전은 여기서 정하지 않는다. 주소가 말한다(`[version]` 셸이 내린다)
  // 저장값은 진입 기본값으로만 남는다(entryChannel.ts)

  const userImages = signUserImages(user);
  return {
    tool: { key: tool.key, name: tool.name, slug: tool.slug },
    canEditSettings,
    isToolManager,
    canViewLogs,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      // 이미지 uploadId → 표시용 서명 URL(아바타 + 조직 로고)
      profileImageUrl: userImages.profileImageUrl,
      organization: userImages.organization,
    },
  };
};
