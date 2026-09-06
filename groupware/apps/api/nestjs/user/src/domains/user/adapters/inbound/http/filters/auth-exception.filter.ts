import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  AccountError,
  AccountInactiveError,
  AccountLockedError,
  InvalidCredentialsError,
  ProfileUpdateForbiddenError,
  TokenInvalidError,
  UserNotFoundError,
} from '../../../../core/domain/errors/auth.errors';

/**
 * 도메인 에러 → HTTP 상태 변환 (inbound 어댑터 책임)
 * 상태코드는 BFF(routes/api/auth/login/+server.ts)의 분기와 정합:
 *  - 406: 자격 불일치, 423: 계정 잠김, 400: 사용 불가 상태, 401: 토큰 무효
 */
@Catch(AccountError)
export class AuthExceptionFilter implements ExceptionFilter {
  catch(exception: AccountError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = this.toStatus(exception);
    response.status(status).json({ message: exception.message });
  }

  private toStatus(exception: AccountError): number {
    if (exception instanceof InvalidCredentialsError) return HttpStatus.NOT_ACCEPTABLE; // 406
    if (exception instanceof AccountLockedError) return HttpStatus.LOCKED; // 423
    if (exception instanceof AccountInactiveError) return HttpStatus.BAD_REQUEST; // 400
    if (exception instanceof TokenInvalidError) return HttpStatus.UNAUTHORIZED; // 401
    if (exception instanceof UserNotFoundError) return HttpStatus.NOT_FOUND; // 404
    if (exception instanceof ProfileUpdateForbiddenError) return HttpStatus.FORBIDDEN; // 403
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}
