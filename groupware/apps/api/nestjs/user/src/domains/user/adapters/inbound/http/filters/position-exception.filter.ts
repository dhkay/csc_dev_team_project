import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import {
  PositionError,
  PositionForbiddenError,
  PositionInvalidError,
  PositionTargetNotFoundError,
  TeamLeaderAlreadyExistsError,
} from '../../../../core/domain/errors';

/**
 * 직책 관리 도메인 에러 → HTTP 상태 변환 (inbound 어댑터 책임)
 * 부서당 팀장 1명 위반은 409 로, errorCode 를 함께 실어 BFF/프런트가 구분해 안내한다.
 */
@Catch(PositionError)
export class PositionExceptionFilter implements ExceptionFilter {
  catch(exception: PositionError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, errorCode } = this.classify(exception);
    response.status(status).json({ message: exception.message, errorCode });
  }

  private classify(exception: PositionError): { status: number; errorCode: string } {
    if (exception instanceof PositionTargetNotFoundError) {
      return { status: HttpStatus.NOT_FOUND, errorCode: 'NOT_FOUND' }; // 404
    }
    if (exception instanceof PositionForbiddenError) {
      return { status: HttpStatus.FORBIDDEN, errorCode: 'FORBIDDEN' }; // 403
    }
    if (exception instanceof TeamLeaderAlreadyExistsError) {
      return { status: HttpStatus.CONFLICT, errorCode: 'TEAM_LEADER_EXISTS' }; // 409
    }
    if (exception instanceof PositionInvalidError) {
      return { status: HttpStatus.BAD_REQUEST, errorCode: 'INVALID_POSITION' }; // 400
    }
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, errorCode: 'INTERNAL' };
  }
}
