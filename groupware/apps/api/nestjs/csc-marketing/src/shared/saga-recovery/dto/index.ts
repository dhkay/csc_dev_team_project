import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { SAGA_RECOVERY_BATCH_LIMIT, SAGA_STALE_AFTER_MS } from '@csc/saga';

/**
 * 복구 요청. 둘 다 선택이고, 비우면 자동 실행과 같은 값을 쓴다.
 *
 * 값을 열어 두는 이유는 조사다. 사고를 재현할 때 유예를 짧게 줘 방금 멈춘 것까지 집어 보고, 상한을
 * 낮춰 한 건씩 확인한다. 상한(아래 Max)은 그래도 남긴다: 유예 0 으로 진행 중인 작업까지 가로채면
 * 복구가 사고를 만든다.
 */
export class RecoverSagasDto {
  @ApiPropertyOptional({
    description:
      '멈춘 지 이 시간(밀리초)이 지난 작업만 대상으로 한다. 비우면 5분. 값을 줄이면 방금 멈춘 것까지 ' +
      '집으므로, 진행 중인 작업을 가로채지 않도록 최소 1000 이상만 허용한다.',
    minimum: 1000,
    maximum: 86_400_000,
    default: SAGA_STALE_AFTER_MS,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(86_400_000)
  staleAfterMs?: number;

  @ApiPropertyOptional({
    description: '한 번에 처리할 최대 개수. 비우면 20.',
    minimum: 1,
    maximum: 200,
    default: SAGA_RECOVERY_BATCH_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

/** 복구 결과 */
export class SagaRecoveryResponseDto {
  @ApiProperty({
    description: '이어 가서 끝낸 개수. 이어 갈 수 없어 되돌린 것도 여기 포함된다(끝난 것은 끝난 것이다).',
  })
  recovered: number;

  @ApiProperty({
    description: '이어 가려다 다시 실패한 개수. 자동 실행이 다음 주기에 재시도한다.',
  })
  failed: number;

  @ApiProperty({
    description:
      '처리 방법을 모르는 작업의 개수. 그 종류가 배포로 사라진 경우이며, 되돌리지 못한 흔적을 잃지 ' +
      '않도록 지우지 않고 남긴다.',
  })
  skipped: number;
}
