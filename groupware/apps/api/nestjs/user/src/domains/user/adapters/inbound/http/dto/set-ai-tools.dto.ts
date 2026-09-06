import { IsArray, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ALL_AI_TOOL_KEYS } from '../../../../core/domain/types/entitlement-catalog';

/** 팀/멤버 AI도구 설정: desired key 전체 집합. 카탈로그(SSOT) key 만 허용 */
export class SetAiToolsDto {
  @ApiProperty({
    description: '부여할 AI도구 key 전체 집합: 카탈로그(SSOT) key 만 허용',
    type: String,
    isArray: true,
    enum: ALL_AI_TOOL_KEYS,
    example: ['marketing-video'],
  })
  @IsArray()
  @IsIn(ALL_AI_TOOL_KEYS, { each: true })
  aiToolKeys: string[];
}
