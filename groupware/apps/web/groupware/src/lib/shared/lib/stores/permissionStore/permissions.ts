// 권한: SSOT 는 공유 커널 @csc/entitlements (user 토큰의 permissions key 와 동일 출처)
// 부서/멤버에 부여하는 권한(예: 시스템관리). 기존 호출부 호환을 위해 Permission/PERMISSION_LABELS 로 재노출
// 설계: .claude/rules/multi-tenancy.md
import { PermissionKey, PERMISSION_LABELS as KERNEL_PERMISSION_LABELS } from '@csc/entitlements';

/** 권한 = permission key (permissions 카탈로그) */
export const Permission = PermissionKey;
export type Permission = PermissionKey;

/** 권한 한글 라벨: UI 표시용 */
export const PERMISSION_LABELS: Record<Permission, string> = KERNEL_PERMISSION_LABELS;
