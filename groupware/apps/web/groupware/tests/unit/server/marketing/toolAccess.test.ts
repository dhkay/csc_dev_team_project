// 마케팅 영상 도구 권한 계층의 단일 출처를 고정한다.
//
// 레이아웃(가시성)과 BFF(집행)가 같은 함수를 부르므로 규칙은 여기 한 번만 검증하면 된다.
// 세 함수의 경계(누가 들어가고 누가 빠지는가)가 바뀌면 이 파일이 먼저 깨져야 한다.
import { describe, it, expect } from 'vitest';
import { AiToolKey, OrgPosition } from '@csc/entitlements';
import {
  canEditToolSettings,
  canViewActivityLogs,
  isToolManagerSubject
} from '$lib/server/marketing/toolAccess';

const ROOT = { role: 'ROOT' as const, position: null };
const REPRESENTATIVE = { role: 'ADMIN' as const, position: OrgPosition.Representative };
const TEAM_LEADER = { role: 'ADMIN' as const, position: OrgPosition.TeamLeader };
const MEMBER = { role: 'ADMIN' as const, position: null };

describe('toolAccess: isToolManagerSubject (관리급)', () => {
  it('루트, 대표, 팀장은 관리급이다', () => {
    expect(isToolManagerSubject(ROOT)).toBe(true);
    expect(isToolManagerSubject(REPRESENTATIVE)).toBe(true);
    expect(isToolManagerSubject(TEAM_LEADER)).toBe(true);
  });

  it('직책 없는 조직원은 관리급이 아니다', () => {
    expect(isToolManagerSubject(MEMBER)).toBe(false);
  });

  it('세션이 없으면 false', () => {
    expect(isToolManagerSubject(null)).toBe(false);
    expect(isToolManagerSubject(undefined)).toBe(false);
  });
});

describe('toolAccess: canViewActivityLogs (활동 로그 열람)', () => {
  it('루트, 대표, 팀장은 조직 전체 원장을 볼 수 있다', () => {
    expect(canViewActivityLogs(ROOT)).toBe(true);
    expect(canViewActivityLogs(REPRESENTATIVE)).toBe(true);
    expect(canViewActivityLogs(TEAM_LEADER)).toBe(true);
  });

  it('직책 없는 조직원은 볼 수 없다', () => {
    expect(canViewActivityLogs(MEMBER)).toBe(false);
    expect(canViewActivityLogs(null)).toBe(false);
  });

  it('도구 보유 여부는 보지 않는다. 도구 진입 자체는 [toolSlug] 셸 게이트가 이미 막는다', () => {
    expect(canViewActivityLogs({ ...TEAM_LEADER, aiTools: [] })).toBe(true);
  });
});

describe('toolAccess: canEditToolSettings (기획 프롬프트 지침 편집)', () => {
  const TOOL = AiToolKey.MarketingVideo;

  it('루트 권한자는 도구 보유와 무관하게 편집할 수 있다', () => {
    expect(canEditToolSettings({ ...ROOT, aiTools: [] }, TOOL)).toBe(true);
    expect(canEditToolSettings({ ...REPRESENTATIVE, aiTools: [] }, TOOL)).toBe(true);
  });

  it('팀장은 그 도구를 보유할 때만 편집할 수 있다', () => {
    expect(canEditToolSettings({ ...TEAM_LEADER, aiTools: [TOOL] }, TOOL)).toBe(true);
    expect(canEditToolSettings({ ...TEAM_LEADER, aiTools: [] }, TOOL)).toBe(false);
    expect(canEditToolSettings({ ...TEAM_LEADER, aiTools: [TOOL] }, 'other-tool')).toBe(false);
  });

  it('직책 없는 조직원은 도구를 보유해도 편집할 수 없다', () => {
    expect(canEditToolSettings({ ...MEMBER, aiTools: [TOOL] }, TOOL)).toBe(false);
    expect(canEditToolSettings(null, TOOL)).toBe(false);
  });
});