import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

/** 새 Profile의 역할 도메인 한 행. */
export class CreateProfileRoleDto {
	@IsString()
	@IsNotEmpty()
	domainCode: string;

	@IsString()
	@IsNotEmpty()
	nameKo: string;

	@IsOptional()
	@IsString()
	nameEn?: string;

	@IsIn(['DIRECT', 'INTEGRATED'])
	domainType: 'DIRECT' | 'INTEGRATED';
}

/** POST /rbfr-api/profiles 본문. 02_화면구성.md "설정(Profile 관리)" 2번 항목. */
export class CreateProfileDto {
	@IsString()
	@IsNotEmpty()
	profileCode: string;

	@IsString()
	@IsNotEmpty()
	nameKo: string;

	@IsOptional()
	@IsString()
	nameEn?: string;

	@IsIn(['PRIMARY', 'CROSS'])
	profileType: 'PRIMARY' | 'CROSS';

	@IsOptional()
	@IsString()
	description?: string;

	@IsArray()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => CreateProfileRoleDto)
	roles: CreateProfileRoleDto[];
}
