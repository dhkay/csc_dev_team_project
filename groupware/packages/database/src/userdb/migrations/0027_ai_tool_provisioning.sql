-- Custom SQL migration file, put your code below! --

-- AI 도구 프로비저닝 모드(개별 부여 PER_ORG / 전체 공통 COMMON). 기존 행은 PER_ORG 기본.
-- 값 집합 SSOT = @csc/entitlements ProvisioningMode. 플랫폼 관리자가 도구별로 토글.
-- (AI 어시스턴트는 AI 도구가 아니라 전역 기본 제공 기능이라 이 카탈로그/컬럼과 무관 — 별도 관리.)
ALTER TABLE "ai_tools" ADD COLUMN "provisioning" varchar(16) NOT NULL DEFAULT 'PER_ORG';
