// 직책(대표/팀장) 도메인 타입: SSOT 는 공유 커널 @csc/entitlements.
// 권한/AI도구와 분리된 별도 차원(멤버당 하나: 대표↔팀장 상호배제는 단일 값으로 보장)
// 대표는 ROOT(개발관리자)만 임명(isRootRoleOnlyPosition), 팀장은 부서 배치 필수(isDepartmentRequiredPosition) + 부서당 1명
export {
  OrgPosition,
  ORG_POSITION_LABELS,
  ORG_POSITION_CATALOG,
  ALL_ORG_POSITIONS,
  isRootRoleOnlyPosition,
  isDepartmentRequiredPosition,
} from '@csc/entitlements';
