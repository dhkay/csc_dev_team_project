import { IsIn, IsInt, IsNotEmpty, IsObject, IsString } from 'class-validator';
import { API_PROVIDER_KEYS } from '../../../../core/domain';

/** 자격증명 등록/교체: credentials 는 { field: value } 맵(값 검증은 서비스/검증기가 담당) */
export class SaveApiCredentialDto {
  @IsInt()
  organizationId: number;

  // 카탈로그에 있는 provider 만 받는다. 서비스도 같은 판정을 하지만, 오타를 요청 경계에서
  // 걸러야 검증기/암호화까지 헛돌지 않는다.
  @IsIn(API_PROVIDER_KEYS as unknown as string[])
  provider: string;

  @IsObject()
  credentials: Record<string, string>;
}

/**
 * 자격증명 삭제(등록 해제)
 *
 * provider 를 카탈로그로 좁히지 않는다. 카탈로그에서 내린 프로바이더의 잔여 행을 지울 길이
 * 막히면 그 조직의 키가 영원히 남는다.
 */
export class DeleteApiCredentialDto {
  @IsInt()
  organizationId: number;

  @IsString()
  @IsNotEmpty()
  provider: string;
}
