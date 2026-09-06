import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { serverUserClient } from '$lib/infrastructure/http/serverClientInstances';
import { isHttpError } from '$lib/infrastructure/http';
import { AUTH_COOKIE_CONFIG } from '$lib/app/config/cookies';
import { getTokenPayload } from '$lib/shared/lib/utils/authTokenUtils';
import { isPlatformAdmin } from '$lib/shared/lib/auth/platform';
import type { LoginResponse } from '$lib/shared/types/common.types';

/**
 * 플랫폼 로그인 BFF: user 서버 이메일 로그인 후 PLATFORM 관리자만 세션을 발급한다.
 * (플랫폼 비관리자는 토큰 클레임 검사에서 거부되어 쿠키를 받지 못한다.)
 */
export async function POST({ request, cookies }: RequestEvent) {
  try {
    const { email, password } = await request.json();

    // 플랫폼 전용 로그인: platform_admins 테이블 조회(테넌트 users 와 분리). 멀티테넌시: multi-tenancy.md
    const response = await serverUserClient().POST<LoginResponse>(
      '/user-api/login/platform/email',
      { email, password },
    );
    const userData = response.data;

    // PLATFORM 게이트(방어적 이중 확인): 액세스 토큰 클레임(organizationType/role) 검사
    const payload = getTokenPayload(userData.token);
    if (!isPlatformAdmin(payload)) {
      return json({
        success: false,
        errorCode: 'NOT_PLATFORM_ADMIN',
        error: '플랫폼 관리자만 접근할 수 있습니다.',
      });
    }

    cookies.set(
      AUTH_COOKIE_CONFIG.ACCESS_TOKEN.name,
      userData.token,
      AUTH_COOKIE_CONFIG.ACCESS_TOKEN.options,
    );
    cookies.set(
      AUTH_COOKIE_CONFIG.REFRESH_TOKEN.name,
      userData.refreshToken,
      AUTH_COOKIE_CONFIG.REFRESH_TOKEN.options,
    );

    return json({
      success: true,
      data: { name: userData.name, role: userData.role },
    });
  } catch (error) {
    // 주의: 비밀번호 평문 로깅 방지: 상태/메시지만 남긴다.
    if (isHttpError(error)) {
      console.error('Login error (status):', error.statusCode);
      // 406/404: 자격 불일치, 423: 계정 잠김, 400: 사용 불가 상태
      if (error.statusCode === 406 || error.statusCode === 404 || error.statusCode === 400) {
        return json({
          success: false,
          errorCode: 'INVALID_CREDENTIALS',
          error: '사용자 정보가 일치하지 않습니다',
        });
      }
      if (error.statusCode === 423) {
        return json({
          success: false,
          errorCode: 'ACCOUNT_LOCKED',
          error: '비밀번호를 여러 번 잘못 입력하여 계정이 잠겼습니다. 루트 관리자에게 문의하세요.',
        });
      }
    } else {
      console.error('Login error:', error instanceof Error ? error.message : 'unknown error');
    }

    return json({ success: false, errorCode: 'NETWORK_ERROR', error: '로그인에 실패했습니다' });
  }
}
