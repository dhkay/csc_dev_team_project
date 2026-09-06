import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import {
  AiToolError,
  AiToolNotFoundError,
  AiToolSlugAlreadyExistsError,
  InvalidAiToolSlugError,
} from '../../../../core/domain/errors';

/** AI 도구 카탈로그 도메인 에러 → HTTP 상태 변환 (inbound 어댑터 책임) */
@Catch(AiToolError)
export class AiToolExceptionFilter implements ExceptionFilter {
  catch(exception: AiToolError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(this.toStatus(exception)).json({ message: exception.message });
  }

  private toStatus(exception: AiToolError): number {
    if (exception instanceof AiToolSlugAlreadyExistsError) return HttpStatus.CONFLICT; // 409
    if (exception instanceof AiToolNotFoundError) return HttpStatus.NOT_FOUND; // 404
    if (exception instanceof InvalidAiToolSlugError) return HttpStatus.BAD_REQUEST; // 400
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}
