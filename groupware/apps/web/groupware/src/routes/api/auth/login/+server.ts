// src/routes/api/auth/login/+server.ts
import { json } from '@sveltejs/kit'
import type { RequestEvent } from '@sveltejs/kit'
import {
  serverUserClient as userClient,
  tokenUserClient,
} from '$lib/infrastructure/http/serverClientInstances';
import { isHttpError } from '$lib/infrastructure/http';
import {
  AUTH_COOKIE_CONFIG,
  AUTO_LOGIN_COOKIE_CONFIG,
  authCookieOptions,
} from '$lib/app/config/cookies'
import { getTokenEntitlements } from '$lib/shared/lib/utils/authTokenUtils';
import { resolveGroupwareDefaultDestination } from '$lib/server/navigation/defaultDestination';
import type { CurrentUser, LoginResponse } from '$lib/shared/types/common.types'

/**
 * 백엔드 원문 메시지를 로그인 화면에 그대로 쓸 수 있는지 판단한다.
 *
 * user 서버의 도메인 에러(auth.errors.ts)는 한국어 문장이라 그대로 보여도 되지만,
 * 전역 ValidationPipe(class-validator)나 Nest 기본 예외는 영어다.
 * (예: ["email must be an email"], "Bad Request"). 이걸 그대로 흘리면 로그인 폼의
 * alert 자리에 영어가 뜬다. 한글이 없는 메시지(영문 문자열, 배열)는 버리고,
 * 호출부의 기본 문구인 '사용자 정보가 일치하지 않습니다' 로 떨어뜨린다.
 *
 * 이메일 형식 위반도 같은 문구로 합친다. 실패 사유를 세분해 알려줄수록 어떤 아이디가
 * 존재하는지 추측할 단서가 늘기 때문에, 자격 관련 실패는 한 문구로 통일한다.
 */
function toDisplayableMessage(message: unknown): string | null {
  return typeof message === 'string' && /[가-힣]/.test(message) ? message : null;
}

export async function POST({ request, cookies }: RequestEvent) {
  try {
    // autoLogin: 체크하면 지속 쿠키(브라우저를 닫아도 유지), 해제하면 세션 쿠키로 심는다.
    const { email, password, autoLogin = false } = await request.json()

    // 백엔드 API 호출
    const backclient = userClient();
    const response = await backclient.POST<LoginResponse>(
      '/user-api/login/email',
      { email, password }
    )

    const userData = response.data

    const currentUserResponse = await tokenUserClient(userData.token).GET<CurrentUser>('/user-api/find/data');
    const currentUser = {
      ...currentUserResponse.data,
      ...getTokenEntitlements(userData.token),
    };
    const defaultPath = resolveGroupwareDefaultDestination(currentUser);

    // 로그인 후속 조회까지 성공한 뒤 HTTP-only 쿠키를 저장한다.
    cookies.set(
      AUTH_COOKIE_CONFIG.ACCESS_TOKEN.name,
      userData.token,
      authCookieOptions(AUTH_COOKIE_CONFIG.ACCESS_TOKEN, autoLogin)
    )

    cookies.set(
      AUTH_COOKIE_CONFIG.REFRESH_TOKEN.name,
      userData.refreshToken,
      authCookieOptions(AUTH_COOKIE_CONFIG.REFRESH_TOKEN, autoLogin)
    )

    // 갱신 때 같은 모드로 다시 심기 위한 선택값. 해제로 로그인하면 이전 선택을 지운다.
    if (autoLogin) {
      cookies.set(AUTO_LOGIN_COOKIE_CONFIG.name, '1', AUTO_LOGIN_COOKIE_CONFIG.options)
    } else {
      cookies.delete(AUTO_LOGIN_COOKIE_CONFIG.name, AUTO_LOGIN_COOKIE_CONFIG.options)
    }

    // 클라이언트에는 사용자 정보만 전달 (토큰 제외)
    return json({
      success: true,
      data: {
        name: currentUser.name,
        role: currentUser.role ?? userData.role,
        organization: currentUser.organization,
        defaultPath,
      }
    })

  } catch (error) {
    // 주의: axios 에러 객체에는 error.config.data(= email/password 평문)가 들어 있다.
    // 객체 전체를 로깅하면 비밀번호가 서버 로그에 적재되므로 상태코드/메시지만 남긴다.
    if (isHttpError(error)) {
      console.error('Login error (status):', error.statusCode)
    } else {
      console.error('Login error:', error instanceof Error ? error.message : 'unknown error')
    }

    // HttpError 처리 - 백엔드에서 반환한 에러 상태 코드에 따라 분기
    if (isHttpError(error)) {
      // 406: 비밀번호 또는 이메일이 틀린 경우
      if (error.statusCode === 406) {
        return json({
          success: false,
          errorCode: 'INVALID_CREDENTIALS',
          error: '사용자 정보가 일치하지 않습니다'
        }, { status: 200 }) // 클라이언트에는 200으로 반환
      }
      
      // 404: 사용자를 찾을 수 없는 경우
      if (error.statusCode === 404) {
        return json({
          success: false,
          errorCode: 'INVALID_CREDENTIALS',
          error: '사용자 정보가 일치하지 않습니다'
        }, { status: 200 })
      }
      
      // 423: 계정 잠김
      if (error.statusCode === 423) {
        return json({
          success: false,
          errorCode: 'ACCOUNT_LOCKED',
          error: '계정이 잠겼습니다. 관리자에게 문의하세요'
        }, { status: 200 })
      }

      // 429: 로그인 시도 횟수 초과 (5분 잠금)
      if (error.statusCode === 429) {
        const responseData = error.response?.data as Record<string, any> | undefined;
        return json({
          success: false,
          errorCode: 'LOGIN_RATE_LIMITED',
          error: '로그인 시도 횟수를 초과하였습니다.',
          remainingSeconds: responseData?.details?.remainingSeconds || 300,
        }, { status: 200 })
      }

      // 400: 비밀번호 틀림 + 남은 시도 횟수 경고 / 기타 400 에러
      if (error.statusCode === 400) {
        const responseData = error.response?.data as Record<string, any> | undefined;
        if (responseData?.code === 'LOGIN_ATTEMPTS_WARNING') {
          return json({
            success: false,
            errorCode: 'LOGIN_ATTEMPTS_WARNING',
            error: '비밀번호가 틀렸습니다.',
            remainingAttempts: responseData?.details?.remainingAttempts || 0,
          }, { status: 200 })
        }
        // 기타 400 에러 (정지 계정, 입력 형식 위반 등)
        return json({
          success: false,
          errorCode: 'INVALID_CREDENTIALS',
          error: toDisplayableMessage(responseData?.message) ?? '사용자 정보가 일치하지 않습니다'
        }, { status: 200 })
      }
    }
    
    // 기타 네트워크 에러 또는 알 수 없는 에러
    return json({
      success: false,
      errorCode: 'NETWORK_ERROR',
      error: '로그인에 실패했습니다'
    }, { status: 200 })
  }
}
