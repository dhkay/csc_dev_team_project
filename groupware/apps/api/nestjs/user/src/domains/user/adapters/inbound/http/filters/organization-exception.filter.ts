import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import {
  CannotModifyPlatformOrganizationError,
  OrganizationError,
  OrganizationNotFoundError,
  OrganizationSlugAlreadyExistsError,
  ReservedOrganizationSlugError,
  RootAdminEmailAlreadyExistsError,
  RootAdminNotFoundError,
  RootAdminTransferTargetInvalidError,
} from '../../../../core/domain/errors';

/**
 * 조직 도메인 에러 → HTTP 상태 변환 (inbound 어댑터 책임)
 *
 * 상태코드와 함께 `code` 를 싣는다. 한 상태코드에 서로 다른 충돌이 붙기 때문이다.
 * 조직 생성은 slug 중복과 루트 이메일 중복이 모두 409 라, code 가 없으면 호출부가 둘을 구분하지
 * 못해 멀쩡한 slug 입력란에 오류를 다는 안내가 나간다(메시지 문구로 가르는 방식은 문구를 고치는
 * 순간 조용히 깨진다)
 */
@Catch(OrganizationError)
export class OrganizationExceptionFilter implements ExceptionFilter {
  catch(exception: OrganizationError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, code } = this.toHttp(exception);
    response.status(status).json({ message: exception.message, code });
  }

  private toHttp(exception: OrganizationError): { status: number; code: string } {
    if (exception instanceof OrganizationSlugAlreadyExistsError) {
      return { status: HttpStatus.CONFLICT, code: 'ORG_SLUG_TAKEN' };
    }
    if (exception instanceof RootAdminEmailAlreadyExistsError) {
      return { status: HttpStatus.CONFLICT, code: 'ROOT_EMAIL_TAKEN' };
    }
    // 예약어는 중복이 아니라 쓸 수 없는 값이라 400 이다(409 로 주면 다른 이름을 고르면
    //   되는 충돌처럼 읽힌다)
    if (exception instanceof ReservedOrganizationSlugError) {
      return { status: HttpStatus.BAD_REQUEST, code: 'ORG_SLUG_RESERVED' };
    }
    if (exception instanceof OrganizationNotFoundError) {
      return { status: HttpStatus.NOT_FOUND, code: 'ORG_NOT_FOUND' };
    }
    if (exception instanceof RootAdminNotFoundError) {
      return { status: HttpStatus.NOT_FOUND, code: 'ROOT_ADMIN_NOT_FOUND' };
    }
    if (exception instanceof CannotModifyPlatformOrganizationError) {
      return { status: HttpStatus.BAD_REQUEST, code: 'PLATFORM_ORG_FORBIDDEN' };
    }
    if (exception instanceof RootAdminTransferTargetInvalidError) {
      return { status: HttpStatus.BAD_REQUEST, code: 'ROOT_TRANSFER_TARGET_INVALID' };
    }
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, code: 'ORG_UNEXPECTED' };
  }
}
