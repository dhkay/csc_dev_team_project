/**
 * 프론트엔드 라우트 경로 중앙 관리
 *
 * 엔티티 API 는 이 파일의 경로를 import 해서 쓰고, `+server.ts` 는 백엔드 URL 을 직접 적는다.
 * 파라미터가 붙는 경로는 함수로 정의하고 값은 반드시 `encodeURIComponent` 로 감싼다.
 */

export const ROUTES = {
	// 인증 관련 라우트
	AUTH: {
		// 로그인
		LOGIN: '/api/auth/login',
		// 로그아웃
		LOGOUT: '/api/auth/logout',
	},
	// 현재 유저(+조직): 브라우저 클라이언트용 BFF(서버 findData 중계)
	USER: {
		// GET 조회 / PATCH 본인 프로필 수정(이름, 닉네임, 프로필이미지)
		ME: '/api/user/me',
		// POST 본인 비밀번호 변경(ADMIN)
		PASSWORD: '/api/user/me/password',
	},
	// 파일 업로드(file-upload) BFF: presign/confirm. 바이트 PUT 은 presigned 절대 URL 로 직접
	FILE_UPLOAD: {
		IMAGE: '/api/file/upload/image',
		CONFIRM: '/api/file/upload/confirm',
	},
	// 스토리지(공통/조직/개인 파일 브라우저) BFF.
	// 영역과 부서는 쿼리(조회)나 본문(변경)으로 넘기고, 조직/사용자/인가 집합은 BFF 가 세션에서 도출한다.
	STORAGE: {
		BROWSE: '/api/storage/browse',
		SUMMARY: '/api/storage/summary',
		// 업로더가 라우트 문자열 하나만 정하도록 영역을 쿼리에 담는다(upload.ts 계약)
		presign: (area: string, departmentId: number | null) =>
			`/api/storage/files/presign?area=${area}${departmentId ? `&dept=${departmentId}` : ''}`,
		CONFIRM: '/api/storage/files/confirm',
		// 업로드 취소: 확정되지 않은 자산을 지금 버린다(수거자를 기다리지 않는다)
		DISCARD: '/api/storage/files/discard',
		file: (id: string) => `/api/storage/files/${encodeURIComponent(id)}`,
		// 조직/개인 파일의 다운로드와 미리보기: BFF 가 세션을 확인하고 바이트를 중계한다.
		// (공통 파일은 이 경로가 아니라 공개 주소 `/f/{id}` 를 쓴다. features/storage/lib/publicUrl.)
		download: (id: string, area: string, departmentId: number | null) =>
			`/api/storage/files/${encodeURIComponent(id)}/download?area=${area}` +
			`${departmentId ? `&dept=${departmentId}` : ''}`,
		items: (action: 'trash' | 'restore' | 'purge') => `/api/storage/items/${action}`,
	},
	// 조직 관리(admin) BFF: 쓰기만 브라우저에서. 목록 조회는 SSR(+page.server.ts)
	ADMIN: {
		DEPARTMENTS: '/api/admin/departments',
		MEMBERS: '/api/admin/members',
		PERMISSIONS: '/api/admin/permissions',
		AI_TOOLS: '/api/admin/ai-tools',
		POSITIONS: '/api/admin/positions',
	},
	// 마케팅 BFF: 채널/기획/영상/자산. 하위 경로는 각 feature api 에서 base 뒤에 붙인다.
	MARKETING: {
		// 브랜드/컨셉 선택지(프롬프트를 쓰는 csc-marketing 이 소유). 프론트는 목록을 갖지 않는다.
		BRAND_CONCEPT_CATALOG: '/api/marketing/brand-concept-catalog',
		CHANNELS: '/api/marketing/channels',
		// 개인 AI 모델 선택(채널 무관): 만드는 사람이 자기 모델을 고른다. 조회/저장
		MY_AI_MODEL: '/api/marketing/my/ai-model',
		// 개인 브랜드/컨셉 세트(채널 무관): 만드는 사람이 자기 브랜드와 연출 방향을 정한다. 조회/저장
		MY_BRAND_CONCEPT: '/api/marketing/my/brand-concept',
		// 세트 하나의 연출(카테고리/레퍼런스 정의 + 그중 무엇을 골랐는지). 위 목록 저장과 범위가 다르다.
		MY_BRAND_CONCEPT_SET: '/api/marketing/my/brand-concept/set',
		// 진입 기본 버전 기록(PUT): 다음에 도구를 열 때 갈 버전. 조회는 도구 랜딩 SSR 이 담당
		// 지금 보는 버전은 주소가 정한다(`/{org}/{tool}/{version}/{channel}`)
		MY_ENTRY_VERSION: '/api/marketing/my/entry-version',
		// 진입 시 먼저 열릴 채널(개인). 조회/지정. 조직 공유 '대표 채널'을 대신한다.
		MY_DEFAULT_CHANNEL: '/api/marketing/my/default-channel',
		// 이미지 생성 대기열 현황(채널 무관): 내가 고른 이미지 모델의 엔진 큐
		IMAGE_ENGINE_LOAD: '/api/marketing/plans/image-engine-load',
		// 저장된 기획안(개인 워크스페이스): 목록/생성/삭제
		SAVED_PLANS: '/api/marketing/saved-plans',
		// 기획안 씬 이미지 presign(개인 경로 주입)
		SAVED_PLAN_IMAGE: '/api/marketing/saved-plans/image/presign',
		// 영상 프로젝트(개인 워크스페이스): 저장 기획안 스냅샷 → 영상 렌더. 목록/생성/조회/재렌더/삭제
		VIDEO_PROJECTS: '/api/marketing/video-projects',
		// 최종 영상(개인 워크스페이스): 완성 원천 + 세트(프레임+아웃트로) 합성. 목록/생성/조회/재렌더/삭제
		VIDEO_FINALS: '/api/marketing/video-finals',
		// 보관함(조직 공용): 목록. 항목별 동작은 이 뒤에 붙는다.
		//   `/:id`         보내기(POST) / 영구 삭제(DELETE)
		//   `/:id/restore` 꺼내기(POST): 삭제가 아니라 이동이라 경로가 따로다.
		//
		// 자원 이름에 산출물 종류가 없는 이유: 어느 표에서 오는지는 버전이 정한다(원천과 최종을
		// 나누지 않는 버전에서는 그 하나뿐인 영상이 곧 배포본이다). 브라우저는 버전만 싣고, BFF 가
		// 그 판정을 한 곳에서 한다(lib/server/marketing/archiveTarget)
		ARCHIVE: '/api/marketing/archive',
		// 영상 대표 썸네일 presign(개인 경로 주입). 붙이는 것은 배치 경로 `VIDEO_PROJECTS/:id/place`.
		VIDEO_THUMBNAIL_PRESIGN: '/api/marketing/video-projects/thumbnail/presign',
		// 진행 화면 미리보기의 산출물 등록(개발 전용, prod 에서는 404)
		//
		// 미리보기는 유료 렌더를 돌리지 않아 그 시점까지 서버에 행이 없다. 그래서 '영상 생성' 이
		// 여기서 실제 행을 만든다(배치까지 함께). 그 행은 실제 산출물과 구별되지 않으므로 그 뒤의
		// 목록, 보관, 삭제가 실제와 똑같이 동작한다.
		VIDEO_PREVIEW: '/api/marketing/video-projects/preview',
		// 미리보기 완성 영상 presign(개인 경로 주입). 위 등록 경로가 그 자산을 확정한다.
		VIDEO_PREVIEW_VIDEO_PRESIGN: '/api/marketing/video-projects/preview/video/presign',
		// 조직 자산(마케팅영상): 생성(POST)/수정, 삭제(:id 인라인). 목록은 SSR. ROOT/대표/팀장만
		ASSETS: '/api/marketing/assets',
		// 자산 업로드 presign: 카테고리는 경로 파라미터(파티션 주입)
		assetsPresign: (category: string) =>
			`/api/marketing/assets/presign/${encodeURIComponent(category)}`,
		// 조직 세트: 생성(POST)/수정, 삭제 + 슬롯(:id/slots/:slot 인라인)
		ASSET_SETS: '/api/marketing/asset-sets',
		// 세트 슬롯 업로드 presign: 슬롯(frame/outro)은 경로 파라미터
		assetSetsPresign: (slot: string) =>
			`/api/marketing/asset-sets/presign/${encodeURIComponent(slot)}`,
		// 조직 태그 카탈로그: 축/태그 CRUD(orgId 주입 → 조직 전용). 목록은 SSR. ROOT/대표/팀장만
		ASSET_CATALOG_AXES: '/api/marketing/asset-catalog/axes',
		assetCatalogAxis: (id: number) => `/api/marketing/asset-catalog/axes/${id}`,
		ASSET_CATALOG_TAGS: '/api/marketing/asset-catalog/tags',
		assetCatalogTag: (id: number) => `/api/marketing/asset-catalog/tags/${id}`,
		// 활동 로그 조회(조직 전체 + 단계별 비용): 관리급(루트/대표/팀장)만. 커서 페이징
		ACTIVITY_LOGS: '/api/marketing/activity-logs',
	},
	// AI 챗봇 BFF: 세션 CRUD/스트리밍, 모델 목록
	AI_CHAT: {
		SESSIONS: '/api/ai-chat/sessions',
		MODELS: '/api/ai-chat/models',
	},
	// 공용 API 자격증명 BFF: 하위 경로 없는 단일 라우트
	API_CREDENTIALS: '/api/api-credentials',
	// 조직 AI 어시스턴트 설정 BFF: 조회(GET)/수정(PATCH) 단일 라우트
	ASSISTANT_SETTINGS: '/api/assistant-settings',
	// RBFR(역할 기반 배합 비율) BFF: 처방 계산·검증 + 원료 등록
	RBFR: {
		calculateFormula: (formulaId: number, profileCode: string) =>
			`/api/rbfr/formulas/${formulaId}/calculate?profileCode=${encodeURIComponent(profileCode)}`,
		directDomains: (profileCode: string) =>
			`/api/rbfr/profiles/${encodeURIComponent(profileCode)}/direct-domains`,
		INGREDIENTS: '/api/rbfr/ingredients',
		FORMULAS: '/api/rbfr/formulas',
		RECOMMENDATIONS: '/api/rbfr/recommendations',
		PROFILES: '/api/rbfr/profiles',
		roleDomains: (profileCode: string) =>
			`/api/rbfr/profiles/${encodeURIComponent(profileCode)}/role-domains`,
		cellRuleLimits: (profileCode: string) =>
			`/api/rbfr/profiles/${encodeURIComponent(profileCode)}/cell-rule-limits`,
		approveCellRuleLimit: (ruleVersion: string) =>
			`/api/rbfr/cell-rule-limits/${encodeURIComponent(ruleVersion)}/approve`,
		setProfileActive: (profileCode: string) =>
			`/api/rbfr/profiles/${encodeURIComponent(profileCode)}/active`,
		cellMapping: (ruleVersion: string) =>
			`/api/rbfr/cell-rule-limits/${encodeURIComponent(ruleVersion)}/mapping`,
	},
} as const;