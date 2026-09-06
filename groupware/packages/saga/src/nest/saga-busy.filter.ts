import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { SagaBusyError } from '@csc/saga';

/**
 * 이 응답을 기계가 판별하는 코드. 상태코드(409)는 이름 중복과 공유하므로 그것만으로는 구분되지 않는다.
 * 소비자(web BFF)가 이 값으로 갈라 사용자에게 맞는 문장을 고른다.
 */
export const SAGA_BUSY_CODE = 'SAGA_BUSY';

/**
 * 사가 실행권 경쟁을 409 로 번역한다.
 *
 * 필터로 두는 이유: 이 번역을 각 서비스의 catch 에 복사하면 사가가 늘 때마다 한 곳씩 빠뜨리고,
 * 빠뜨린 자리만 500 이 된다. 같은 원인에 같은 응답을 주는 일은 한 곳에 둔다. HTTP 상태를 아는 것은
 * 인바운드 어댑터의 일이라(코어는 HTTP 를 모른다) 코어가 던진 도메인 예외를 여기서 받는다.
 *
 * 409 를 고른 이유: 실패가 아니라 지금은 대답할 수 없다 다. 사가가 끝나면 같은 요청이 그 산출물을
 * 그대로 받는다(멱등키가 같으므로). 400 이면 요청이 잘못됐다는 뜻이 되고, 500 이면 우리 잘못이라는
 * 뜻이 되는데 둘 다 사실이 아니다.
 */
@Catch(SagaBusyError)
export class SagaBusyFilter implements ExceptionFilter<SagaBusyError> {
  private readonly logger = new Logger(SagaBusyFilter.name);

  catch(exception: SagaBusyError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();
    // 드문 경로다: 남으면 "앞 실행이 왜 오래 걸렸나" 를 찾는 단서가 된다.
    this.logger.warn(`사가 실행권 대기 시간 초과: ${exception.sagaType}`);
    // 본문 모양이 중요하다. web 클라이언트는 `error` 를 사용자에게 보여줄 문장으로 읽고
    //   (`data.error || data.message` 순서), `code` 를 기계 판별에 쓴다. 문장을 message 에만 담고
    //   error 에 'SAGA_BUSY' 를 넣으면 사용자가 그 대문자 토큰을 그대로 보게 된다.
    response.status(HttpStatus.CONFLICT).json({
      statusCode: HttpStatus.CONFLICT,
      error: exception.message,
      code: SAGA_BUSY_CODE,
    });
  }
}
