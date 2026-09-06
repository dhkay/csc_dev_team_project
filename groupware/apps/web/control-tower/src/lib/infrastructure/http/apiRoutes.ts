/** 프론트엔드 BFF 라우트 경로 중앙 관리 */
export const ROUTES = {
  AUTH: {
    LOGIN: '/api/auth/login',
    LOGOUT: '/api/auth/logout',
  },
  // 플랫폼 조직 관리 BFF
  PLATFORM: {
    ORGANIZATIONS: '/api/platform/organizations',
    recover: (id: number) => `/api/platform/organizations/${id}/recover`,
    rootAdmin: (id: number) => `/api/platform/organizations/${id}/root-admin`,
    // 조직 멤버 목록: 루트 이양 대상 선택용(GET)
    orgMembers: (id: number) => `/api/platform/organizations/${id}/members`,
    // 루트 이양(기존 조직원 승격) / 루트 교체(신규 계정)
    rootAdminTransfer: (id: number) => `/api/platform/organizations/${id}/root-admin/transfer`,
    rootAdminReplace: (id: number) => `/api/platform/organizations/${id}/root-admin/replace`,
    // 조직 ROOT 관리자 이메일 중복 확인: 저장 전 사전 확인(GET)
    rootAdminEmailCheck: (id: number, email: string) =>
      `/api/platform/organizations/${id}/root-admin/email-check?email=${encodeURIComponent(email)}`,
    aiTools: (id: number) => `/api/platform/organizations/${id}/ai-tools`,
    // 플랫폼 관리자 관리 BFF: 생성/수정/삭제/옵션설정(쓰기) 단일 라우트(ROOT 전용)
    ADMINS: '/api/platform/admins',
    // 관리자 이메일 중복 확인 BFF: 저장 전 사전 확인(GET)
    adminEmailCheck: (email: string, excludeId?: number) =>
      `/api/platform/admins/email-check?email=${encodeURIComponent(email)}` +
      (excludeId === undefined ? '' : `&excludeId=${excludeId}`),
    // AI 도구 카탈로그 BFF: 표시명/slug 수정(PATCH :key). 목록(GET)은 SSR 백엔드 직접 조회
    aiToolCatalog: (key: string) => `/api/platform/ai-tools/${encodeURIComponent(key)}`,
    // AI 어시스턴트 전역 설정 BFF: 수정(PATCH). 조회(GET)는 SSR 백엔드 직접 조회
    ASSISTANT_SETTINGS: '/api/platform/assistant-settings',
    // 서버 모니터링 BFF: 전 호스트 지표 스냅샷(GET, 실시간 폴링). ROOT 전용
    SERVERS_METRICS: '/api/platform/servers/metrics',
    // 특정 서버의 리소스 점유 상위 프로세스(게이지 클릭 시 on-demand)
    serverTop: (id: string) => `/api/platform/servers/${encodeURIComponent(id)}/top`,
    // 특정 서버의 정적 하드웨어 상세(게이지 클릭 시 on-demand)
    serverHardware: (id: string) => `/api/platform/servers/${encodeURIComponent(id)}/hardware`,
    // 공통 에셋(마케팅영상) BFF: 등록(POST)/삭제(DELETE)/presign. 목록(GET)은 SSR 백엔드 직접 조회
    COMMON_ASSETS: '/api/platform/common-assets',
    commonAssetPresign: '/api/platform/common-assets/presign',
    commonAsset: (id: number) => `/api/platform/common-assets/${id}`,
    // 에셋 세트 BFF: 세트 CRUD(POST/PATCH/DELETE) + 슬롯(frame/outro) 업로드 지정/비우기(PUT/DELETE) + presign. 목록은 SSR.
    ASSET_SETS: '/api/platform/asset-sets',
    assetSet: (id: number) => `/api/platform/asset-sets/${id}`,
    assetSetPresign: '/api/platform/asset-sets/presign',
    assetSetSlot: (id: number, slot: string) =>
      `/api/platform/asset-sets/${id}/slots/${encodeURIComponent(slot)}`,
    // 태그 카탈로그 BFF: 축/태그 CRUD(POST/PATCH/DELETE). 목록(GET)은 SSR 백엔드 직접 조회
    ASSET_CATALOG_AXES: '/api/platform/asset-catalog/axes',
    assetCatalogAxis: (id: number) => `/api/platform/asset-catalog/axes/${id}`,
    ASSET_CATALOG_TAGS: '/api/platform/asset-catalog/tags',
    assetCatalogTag: (id: number) => `/api/platform/asset-catalog/tags/${id}`,
  },
  // 파일 업로드(file-upload) BFF: presign/confirm. 바이트 PUT 은 presigned 절대 URL 로 직접
  FILE_UPLOAD: {
    IMAGE: '/api/file-upload/image',
    CONFIRM: '/api/file-upload/confirm',
  },
} as const;

export type Routes = typeof ROUTES;
