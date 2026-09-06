import { redirect } from '@sveltejs/kit';
import { signUserImages } from '$lib/server/upload/signUserImages';
import type { PageServerLoad } from './$types';

// 환경설정 팝아웃 로드: 상위 admin/+layout.server.ts 가드(isAdmin)가 로드 체인에서 함께 실행된다.
// 본인 계정 표시/편집에 필요한 값(역할, 이름, 닉네임, 프로필이미지)을 세션에서 도출해 전달
export const load: PageServerLoad = async ({ locals }) => {
  const user = await locals.getUser();
  if (!user) throw redirect(302, '/login');
  // 편집 폼: 아바타 원본 uploadId(제출/baseline) + 표시용 서명 URL 둘 다 내려준다.
  const img = signUserImages(user);
  return {
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      profileImageUrl: img.profileImageUrl,
      profileImageUploadId: img.profileImageUploadId,
      organization: img.organization,
    },
  };
};
