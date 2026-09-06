/**
 * 응답 에러 인터셉터
 *
 * 취소는 오류가 아니다. 생성 취소마다 콘솔에 "[ErrorInterceptor] 원본 Axios 에러" 가 쌓이면 실제
 * 실패가 그 사이에 묻힌다. 그리고 취소에 401 처리가 걸리면 안 된다(로그아웃으로 튄다).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, CanceledError, type InternalAxiosRequestConfig } from 'axios';
import { responseErrorInterceptor } from '$lib/infrastructure/http/interceptors/errorInterceptor';
import { HttpErrorType, isHttpError } from '$lib/infrastructure/http/httpError';

const CONFIG = { url: '/api/x', method: 'post' } as InternalAxiosRequestConfig;

describe('responseErrorInterceptor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('취소는 로그 없이 CANCELED HttpError 로 거절한다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const rejected = responseErrorInterceptor(new CanceledError('canceled', 'ERR_CANCELED', CONFIG));

    await expect(rejected).rejects.toSatisfy(
      (e: unknown) => isHttpError(e) && e.type === HttpErrorType.CANCELED,
    );
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('서버 에러는 정규화된 HttpError 로 거절한다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const axiosError = new AxiosError('Request failed', 'ERR_BAD_RESPONSE', CONFIG, undefined, {
      status: 500,
      statusText: 'Internal Server Error',
      headers: {},
      config: CONFIG,
      data: { error: '서버가 아픕니다' },
    });

    await expect(responseErrorInterceptor(axiosError)).rejects.toSatisfy(
      (e: unknown) =>
        isHttpError(e) &&
        e.type === HttpErrorType.SERVER &&
        e.statusCode === 500 &&
        e.message === '서버가 아픕니다',
    );
  });
});
