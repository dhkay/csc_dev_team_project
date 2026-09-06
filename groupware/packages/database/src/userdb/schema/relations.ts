// Drizzle relations: 멀티테넌시 2계층(조직 → 조직유저) + 엔타이틀먼트(조직/유저 grant)
// 어댑터의 relational query(`userDb.query.organizationUsers.findFirst({ with: { organization: true } })`)에 사용
import { relations } from 'drizzle-orm';
import { organizations } from './org-tables';
import { departments } from './department-tables';
import { organizationUsers } from './organization-user-tables';
import { features } from './feature-tables';
import { aiTools } from './ai-tool-tables';
import {
  organizationFeatures,
  organizationAiTools,
  organizationUserFeatures,
  organizationUserAiTools,
  departmentAiTools,
} from './entitlement-tables';
import { permissions } from './permission-tables';
import { departmentPermissions, organizationUserPermissions } from './permission-grant-tables';

export const organizationUsersRelations = relations(organizationUsers, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [organizationUsers.organizationId],
    references: [organizations.id],
  }),
  department: one(departments, {
    fields: [organizationUsers.departmentId],
    references: [departments.id],
  }),
  featureToggles: many(organizationUserFeatures),
  aiToolToggles: many(organizationUserAiTools),
  permissionGrants: many(organizationUserPermissions),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  organizationUsers: many(organizationUsers),
  departments: many(departments),
  featureGrants: many(organizationFeatures),
  aiToolGrants: many(organizationAiTools),
}));

// 부서 트리(자기참조) + 조직/구성원. parent/children 는 relationName 으로 셀프 릴레이션 구분
export const departmentsRelations = relations(departments, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [departments.organizationId],
    references: [organizations.id],
  }),
  parent: one(departments, {
    fields: [departments.parentId],
    references: [departments.id],
    relationName: 'departmentParent',
  }),
  children: many(departments, { relationName: 'departmentParent' }),
  members: many(organizationUsers),
  permissionGrants: many(departmentPermissions),
  aiToolGrants: many(departmentAiTools),
}));

export const featuresRelations = relations(features, ({ many }) => ({
  grants: many(organizationFeatures),
}));

export const aiToolsRelations = relations(aiTools, ({ many }) => ({
  grants: many(organizationAiTools),
}));

export const organizationFeaturesRelations = relations(organizationFeatures, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [organizationFeatures.organizationId],
    references: [organizations.id],
  }),
  feature: one(features, {
    fields: [organizationFeatures.featureId],
    references: [features.id],
  }),
  userToggles: many(organizationUserFeatures),
}));

export const organizationAiToolsRelations = relations(organizationAiTools, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [organizationAiTools.organizationId],
    references: [organizations.id],
  }),
  aiTool: one(aiTools, {
    fields: [organizationAiTools.aiToolId],
    references: [aiTools.id],
  }),
  userToggles: many(organizationUserAiTools),
  departmentGrants: many(departmentAiTools),
}));

export const departmentAiToolsRelations = relations(departmentAiTools, ({ one }) => ({
  department: one(departments, {
    fields: [departmentAiTools.departmentId],
    references: [departments.id],
  }),
  grant: one(organizationAiTools, {
    fields: [departmentAiTools.organizationId, departmentAiTools.aiToolId],
    references: [organizationAiTools.organizationId, organizationAiTools.aiToolId],
  }),
}));

export const organizationUserFeaturesRelations = relations(organizationUserFeatures, ({ one }) => ({
  user: one(organizationUsers, {
    fields: [organizationUserFeatures.userId],
    references: [organizationUsers.id],
  }),
  grant: one(organizationFeatures, {
    fields: [organizationUserFeatures.organizationId, organizationUserFeatures.featureId],
    references: [organizationFeatures.organizationId, organizationFeatures.featureId],
  }),
}));

export const organizationUserAiToolsRelations = relations(organizationUserAiTools, ({ one }) => ({
  user: one(organizationUsers, {
    fields: [organizationUserAiTools.userId],
    references: [organizationUsers.id],
  }),
  grant: one(organizationAiTools, {
    fields: [organizationUserAiTools.organizationId, organizationUserAiTools.aiToolId],
    references: [organizationAiTools.organizationId, organizationAiTools.aiToolId],
  }),
}));

// 권한 카탈로그 + 부여(부서/멤버 직접). 멤버 직접 부여는 부모 grant 테이블이 없어 grant 릴레이션 없음
export const permissionsRelations = relations(permissions, ({ many }) => ({
  departmentGrants: many(departmentPermissions),
  userGrants: many(organizationUserPermissions),
}));

export const departmentPermissionsRelations = relations(departmentPermissions, ({ one }) => ({
  department: one(departments, {
    fields: [departmentPermissions.departmentId],
    references: [departments.id],
  }),
  permission: one(permissions, {
    fields: [departmentPermissions.permissionId],
    references: [permissions.id],
  }),
}));

export const organizationUserPermissionsRelations = relations(
  organizationUserPermissions,
  ({ one }) => ({
    user: one(organizationUsers, {
      fields: [organizationUserPermissions.userId],
      references: [organizationUsers.id],
    }),
    permission: one(permissions, {
      fields: [organizationUserPermissions.permissionId],
      references: [permissions.id],
    }),
  }),
);
