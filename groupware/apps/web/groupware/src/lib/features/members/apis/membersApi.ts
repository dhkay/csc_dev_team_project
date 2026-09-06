// 조직 사용자관리 데이터 접근(브라우저): 타입 계약(membersContract) 기반 bff() 로 BFF 호출
// 쓰기(생성/수정/삭제)만 브라우저에서 수행한다. 목록 조회는 SSR(+page.server.ts)에서 authUserClient 로
import { bff } from '$lib/infrastructure/http/bffClient';
import type { ApiResult } from '$lib/infrastructure/http/apiResult';
import { membersContract } from '../membersContract';
import type { CreateMemberInput, MemberSummary, UpdateMemberInput } from '../types';

/** 컴포넌트 소비용 결과 봉투 */
export type MemberResult<T = unknown> = ApiResult<T>;

export function createMember(input: CreateMemberInput): Promise<MemberResult<MemberSummary>> {
  return bff(membersContract.create, input);
}

export function updateMember(id: number, patch: UpdateMemberInput): Promise<MemberResult> {
  return bff(membersContract.update, { id, ...patch });
}

export function deleteMember(id: number): Promise<MemberResult> {
  return bff(membersContract.remove, { id });
}

/** 영구 삭제(단계적 삭제 2단계): 이미 삭제(탈퇴)된 관리자만. 이메일 슬롯 회수 */
export function purgeMember(id: number): Promise<MemberResult> {
  return bff(membersContract.purge, { id });
}
