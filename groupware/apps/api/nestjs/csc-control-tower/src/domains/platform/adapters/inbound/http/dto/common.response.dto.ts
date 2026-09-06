import { ApiProperty } from '@nestjs/swagger';

/** 처리 성공만 알리는 응답(반환할 자원이 없는 삭제/설정 계열) */
export class SuccessResponseDto {
  @ApiProperty({ description: '요청이 처리되었는지 여부', example: true })
  success: boolean;
}

/** 이메일 사용 가능 여부(저장 전 사전 확인) */
export class EmailAvailabilityResponseDto {
  @ApiProperty({
    description: '해당 이메일을 쓸 수 있으면 true. 이미 쓰는 계정이 있으면 false',
    example: true,
  })
  available: boolean;
}
