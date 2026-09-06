import { of } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import {
  CLIENT_STATUS_HEADER,
  CLIENT_VERSION_HEADER,
  ClientStatus,
  MIN_SUPPORTED_CLIENT_HEADER,
  RECOMMENDED_CLIENT_HEADER,
} from '@csc/mes-contracts';
import { ClientVersionInterceptor } from '../client-version.interceptor';

/** 헤더 캡처용 최소 ExecutionContext. Nest 전체를 띄울 필요가 없다. */
function makeContext(clientVersion?: string) {
  const headers: Record<string, string> = {};
  if (clientVersion) headers[CLIENT_VERSION_HEADER] = clientVersion;
  const sent: Record<string, string> = {};
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
      getResponse: () => ({
        setHeader: (name: string, value: string) => {
          sent[name] = value;
        },
      }),
    }),
  } as unknown as ExecutionContext;
  return { context, sent };
}

const nextHandler: CallHandler = { handle: () => of(null) };

describe('ClientVersionInterceptor', () => {
  const interceptor = new ClientVersionInterceptor();

  it('모든 응답에 정책 헤더 3종을 실어야 한다', () => {
    const { context, sent } = makeContext('9.9.9');
    interceptor.intercept(context, nextHandler);

    // 정책 조회 전용 엔드포인트를 두면 그 엔드포인트만 호출 안 하는 버그가 생긴다.
    // 그래서 모든 응답에 싣는 것이 계약이다.
    expect(sent[MIN_SUPPORTED_CLIENT_HEADER]).toBeDefined();
    expect(sent[RECOMMENDED_CLIENT_HEADER]).toBeDefined();
    expect(sent[CLIENT_STATUS_HEADER]).toBeDefined();
  });

  it('버전을 밝히지 않은 호출자는 판정 대상이 아니어야 한다', () => {
    // BFF, scalar-gateway, 컨테이너 헬스체크가 여기 해당한다.
    const { context, sent } = makeContext();
    interceptor.intercept(context, nextHandler);
    expect(sent[CLIENT_STATUS_HEADER]).toBe(ClientStatus.Ok);
  });

  it('형식이 깨진 버전은 ok 로 취급해야 한다', () => {
    // 파싱 실패로 현장 단말을 차단하지 않는다. 판정 불가는 차단 사유가 아니다.
    const { context, sent } = makeContext('not-a-version');
    interceptor.intercept(context, nextHandler);
    expect(sent[CLIENT_STATUS_HEADER]).toBe(ClientStatus.Ok);
  });

  it('최소 지원 미만이면 soft-block 을 알려야 한다', () => {
    const { context, sent } = makeContext('0.0.1');
    interceptor.intercept(context, nextHandler);
    expect(sent[CLIENT_STATUS_HEADER]).toBe(ClientStatus.SoftBlock);
  });

  it('헤더만 붙이고 요청을 차단하지는 않아야 한다', () => {
    // 실제 거부는 쓰기 경로의 가드가 판단한다. 특히 동기화 push 는 어떤 상태에서도
    // 수락되어야 하므로(구버전 PC 의 미전송 실적 유실 방지) 인터셉터가 막으면 안 된다.
    const { context } = makeContext('0.0.1');
    const handle = jest.fn(() => of('통과'));
    const result = interceptor.intercept(context, { handle } as unknown as CallHandler);
    expect(handle).toHaveBeenCalled();
    expect(result).toBeDefined();
  });
});
