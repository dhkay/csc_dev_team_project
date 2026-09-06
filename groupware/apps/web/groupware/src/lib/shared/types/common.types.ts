import type { AiToolKey, OrgPosition, PermissionKey } from '@csc/entitlements';

// Auth Types

/** 유저 권한(조직 내 역할) */
export type UserRole = 'ROOT' | 'ADMIN';

/** 조직 타입: PLATFORM(벤더) / TENANT(납품 조직). 멀티테넌시 */
export type OrgType = 'PLATFORM' | 'TENANT';

/** 로그인 요청 */
export interface LoginRequest {
	email: string;
	password: string;
	// 자동 로그인: true 면 인증 쿠키를 지속 쿠키로, false 면 브라우저 세션 쿠키로 심는다.
	autoLogin: boolean;
}

/** 로그인 응답 (user 서버) */
export interface LoginResponse {
	token: string;
	refreshToken: string;
	name: string;
	role: UserRole;
}

/** 로그인 결과 (BFF → 클라이언트) */
export interface LoginResult {
	success: boolean;
	data?: {
		name: string;
		role: UserRole;
		organization?: Organization;
		defaultPath: string;
	};
	error?: string;
	errorCode?: string;
	remainingAttempts?: number;
	remainingSeconds?: number;
}

/** 리프레시 토큰 응답 */
export interface RefreshTokenResponse {
	token: string;
	refreshToken: string;
}

/**
 * 조직(테넌트) 정보: 멀티테넌시. 자세한 설계는 .claude/rules/multi-tenancy.md 참고
 */
export interface Organization {
	id: number;
	slug: string;
	name: string;
	// 조직 타입: 백엔드 findData 가 반환(멀티테넌시). 미연동 컨텍스트에선 undefined.
	type?: OrgType;
	// 조직 프로필 로고 접근 URL: 플랫폼에서 설정(file-upload). 없으면 null/undefined.
	profileImageUrl?: string | null;
}

/**
 * 현재 로그인 유저 정보
 * `event.locals.getUser()` 반환 타입으로 Layout, Page, BFF 핸들러가 공유한다.
 */
export interface CurrentUser {
	id: number;
	// 이름: 유일한 이름 필드(표시 이름). 본인이 환경설정에서 편집한다.
	name: string;
	role?: UserRole;
	// 본인 프로필 이미지 표시용 서명 URL: 로드 경계(signUserImages)가 uploadId→서명URL 로 변환해 채운다.
	// 백엔드 저장값은 uploadId(불변)이며, 편집 폼 제출엔 profileImageUploadId 를 쓴다.
	profileImageUrl?: string | null;
	// 본인 프로필 이미지 원본 uploadId(편집 폼 제출/baseline). 로드 경계가 채운다.
	profileImageUploadId?: string | null;
	// 마지막 로그인 시각: ISO 8601 instant(백엔드 findData 가 채움). 표시 시 시간대 변환. 미기록 시 null.
	lastLoginAt?: string | null;
	// 소속 조직: 멀티테넌시(백엔드 findData 가 채움). 미연동 컨텍스트에선 undefined.
	organization?: Organization;
	// 유효 AI도구 key: access 토큰 클레임에서 도출(hooks 가 합성). 보조앱바 게이팅 등에 사용
	// 백엔드 인가와 동일 출처(토큰): 신규 부여는 재로그인/리프레시 후 반영. 비조직유저는 []
	aiTools?: AiToolKey[];
	// 보유 권한 key: 토큰 클레임 도출. 시스템관리(system-management) 등: 조직/사용자 관리 게이팅
	permissions?: PermissionKey[];
	// 직책: 토큰 클레임 도출. 대표(REPRESENTATIVE)는 hasRootAuthority 의 근거(ROOT 동등), 팀장(TEAM_LEADER)은 표시용
	// 권한/AI도구와 분리된 별도 차원(유저당 하나). 없으면 null.
	position?: OrgPosition | null;
}
