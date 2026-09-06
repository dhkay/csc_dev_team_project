import { IsArray, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ALL_PERMISSION_KEYS } from '../../../../core/domain/types/entitlement-catalog';

/** 부서/멤버 권한 설정: desired key 전체 집합(제공한 그대로 동기화). 카탈로그(SSOT) key 만 허용 */
export class SetPermissionsDto {
  @ApiProperty({
    description: '부여할 권한 key 전체 집합(그대로 동기화): 카탈로그(SSOT) key 만 허용',
    type: String,
    isArray: true,
    enum: ALL_PERMISSION_KEYS,
    example: ['user-management', 'roles'],
  })
  @IsArray()
  @IsIn(ALL_PERMISSION_KEYS, { each: true })
  permissionKeys: string[];
}
