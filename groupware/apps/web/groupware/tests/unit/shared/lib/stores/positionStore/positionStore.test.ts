import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrgPosition } from '@csc/entitlements';
import type { MemberSummary } from '$lib/features/positions/../members/types';

// positionsService(→ apis → frontClient) 모킹: 스토어 스테이징/flush 로직만 검증
const setMember = vi.fn();
vi.mock('$lib/features/positions/services/positions.service', () => ({
  positionsService: { setMember: (...args: unknown[]) => setMember(...args) },
}));

import { positionStore } from '$lib/shared/lib/stores/positionStore/positionStore.svelte';

const member = (id: number, position: OrgPosition | null): MemberSummary => ({
  id,
  email: `u${id}@demo.co`,
  name: `유저${id}`,
  role: 'ADMIN',
  position,
  status: 'ACTIVE',
  departmentId: null,
  phone: null,
  extension: null,
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00Z',
});

describe('positionStore', () => {
  beforeEach(() => {
    setMember.mockReset();
    setMember.mockResolvedValue({ success: true });
    positionStore.hydrate([member(1, null), member(2, OrgPosition.TeamLeader)]);
  });

  it('hydrate 후 baseline 직책을 반영한다', () => {
    expect(positionStore.positionOf('1')).toBe(null);
    expect(positionStore.positionOf('2')).toBe(OrgPosition.TeamLeader);
    expect(positionStore.dirty).toBe(false);
  });

  it('setPosition 은 스테이징되어 dirty/positionOf 에 즉시 반영된다', () => {
    positionStore.setPosition('1', OrgPosition.Representative);
    expect(positionStore.positionOf('1')).toBe(OrgPosition.Representative);
    expect(positionStore.dirty).toBe(true);
    expect(positionStore.pendingCount).toBe(1);
  });

  it('baseline 과 같은 값으로 되돌리면 스테이징이 제거된다', () => {
    positionStore.setPosition('2', OrgPosition.Representative);
    expect(positionStore.dirty).toBe(true);
    positionStore.setPosition('2', OrgPosition.TeamLeader); // baseline 으로 원복
    expect(positionStore.dirty).toBe(false);
  });

  it('discard 는 스테이징을 버린다', () => {
    positionStore.setPosition('1', OrgPosition.TeamLeader);
    positionStore.discard();
    expect(positionStore.dirty).toBe(false);
    expect(positionStore.positionOf('1')).toBe(null);
  });

  it('flush 는 변경된 멤버만 서비스로 저장하고 baseline 을 낙관적 반영한다', async () => {
    positionStore.setPosition('1', OrgPosition.Representative);
    const r = await positionStore.flush();
    expect(r.success).toBe(true);
    expect(setMember).toHaveBeenCalledTimes(1);
    expect(setMember).toHaveBeenCalledWith(1, OrgPosition.Representative);
    expect(positionStore.dirty).toBe(false);
    expect(positionStore.positionOf('1')).toBe(OrgPosition.Representative);
  });

  it('flush 실패 시 error 를 노출하고 스테이징을 유지한다', async () => {
    setMember.mockResolvedValueOnce({ success: false, error: '부서에 이미 팀장이 있습니다.' });
    positionStore.setPosition('1', OrgPosition.TeamLeader);
    const r = await positionStore.flush();
    expect(r.success).toBe(false);
    expect(positionStore.error).toContain('팀장');
    expect(positionStore.dirty).toBe(true);
  });
});
