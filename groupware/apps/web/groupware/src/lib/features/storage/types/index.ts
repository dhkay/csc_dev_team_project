// 스토리지 화면 도메인 타입: BFF 응답과 컴포넌트가 공유한다.
//
// id 는 전부 문자열이다(서버 UUID). 숫자로 잡으면 폴더가 들어오는 2단계에서 전부 바뀐다.

/** 영역: 한 조직 안에서 파일이 누구의 것인지를 가르는 축 */
export type StorageArea = 'COMMON' | 'DEPARTMENT' | 'PERSONAL';

/** 지금 보고 있는 자리. 부서 영역이면 어느 부서인지가 함께 있어야 한다. */
export interface StorageScope {
  area: StorageArea;
  departmentId: number | null;
}

export type StorageSortId =
  | 'name-asc'
  | 'name-desc'
  | 'updated-desc'
  | 'updated-asc'
  | 'size-desc'
  | 'size-asc';

export interface StorageFile {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string | null;
  // 올린 사람의 id. 이름은 렌더 시점에 로스터에서 조인한다(개명 안전)
  ownerUserId: number | null;
  deletedAt: string | null;
  // 지운 사람의 id. 휴지통에서 되돌릴 수 있는지 판정할 때 쓴다.
  deletedByUserId: number | null;
}

export interface StorageListing {
  files: StorageFile[];
  total: number;
  hasMore: boolean;
}

export interface StorageUsageEntry {
  bytes: number;
  files: number;
}

export interface StorageUsageSummary {
  common: StorageUsageEntry;
  department: StorageUsageEntry;
  personal: StorageUsageEntry;
  // 영역별 휴지통. 합계가 아니라 영역별인 이유: 휴지통 화면이 영역 단위라, 사이드바에 합계를
  // 적으면 눌러서 보이는 목록의 개수와 어긋난다(개인에서 0개인데 배지는 12를 가리킨다)
  trashByArea: Record<StorageArea, StorageUsageEntry>;
}

/**
 * SSR 이 내려주는 신원과 접근 범위. 컴포넌트의 권한 판정은 이 값 하나에서만 나온다.
 *
 * 조직 id 는 담지 않는다. 클라이언트가 쓸 일이 없고, 모든 BFF 가 세션에서 도출한다.
 */
export interface StorageActor {
  userId: number;
  canManage: boolean;
  isTeamLeader: boolean;
  // 접근 가능한 부서 id. 본인 소속 부서는 따로 싣지 않는다: 화면이 묻는 것은 언제나 "이 부서를
  // 열 수 있는가" 이고 그 답은 이 집합에 이미 들어 있다(소속이면서 못 여는 경우는 없다)
  accessibleDepartmentIds: number[];
}
