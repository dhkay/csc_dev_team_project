// 마케팅 BFF 오류 번역: 사용자가 읽는 문장이 사유와 맞는지를 고정한다.
//
// 409 는 사유가 둘이다. 이름 중복과 "같은 요청이 처리 중"(중복 제출로 사가 실행권이 겹친 경우)이다.
// 한 문장으로 덮어쓰면 두 번 누른 사람에게 "이미 존재하는 이름입니다" 라고 말하게 되는데, 그건 무엇을
// 해야 하는지 알려주지 않는 데다 사실도 아니다. 상태코드만 보고 문장을 지어내지 않는 것을 못박는다.
import { describe, it, expect } from 'vitest';
import { mapMarketingError } from '../../../../src/lib/server/marketing/bff';
import { HttpError, HttpErrorType } from '../../../../src/lib/infrastructure/http/httpError';

/**
 * 서버 클라이언트가 던지는 정규화 오류
 *
 * `code` 는 본문에서 온다. 판별을 문구가 아니라 이 코드로 하는 것이 이 테스트의 요지다.
 */
function httpError(statusCode: number, message: string, code?: string) {
  return new HttpError({
    type: HttpErrorType.CLIENT,
    message,
    statusCode,
    response: { status: statusCode, data: code ? { code } : undefined },
  });
}

/** 실패 봉투. 본문은 한 번만 읽을 수 있어 한 번에 꺼낸다. */
async function envelope(res: Response) {
  return (await res.json()) as { error: string; errorCode?: string };
}

describe('mapMarketingError', () => {
  it('중복 제출(SAGA_BUSY)은 기다리라고 안내하고 코드를 실어 보낸다', async () => {
    const res = mapMarketingError(
      httpError(409, '같은 요청이 처리 중입니다. 잠시 후 다시 시도하세요.', 'SAGA_BUSY'),
      '실패',
    );

    expect(res.status).toBe(409);
    const body = await envelope(res);
    expect(body.error).toBe('같은 요청이 처리 중입니다. 잠시 후 다시 시도하세요.');
    expect(body.errorCode).toBe('SAGA_BUSY');
  });

  it('코드가 없는 409(이름 중복)는 기존 안내를 그대로 쓴다', async () => {
    // 백엔드 기본 409 본문의 error 는 'Conflict' 다. 그것을 그대로 보여주면 안 되므로 문장을 우리가 정한다.
    const res = mapMarketingError(httpError(409, 'Conflict'), '실패');

    const body = await envelope(res);
    expect(body.error).toBe('이미 존재하는 이름입니다.');
    expect(body.errorCode).toBeUndefined();
  });
});
