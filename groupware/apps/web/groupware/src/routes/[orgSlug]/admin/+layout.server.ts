import { redirect } from '@sveltejs/kit';
import { isAdmin } from '$lib/shared/lib/auth/access';
import { signUserImages } from '$lib/server/upload/signUserImages';
import type { LayoutServerLoad } from './$types';

/**
 * /[orgSlug]/admin 가드: role ROOT/ADMIN + 조직 slug 일치 검증(멀티테넌시)
 *
 * 보안: 쿠키 토큰 클레임을 신뢰하지 않고 백엔드 검증(getUser → /user-api/find/data)으로
 * role/organization 을 판정한다. 사용자는 자기 조직에만 접근 가능(단일 조직/user)
 * URL slug 가 자기 조직과 다르면 자기 조직 admin 으로 교정한다.
 */
export const load: LayoutServerLoad = async ({ locals, params }) => {
  const user = await locals.getUser();
  if (!isAdmin(user) || !user?.organization?.slug) {
    throw redirect(302, '/login');
  }

  if (user.organization.slug !== params.orgSlug) {
    throw redirect(307, `/${user.organization.slug}/admin`);
  }

  // 이미지 uploadId → 표시용 서명 URL(아바타 + 조직 로고). 저장은 uploadId, 표시는 렌더 시 서명
  const img = signUserImages(user);
  return {
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      profileImageUrl: img.profileImageUrl,
      lastLoginAt: user.lastLoginAt ?? null,
      organization: img.organization,
      // 유효 엔타이틀먼트(토큰 도출): 타일/보조앱바 게이팅에 사용
      aiTools: user.aiTools ?? [],
      permissions: user.permissions ?? [],
      // 직책(대표/팀장, 토큰 도출): hasRootAuthority(대표) 및 조직관리 UI 표시
      position: user.position ?? null,
    },
  };
};
