import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import {
  DepartmentError,
  DepartmentForbiddenError,
  DepartmentNotFoundError,
  InvalidDepartmentMoveError,
} from '../../../../core/domain/errors';

/** 부서 관리 도메인 에러 → HTTP 상태 변환 (inbound 어댑터 책임) */
@Catch(DepartmentError)
export class DepartmentExceptionFilter implements ExceptionFilter {
  catch(exception: DepartmentError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, errorCode } = this.classify(exception);
    response.status(status).json({ message: exception.message, errorCode });
  }

  private classify(exception: DepartmentError): { status: number; errorCode: string } {
    if (exception instanceof DepartmentNotFoundError) {
      return { status: HttpStatus.NOT_FOUND, errorCode: 'NOT_FOUND' };
    }
    if (exception instanceof DepartmentForbiddenError) {
      return { status: HttpStatus.FORBIDDEN, errorCode: 'FORBIDDEN' };
    }
    if (exception instanceof InvalidDepartmentMoveError) {
      return { status: HttpStatus.BAD_REQUEST, errorCode: 'INVALID_MOVE' };
    }
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, errorCode: 'INTERNAL' };
  }
}
