import { AiToolKey, FeatureKey, OrgPosition, PermissionKey, ProvisioningMode } from './catalog';

/**
 * UI 표시 라벨: 권한 칩/토글 등 화면용 짧은 라벨(카탈로그의 정식 name 과 별개로 UI 에서 사용)
 * 카탈로그 메타(name)는 정식 표시명, 여기 라벨은 권한 UI 의 간결 표기
 */
export const FEATURE_LABELS: Record<FeatureKey, string> = {
  [FeatureKey.Notice]: '공지',
  [FeatureKey.UserManagement]: '사용자 관리',
  [FeatureKey.Roles]: '권한 관리',
  [FeatureKey.Content]: '콘텐츠',
  [FeatureKey.Stats]: '통계',
  [FeatureKey.Settings]: '설정',
  [FeatureKey.AuditLog]: '감사 로그',
  [FeatureKey.Billing]: '결제',
  [FeatureKey.Rbfr]: 'RBFR 연구',
};

export const AI_TOOL_LABELS: Record<AiToolKey, string> = {
  [AiToolKey.MarketingVideo]: '마케팅 영상 제작',
};

/** 프로비저닝 모드 표시 라벨: 관리자 카탈로그 편집/조직 부여 UI 공용 */
export const PROVISIONING_LABELS: Record<ProvisioningMode, string> = {
  [ProvisioningMode.PerOrg]: '개별 부여',
  [ProvisioningMode.Common]: '공통 제공',
};

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  [PermissionKey.SystemManagement]: '시스템관리',
};

export const ORG_POSITION_LABELS: Record<OrgPosition, string> = {
  [OrgPosition.Representative]: '대표',
  [OrgPosition.TeamLeader]: '팀장',
};
