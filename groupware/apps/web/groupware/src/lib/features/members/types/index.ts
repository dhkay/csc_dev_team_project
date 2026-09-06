// 조직 사용자관리(조직유저) 도메인 타입: 슈퍼관리자(ROOT)가 일반관리자(ADMIN)를 관리
// BFF(/api/admin/members) ↔ user 서버 응답을 이 타입으로 다룬다.

import type { OrgPosition } from '@csc/entitlements';

/** 조직유저 역할: 슈퍼관리자(ROOT) / 일반관리자(ADMIN) */
export type OrgMemberRole = 'ROOT' | 'ADMIN';

/** 조직유저 요약(목록/상세): 비밀번호 제외. 표시이름 = name. */
export interface MemberSummary {
  id: number;
  email: string;
  name: string;
  role: OrgMemberRole;
  // 직책(대표/팀장): 권한/AI도구와 분리된 별도 차원. null = 없음
  position: OrgPosition | null;
  status: string; // 'ACTIVE' | 'LOCKED' | 'INACTIVE' | 'WITHDRAWN'
  // 소속 부서 id: null = 미배치
  departmentId: number | null;
  // 연락처(선택): 전화번호. 공란이면 null.
  phone: string | null;
  // 연락처(선택): 사내번호. 공란이면 null.
  extension: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

/** 일반관리자 생성 입력 */
export interface CreateMemberInput {
  email: string;
  password: string;
  // 표시이름: organization_users.name.
  name: string;
  // 소속 부서 id: null/미지정 = 미배치
  departmentId?: number | null;
  // 전화번호(선택): null/미지정 = 공란
  phone?: string | null;
  // 사내번호(선택): null/미지정 = 공란
  extension?: string | null;
}

/** 일반관리자 수정 입력: 제공된 필드만(표시이름 / 비밀번호 재설정 / 소속 부서 / 연락처) */
export interface UpdateMemberInput {
  name?: string;
  // 로그인 이메일: 미지정=변경 안 함. 바꾸면 이전 주소로는 로그인할 수 없다.
  email?: string;
  password?: string;
  // number=배치, null=미배치, 미지정=변경 안 함
  departmentId?: number | null;
  // string=설정(빈문자 가능), null=비움, 미지정=변경 안 함
  phone?: string | null;
  // string=설정(빈문자 가능), null=비움, 미지정=변경 안 함
  extension?: string | null;
}
