// 권한 판정(순수): 화면이 무엇을 보여 주고 무엇을 잠글지 정하는 유일한 출처
//
// 컴포넌트는 `{allowed, reason}` 만 받는다. 역할 조건을 `{#if}` 로 흩뿌리지 않는 이유는,
// 규칙이 바뀔 때 고쳐야 할 자리가 늘어나고 그중 하나를 빠뜨리면 화면과 서버가 어긋나기 때문이다.
// 서버(file-upload)가 최종 집행자이고 여기는 그와 같은 규칙의 사본이다.

import type { StorageActor, StorageFile, StorageScope } from '../types';

export interface Verdict {
  allowed: boolean;
  // 잠근 이유. 화면은 이 문장을 툴팁으로 그대로 보여 준다.
  reason?: string;
}

const ALLOW: Verdict = { allowed: true };

/** 이 영역에 들어갈 수 있는가. 조직 영역은 부서까지 봐야 한다. */
export function canAccessScope(actor: StorageActor, scope: StorageScope): boolean {
  if (scope.area !== 'DEPARTMENT') return true;
  if (scope.departmentId === null) return false;
  return actor.canManage || actor.accessibleDepartmentIds.includes(scope.departmentId);
}

/**
 * 이 영역에 올릴 수 있는가
 *
 * 공통은 조직 전원이 함께 쓰는 공간이라 누구나 올린다. 조직(부서)은 그 부서에 접근할 수
 * 있으면 올린다. 개인은 언제나 자기 것이다.
 */
export function canUpload(actor: StorageActor, scope: StorageScope): Verdict {
  if (scope.area === 'DEPARTMENT') {
    if (scope.departmentId === null) {
      return { allowed: false, reason: '부서를 선택해 주세요.' };
    }
    if (!canAccessScope(actor, scope)) {
      return { allowed: false, reason: '이 부서에 올릴 수 없습니다.' };
    }
  }
  return ALLOW;
}

/**
 * 남의 파일에 손댈 수 있는가(이름 변경, 휴지통)
 *
 * 전원이 올리는 공간이라 아무나 남의 파일을 지울 수 있으면 사고가 된다.
 * 올린 사람 본인, 그 부서의 팀장, 조직 관리 권한자만 손댄다.
 */
export function canModifyFile(
  actor: StorageActor,
  scope: StorageScope,
  file: StorageFile
): Verdict {
  if (file.ownerUserId === actor.userId || actor.canManage) return ALLOW;
  if (scope.area === 'DEPARTMENT' && actor.isTeamLeader) return ALLOW;
  return { allowed: false, reason: '올린 사람과 관리자만 바꿀 수 있습니다.' };
}

/** 복원과 영구 삭제: 지운 사람도 포함한다(자기가 지운 것은 되돌릴 수 있어야 한다) */
export function canRestoreFile(
  actor: StorageActor,
  scope: StorageScope,
  file: StorageFile
): Verdict {
  if (
    file.deletedByUserId === actor.userId ||
    file.ownerUserId === actor.userId ||
    actor.canManage
  ) {
    return ALLOW;
  }
  if (scope.area === 'DEPARTMENT' && actor.isTeamLeader) return ALLOW;
  return { allowed: false, reason: '지운 사람과 관리자만 되돌릴 수 있습니다.' };
}
