import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import {
  AdminEmailAlreadyExistsError,
  AdminError,
  AdminNotFoundError,
  CannotChangeRootAdminEmailError,
  CannotDeleteRootAdminError,
} from '../../../../core/domain/errors';

/** 플랫폼 관리자 관리 도메인 에러 → HTTP 상태 변환 (inbound 어댑터 책임) */
@Catch(AdminError)
export class AdminExceptionFilter implements ExceptionFilter {
  catch(exception: AdminError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(this.toStatus(exception)).json({ message: exception.message });
  }

  private toStatus(exception: AdminError): number {
    if (exception instanceof AdminEmailAlreadyExistsError) return HttpStatus.CONFLICT; // 409
    if (exception instanceof AdminNotFoundError) return HttpStatus.NOT_FOUND; // 404
    if (exception instanceof CannotDeleteRootAdminError) return HttpStatus.BAD_REQUEST; // 400
    if (exception instanceof CannotChangeRootAdminEmailError) return HttpStatus.BAD_REQUEST; // 400
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}
