import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import {
  CLIENT_STATUS_HEADER,
  CLIENT_VERSION_HEADER,
  ClientStatus,
  MIN_SUPPORTED_CLIENT,
  MIN_SUPPORTED_CLIENT_HEADER,
  RECOMMENDED_CLIENT,
  RECOMMENDED_CLIENT_HEADER,
} from '@csc/mes-contracts';

interface ResponseLike {
  setHeader(name: string, value: string): void;
}
interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
}

/** "1.4.2" 를 [1,4,2] 로. 형식이 깨졌으면 null(판정 불가로 취급해 ok 를 준다) */
function parseVersion(raw: string | undefined): number[] | null {
  if (!raw) return null;
  const parts = raw.trim().split('.');
  if (parts.length !== 3) return null;
  const nums = parts.map((p) => Number.parseInt(p, 10));
  return nums.every((n) => Number.isInteger(n) && n >= 0) ? nums : null;
}

/** a < b 이면 음수 */
function compareVersion(a: number[], b: number[]): number {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/**
 * 클라이언트 버전 정책 헤더를 모든 응답에 싣는다.
 *
 * 여기서는 헤더만 붙이고 차단은 하지 않는다. 실제 거부(soft-block 409, hard-block 426)는
 * 쓰기 경로의 가드가 판단한다.
 * 동기화 push 는 어떤 상태에서도 수락된다(`@csc/mes-contracts` 의 SYNC_PUSH_ALWAYS_ACCEPTED).
 * 구버전 PC 의 미전송 실적이 영구 유실되는 것을 막는 절대 불변식이다.
 *
 * 상세: docs/specs/mes-client-compatibility.md
 */
@Injectable()
export class ClientVersionInterceptor implements NestInterceptor {
  private readonly minSupported = parseVersion(MIN_SUPPORTED_CLIENT);
  private readonly recommended = parseVersion(RECOMMENDED_CLIENT);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestLike>();
    const response = http.getResponse<ResponseLike>();

    response.setHeader(MIN_SUPPORTED_CLIENT_HEADER, MIN_SUPPORTED_CLIENT);
    response.setHeader(RECOMMENDED_CLIENT_HEADER, RECOMMENDED_CLIENT);
    response.setHeader(CLIENT_STATUS_HEADER, this.resolveStatus(request));

    return next.handle();
  }

  private resolveStatus(request: RequestLike): ClientStatus {
    const raw = request.headers[CLIENT_VERSION_HEADER];
    const client = parseVersion(Array.isArray(raw) ? raw[0] : raw);
    // 버전을 안 밝힌 호출자(BFF, scalar-gateway, 헬스체크)는 판정 대상이 아니다.
    if (!client) return ClientStatus.Ok;
    if (this.minSupported && compareVersion(client, this.minSupported) < 0) {
      return ClientStatus.SoftBlock;
    }
    if (this.recommended && compareVersion(client, this.recommended) < 0) {
      return ClientStatus.Deprecated;
    }
    return ClientStatus.Ok;
  }
}
