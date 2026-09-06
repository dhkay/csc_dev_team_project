/**
 * axios 에러 → HttpError 정규화
 *
 * 취소가 여기서 갈리지 않으면 응답 없는 에러로 읽혀 "네트워크 연결에 실패했습니다" 가 된다. 사람이
 * 끊은 요청을 장애로 알리는 문장이고, 그 문장을 보고 서버를 의심하게 된다.
 */
import { describe, expect, it } from 'vitest';
import { AxiosError, CanceledError } from 'axios';
import {
  ApiErrorHandler,
  HttpError,
  HttpErrorType,
  isCanceledError,
} from '$lib/infrastructure/http/httpError';

describe('ApiErrorHandler.handle', () => {
  it('취소된 요청은 CANCELED 로 정규화한다(네트워크 실패가 아니다)', () => {
    const err = ApiErrorHandler.handle(new CanceledError('canceled'));
    expect(err.type).toBe(HttpErrorType.CANCELED);
    expect(err.message).toBe('요청이 취소되었습니다.');
    expect(err.message).not.toContain('네트워크');
  });

  it('응답 없는 axios 에러는 여전히 네트워크 실패다', () => {
    const err = ApiErrorHandler.handle(new AxiosError('Network Error', 'ERR_NETWORK'));
    expect(err.type).toBe(HttpErrorType.SERVER);
    expect(err.statusCode).toBe(503);
    expect(err.message).toBe('서비스에 연결할 수 없습니다');
  });

  it('이미 HttpError 면 그대로 돌려준다', () => {
    const original = new HttpError({ type: HttpErrorType.CLIENT, message: 'x', statusCode: 400 });
    expect(ApiErrorHandler.handle(original)).toBe(original);
  });
});

describe('isCanceledError', () => {
  it('정규화 전(axios 취소)과 후(CANCELED HttpError)를 모두 취소로 본다', () => {
    // 인터셉터는 정규화 전 값을, 소비처는 정규화 뒤 값을 든다. 한 판정이 둘을 다 알아야 어느 쪽에서
    //   물어도 답이 같다.
    expect(isCanceledError(new CanceledError('canceled'))).toBe(true);
    expect(isCanceledError(ApiErrorHandler.handle(new CanceledError('canceled')))).toBe(true);
  });

  it('그 외는 취소가 아니다', () => {
    expect(isCanceledError(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(false);
    expect(isCanceledError(new Error('boom'))).toBe(false);
    expect(isCanceledError(null)).toBe(false);
  });
});
