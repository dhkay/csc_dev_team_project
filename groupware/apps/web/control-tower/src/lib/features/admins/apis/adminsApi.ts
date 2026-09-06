// 플랫폼 관리자 데이터 접근(브라우저): 타입 계약(adminsContract) 기반 bff() 로 BFF 호출
// 쓰기(생성/삭제/옵션설정)만 브라우저에서 수행한다. 목록/카탈로그/단건 옵션 조회는 SSR(server load)에서
// authControlClient 로 직접 가져온다(조직 관리와 동일 레인 분리)
import { bff } from '$lib/infrastructure/http/bffClient';
import type { ApiResult } from '$lib/infrastructure/http/apiResult';
import { adminsContract } from '../adminsContract';
import type {
  AdminEmailAvailability,
  AdminSummary,
  CreateAdminInput,
  UpdateAdminInput
} from '../types';

/** 컴포넌트 소비용 결과 봉투(조직 OrgResult 와 동형) */
export type AdminResult<T = unknown> = ApiResult<T>;

export function createAdmin(input: CreateAdminInput): Promise<AdminResult<AdminSummary>> {
  return bff(adminsContract.create, input);
}

export function deleteAdmin(id: number): Promise<AdminResult> {
  return bff(adminsContract.remove, { id });
}

export function setAdminFeatures(id: number, features: string[]): Promise<AdminResult> {
  return bff(adminsContract.setFeatures, { id, features });
}

export function updateAdmin(id: number, patch: UpdateAdminInput): Promise<AdminResult> {
  return bff(adminsContract.update, { id, ...patch });
}

/** 이메일 중복 확인(읽기): excludeId 는 수정 대상 자신을 검사에서 제외한다. */
export function checkAdminEmail(
  email: string,
  excludeId?: number
): Promise<AdminResult<AdminEmailAvailability>> {
  return bff(adminsContract.checkEmail, undefined, { email, excludeId });
}
