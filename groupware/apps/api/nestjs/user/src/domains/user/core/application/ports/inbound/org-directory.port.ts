import { UserEntity } from '../../../domain/entities/user.entity';
import { DepartmentEntity } from '../../../domain/entities/department.entity';
import { OrgCallerActor } from './org-caller';

/**
 * 직원조회(디렉터리) 호출 주체: 공유 조직 호출자(토큰 도출)
 * 관리(ROOT/시스템관리)와 달리 같은 조직의 아무 조직유저면 조회 가능(서비스가 판정)
 */
export type OrgDirectoryActor = OrgCallerActor;

/** 직원조회 결과: 조직의 활성 멤버 + 부서 트리(좌측 필터/부서명 해석용) */
export interface OrgDirectory {
  members: UserEntity[];
  departments: DepartmentEntity[];
}

/** 조회 옵션: 기본은 직원조회 화면의 규칙을 따른다. */
export interface OrgDirectoryOptions {
  // 조직 소유자(ROOT)를 목록에 포함할지. 기본 false.
  //
  // 직원조회 화면은 직원 디렉터리라 소유자를 빼는 것이 그 화면의 규칙이다. 하지만 같은
  // 응답을 id → 이름 해석에 쓰는 곳(스토리지의 "올린 사람")에서는 소유자가 빠지면 그가 올린
  // 파일이 `알 수 없는 사용자` 로 보인다. 화면의 표시 규칙과 이름 해석은 다른 요구라 호출자가 고른다.
  //
  // 보안 경계가 아니다. 소유자의 존재는 같은 조직 구성원에게 비밀이 아니며, 이 슬라이스 자체가
  // 이미 같은 조직 조직유저에게만 열려 있다.
  includeRoot?: boolean;
}

/**
 * 직원조회 Inbound Port: 같은 조직 조직유저면 조직 전체 멤버/부서를 읽는다(읽기 전용)
 * 관리(생성/수정/삭제)는 OrgMemberManagementPort(ROOT 전용)가 담당: 권한 모델이 달라 슬라이스를 분리한다.
 */
export interface OrgDirectoryPort {
  getDirectory(
    actor: OrgDirectoryActor,
    options?: OrgDirectoryOptions,
  ): Promise<OrgDirectory>;
}

export const ORG_DIRECTORY_PORT = Symbol('ORG_DIRECTORY_PORT');
