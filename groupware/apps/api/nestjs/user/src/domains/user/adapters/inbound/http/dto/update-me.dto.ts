import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 본인 프로필 수정 요청(self-service): 제공된 필드만. 역할 게이팅은 서비스가 강제
 * 이름은 유일한 이름 필드다. 바꾸면 로그/멤버목록/플랫폼 표기가 함께 따라간다.
 */
export class UpdateMeDto {
  // 이름(다른 사용자에게 보이는 이름). 공백만 입력은 거부한다(NOT NULL 컬럼)
  @ApiPropertyOptional({
    description: '이름(다른 사용자에게 보이는 이름): 공백만 입력은 거부',
    example: '홍길동',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: '이름을 입력해 주세요.' })
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description: '프로필 이미지 접근 URL: 빈 문자열은 null 로 저장',
    example: 'https://cdn.csc.kr/files/profile123',
    maxLength: 2048,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  profileImageUrl?: string | null;
}
