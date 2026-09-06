import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SagaRecoveryService } from '@csc/saga';
import { RecoverSagasDto, SagaRecoveryResponseDto } from './dto';

/**
 * 중단된 다단계 작업 이어가기(운영 수단)
 *
 * 스케줄러가 이미 1분마다 같은 복구를 돌기 때문에 서비스 화면은 이 경로를 호출하지 않는다. 배포
 * 직후처럼 다음 주기를 기다리지 않고 확인해야 할 때 사용한다.
 *
 * 주기 실행은 복구에 더해 오래된 기록 정리도 하지만, 이 경로는 복구만 한다: 운영자가 급히 부르는
 * 이유는 멈춘 작업이고, 정리까지 얹으면 조사 중인 기록이 그 호출로 사라질 수 있다.
 */
@ApiTags('[마케팅] 사가 복구(운영) API')
@Controller('internal/sagas')
export class SagaRecoveryController {
  constructor(private readonly recovery: SagaRecoveryService) {}

  @Post('recover')
  @ApiOperation({
    summary: '[SAGA-001] 중단된 다단계 작업 이어가기',
    description:
      '서버가 중간에 멈춰 끝나지 않은 작업(기획안 저장, 영상 만들기, 다시 만들기, 프레임 적용)을 ' +
      '멈춘 지점부터 이어서 끝낸다. ' +
      '이어 갈 수 없는 작업은 만들어 둔 것을 되돌려 흔적을 남기지 않는다. ' +
      '멈춘 지 일정 시간(기본 5분)이 지난 것만 대상이라 지금 진행 중인 작업은 건드리지 않는다. ' +
      '같은 일을 하는 작업이 1분마다 자동으로 돌며, 이 경로는 즉시 확인해야 하는 운영 상황에서 사용한다. ' +
      '여러 번 요청해도 안전하다. 한 번에 처리하는 수에 상한이 있어, 응답의 recovered 가 상한과 같으면 ' +
      '남은 것이 더 있을 수 있다.',
  })
  @ApiResponse({ status: 201, type: SagaRecoveryResponseDto })
  @ApiResponse({
    status: 400,
    description: 'stale_after_ms 또는 limit 이 허용 범위를 벗어났다.',
  })
  async recover(@Body() dto: RecoverSagasDto): Promise<SagaRecoveryResponseDto> {
    return this.recovery.recoverStale(dto.staleAfterMs, dto.limit);
  }
}
