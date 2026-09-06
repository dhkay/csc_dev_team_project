// file-upload 스토리지 API 호출부(서버 전용): 헤더 주입과 스코프 구성을 한 곳에 둔다.
//
// 부르는 법을 라우트마다 적으면 어느 라우트가 스코프를 빠뜨렸는지 리뷰로만 알 수 있다.
// 여기서만 만들면 빠뜨릴 자리가 없다.
import type { RequestEvent } from '@sveltejs/kit';
import { serverStorageClient } from '$lib/infrastructure/http/serverClientInstances';
import { AUTH_ERROR_RULES, fail, mapHttpError } from '$lib/server/http/bff';
import {
  requireStorageAccess,
  requireStorageIdentity,
  type StorageAccess,
  type StorageIdentity
} from './access';
import type { StorageArea } from '$lib/features/storage/types';

/** file-upload 가 받는 스코프. snake_case 는 그쪽 스키마에 맞춘 것이다. */
export interface StorageScopePayload {
  area: StorageArea;
  department_id: number | null;
  department_ids: number[];
  can_manage_org: boolean;
  is_team_leader: boolean;
}

/**
 * 접근 범위 + 지금 보는 부서 → 요청 스코프
 *
 * 인가 집합은 BFF 가 도출한 값 그대로 싣는다. 브라우저가 보낸 값은 어느 필드에도 들어가지 않고,
 * 브라우저가 정하는 것은 "어느 영역의 어느 부서를 보는가" 하나뿐이다.
 */
export function buildScope(
  access: StorageAccess,
  area: StorageArea,
  departmentId: number | null
): StorageScopePayload {
  return {
    area,
    department_id: area === 'DEPARTMENT' ? departmentId : null,
    department_ids: access.accessibleDepartmentIds,
    can_manage_org: access.canManage,
    is_team_leader: access.isTeamLeader
  };
}

/**
 * 부서를 쓰지 않는 영역(공통, 개인)의 스코프
 *
 * 인가 집합을 비워 보낸다. 그 영역에서는 서버가 부서를 보지 않으므로 쓰지 않을 값을 채우려고
 * 디렉터리를 부를 이유가 없다. 비어 있음이 와일드카드로 읽히지 않는다: 서버는 부서 영역에서만
 * 이 집합을 보고, 거기서 비어 있으면 거부한다.
 */
export function buildAreaScope(
  identity: StorageIdentity,
  area: StorageArea
): StorageScopePayload {
  return {
    area,
    department_id: null,
    department_ids: [],
    can_manage_org: identity.canManage,
    is_team_leader: identity.isTeamLeader
  };
}

/** 신원 헤더: file-upload 가 조직과 사용자를 자기 값으로 확인하는 근거 */
function identityHeaders(identity: StorageIdentity): Record<string, string> {
  return {
    'X-Organization-Id': String(identity.orgId),
    'X-User-Id': String(identity.userId)
  };
}

export function storagePost<T>(
  identity: StorageIdentity,
  path: string,
  body: unknown
): Promise<{ data: T }> {
  return serverStorageClient().POST<T>(path, body, {
    headers: identityHeaders(identity)
  });
}

export function storagePatch<T>(
  identity: StorageIdentity,
  path: string,
  body: unknown
): Promise<{ data: T }> {
  return serverStorageClient().PATCH<T>(path, body, {
    headers: identityHeaders(identity)
  });
}

/**
 * file-upload 오류 → 사용자 응답. 상태코드가 아니라 의미로 문장을 고른다.
 * 404 를 "권한 없음" 으로 옮기지 않는 이유는 서버가 스코프 밖 대상을 일부러 404 로 답하기
 * 때문이다(존재를 알려 주지 않는다). 화면에도 같은 사실만 전한다.
 */
export function mapStorageError(error: unknown, fallback: string): Response {
  return mapHttpError(error, {
    fallback,
    table: {
      ...AUTH_ERROR_RULES,
      400: (e) => ({
        message:
          typeof e.response?.data === 'object' && e.response?.data !== null
            ? ((e.response.data as { detail?: string }).detail ?? '잘못된 요청입니다.')
            : '잘못된 요청입니다.'
      }),
      404: { message: '대상을 찾을 수 없습니다.' },
      413: { message: '파일이 너무 큽니다.' },
      503: { message: '스토리지 서버에 연결할 수 없습니다.' }
    },
    log: '스토리지 호출 실패'
  });
}

/** 영역 파라미터 파싱: 화이트리스트 밖이면 null(호출부가 400) */
export function parseArea(raw: string | null): StorageArea | null {
  if (raw === 'COMMON' || raw === 'DEPARTMENT' || raw === 'PERSONAL') return raw;
  return null;
}

export interface StorageRequestContext {
  // 상위 서버 호출에 필요한 신원. 부서 범위가 필요한 요청에서는 StorageAccess 가 들어온다.
  access: StorageIdentity;
  area: StorageArea;
  departmentId: number | null;
  scope: StorageScopePayload;
}

/**
 * 모든 스토리지 BFF 라우트의 공통 앞머리: 인증, 영역, 부서 검증, 스코프 구성까지 한 번에
 *
 * 라우트가 이것만 부르면 스코프를 빠뜨릴 자리가 없다. 브라우저가 주는 것은 area 와 dept 두
 * 문자열뿐이고 나머지는 전부 세션에서 나온다.
 *
 * 부서 영역일 때만 조직 디렉터리를 읽는다. 공통과 개인은 부서를 쓰지 않으므로 그 왕복을
 * 만들지 않는다(파일 목록 한 번 여는 데 드는 뒷단 호출이 하나 줄어든다)
 */
export async function resolveStorageRequest(
  event: RequestEvent,
  rawArea: string | null,
  rawDepartmentId: string | null
): Promise<StorageRequestContext | { error: Response }> {
  const area = parseArea(rawArea);
  if (!area) {
    // 영역을 먼저 본다. 유효하지 않으면 세션 조회조차 할 이유가 없다.
    const authed = await requireStorageIdentity(event);
    if ('error' in authed) return authed;
    return { error: fail('영역이 유효하지 않습니다.', { status: 400 }) };
  }

  if (area !== 'DEPARTMENT') {
    const authed = await requireStorageIdentity(event);
    if ('error' in authed) return authed;
    return {
      access: authed.identity,
      area,
      departmentId: null,
      scope: buildAreaScope(authed.identity, area)
    };
  }

  const auth = await requireStorageAccess(event);
  if ('error' in auth) return auth;
  const department = resolveDepartmentId(auth.access, area, rawDepartmentId);
  if ('error' in department) return department;
  return {
    access: auth.access,
    area,
    departmentId: department.departmentId,
    scope: buildScope(auth.access, area, department.departmentId)
  };
}

/**
 * 지금 보는 부서 검증. 부서 영역인데 인가 집합 밖이면 여기서 막는다.
 * 서버도 같은 검사를 하지만, 사용자에게 보여 줄 문장은 여기서 정한다.
 */
export function resolveDepartmentId(
  access: StorageAccess,
  area: StorageArea,
  raw: string | null
): { departmentId: number | null } | { error: Response } {
  if (area !== 'DEPARTMENT') return { departmentId: null };
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return { error: fail('부서를 선택해야 합니다.', { status: 400 }) };
  }
  if (!access.canManage && !access.accessibleDepartmentIds.includes(id)) {
    return { error: fail('접근할 수 없는 부서입니다.', { status: 403 }) };
  }
  return { departmentId: id };
}
