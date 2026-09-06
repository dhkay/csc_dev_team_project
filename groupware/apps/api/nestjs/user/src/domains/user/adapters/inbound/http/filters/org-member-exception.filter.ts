import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import {
  OrgMemberEmailAlreadyExistsError,
  OrgMemberError,
  OrgMemberForbiddenError,
  OrgMemberNotFoundError,
} from '../../../../core/domain/errors';

/**
 * 조직유저 관리 도메인 에러 → HTTP 상태 변환 (inbound 어댑터 책임)
 * 같은 409 가 여럿일 수 있어 BFF 가 구분할 수 있게 errorCode 를 함께 싣는다.
 */
@Catch(OrgMemberError)
export class OrgMemberExceptionFilter implements ExceptionFilter {
  catch(exception: OrgMemberError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, errorCode } = this.classify(exception);
    response.status(status).json({ message: exception.message, errorCode });
  }

  private classify(exception: OrgMemberError): { status: number; errorCode: string } {
    if (exception instanceof OrgMemberEmailAlreadyExistsError) {
      return { status: HttpStatus.CONFLICT, errorCode: 'DUPLICATE_EMAIL' }; // 409
    }
    if (exception instanceof OrgMemberNotFoundError) {
      return { status: HttpStatus.NOT_FOUND, errorCode: 'NOT_FOUND' }; // 404
    }
    if (exception instanceof OrgMemberForbiddenError) {
      return { status: HttpStatus.FORBIDDEN, errorCode: 'FORBIDDEN' }; // 403
    }
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, errorCode: 'INTERNAL' };
  }
}
