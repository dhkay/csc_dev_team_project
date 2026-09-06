// 조직 데이터 접근 (브라우저): 타입 계약(organizationsContract) 기반 bff() 로 BFF 호출
// org BFF 는 실패 시 실제 상태코드(409/400/404…)를 반환(axios throw)하므로 봉투로 정규화한다.
// (SLUG_TAKEN 등 인라인 처리 보존)
import { bff } from '$lib/infrastructure/http/bffClient';
import type { ApiResult } from '$lib/infrastructure/http/apiResult';
import { organizationsContract } from '../organizationsContract';
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
  OrgMemberSummary,
  ReplaceRootAdminInput,
  RootAdminEmailAvailability,
  RootAdminSummary,
  UpdateRootAdminInput
} from '../types';

/** 컴포넌트 소비용 결과 봉투 */
export type OrgResult<T = unknown> = ApiResult<T>;

export function createOrganization(input: CreateOrganizationInput): Promise<OrgResult> {
  return bff(organizationsContract.create, input);
}

export function updateOrganization(id: number, patch: UpdateOrganizationInput): Promise<OrgResult> {
  return bff(organizationsContract.update, { id, ...patch });
}

export function deleteOrganization(id: number, mode: 'soft' | 'hard'): Promise<OrgResult> {
  return bff(organizationsContract.remove, { id, mode });
}

export function recoverOrganization(id: number): Promise<OrgResult> {
  return bff(organizationsContract.recover, undefined, { id });
}

export function getRootAdmin(id: number): Promise<OrgResult<RootAdminSummary>> {
  return bff(organizationsContract.getRootAdmin, undefined, { id });
}

export function updateRootAdmin(
  id: number,
  patch: UpdateRootAdminInput
): Promise<OrgResult<RootAdminSummary>> {
  return bff(organizationsContract.updateRootAdmin, patch, { id });
}

/** 이메일 중복 확인(읽기): 그 조직 안에서만 검사한다. */
export function checkRootAdminEmail(
  id: number,
  email: string
): Promise<OrgResult<RootAdminEmailAvailability>> {
  return bff(organizationsContract.checkRootAdminEmail, undefined, { id, email });
}

export function getAiTools(id: number): Promise<OrgResult<string[]>> {
  return bff(organizationsContract.getAiTools, undefined, { id });
}

export function resetRootPassword(id: number, password: string): Promise<OrgResult> {
  return bff(organizationsContract.resetRootPassword, { password }, { id });
}

/** 조직 멤버 목록(활성 ROOT+ADMIN): 루트 이양 대상 선택용 */
export function listOrgMembers(id: number): Promise<OrgResult<OrgMemberSummary[]>> {
  return bff(organizationsContract.listMembers, undefined, { id });
}

/** 루트 이양: 기존 조직원을 루트로 승격(기존 루트는 일반관리자로 강등) */
export function transferRootAdmin(
  id: number,
  userId: number
): Promise<OrgResult<RootAdminSummary>> {
  return bff(organizationsContract.transferRootAdmin, { userId }, { id });
}

/** 루트 교체: 새 계정을 만들어 루트로 지정(기존 루트는 일반관리자로 강등) */
export function replaceRootAdmin(
  id: number,
  input: ReplaceRootAdminInput
): Promise<OrgResult<RootAdminSummary>> {
  return bff(organizationsContract.replaceRootAdmin, input, { id });
}
