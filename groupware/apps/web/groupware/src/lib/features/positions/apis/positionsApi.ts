// 직책(대표/팀장) 데이터 접근(브라우저): 타입 계약(positionsContract) 기반 bff() 로 BFF 호출
// 쓰기(멤버 직책 설정)만 여기서. 현황은 SSR members 목록(position 필드)에서 도출
import { bff } from '$lib/infrastructure/http/bffClient';
import { positionsContract } from '../positionsContract';
import type { OrgPosition } from '../types';

export type PositionResult =
  | { success: true }
  | { success: false; errorCode?: string; error?: string };

/** 멤버 직책 설정(대표/팀장/해제). null = 직책 해제 */
export function setMemberPosition(
  memberId: number,
  position: OrgPosition | null,
): Promise<PositionResult> {
  return bff(positionsContract.set, { id: memberId, position });
}
