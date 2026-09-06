// 본인 비밀번호 변경 BFF: user 서버 POST /user-api/me/password 로 중계
// 현재 비번 검증, 역할(ADMIN 전용)은 user 서버가 강제. 406=현재 비번 불일치, 403=권한 없음
import type { RequestHandler } from '@sveltejs/kit';
import { authUserClient } from '$lib/infrastructure/http/serverClientInstances';
import { ok, fail, mapHttpError, requireAuth } from '$lib/server/http/bff';

export const POST: RequestHandler = async (event) => {
  const authErr = requireAuth(event);
  if (authErr) return authErr;
  try {
    const { currentPassword, newPassword } = await event.request.json();
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      return fail('잘못된 요청입니다.', { status: 400 });
    }
    await authUserClient(event).POST('/user-api/me/password', { currentPassword, newPassword });
    return ok();
  } catch (error) {
    return mapHttpError(error, {
      fallback: '비밀번호 변경에 실패했습니다.',
      log: 'Change password failed',
      table: {
        406: { message: '현재 비밀번호가 일치하지 않습니다.', errorCode: 'INVALID_CURRENT_PASSWORD' },
        403: { message: '비밀번호를 변경할 수 없습니다.' },
        400: { message: '입력값을 확인하세요.' }
      }
    });
  }
};
