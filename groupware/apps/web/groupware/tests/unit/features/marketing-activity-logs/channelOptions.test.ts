import { describe, expect, it } from 'vitest';
import { toChannelFilterOptions } from '$lib/features/marketing-activity-logs/lib/channelOptions';
import { createMemberIdentityLookup } from '$lib/features/members/lib/roster';

// 채널은 개인 소유고 이름은 주인 안에서만 유일하다. 조직 전체 원장에서 같은 이름이 여럿 나오므로
// 그것을 갈라 주는 규칙이 이 모듈에 있다. 표와 필터, CSV 가 모두 이 결과 하나만 소비한다.

const roster = [
  { id: 1, name: '김보섭', email: 'a@x.com' },
  { id: 2, name: '이영희', email: 'b@x.com' },
  // 동명이인: 이름만으로는 갈라지지 않는다.
  { id: 3, name: '김보섭', email: 'c@x.com' }
];
const identify = createMemberIdentityLookup(roster);

describe('toChannelFilterOptions', () => {
  it('이름이 조직에서 유일하면 그대로 쓴다', () => {
    const out = toChannelFilterOptions(
      [
        { id: 10, name: '블로그', ownerUserId: 1 },
        { id: 11, name: '유튜브', ownerUserId: 2 }
      ],
      identify
    );
    expect(out).toEqual([
      { id: 10, name: '블로그' },
      { id: 11, name: '유튜브' }
    ]);
  });

  it('이름이 겹치면 주인 이름을 덧붙인다', () => {
    const out = toChannelFilterOptions(
      [
        { id: 10, name: '기본', ownerUserId: 1 },
        { id: 11, name: '기본', ownerUserId: 2 }
      ],
      identify
    );
    expect(out).toEqual([
      { id: 10, name: '기본 (김보섭)' },
      { id: 11, name: '기본 (이영희)' }
    ]);
  });

  it('주인 이름까지 겹치면 이메일을 함께 쓴다', () => {
    const out = toChannelFilterOptions(
      [
        { id: 10, name: '기본', ownerUserId: 1 },
        { id: 11, name: '기본', ownerUserId: 3 }
      ],
      identify
    );
    expect(out).toEqual([
      { id: 10, name: '기본 (김보섭 (a@x.com))' },
      { id: 11, name: '기본 (김보섭 (c@x.com))' }
    ]);
  });

  it('겹치지 않는 채널은 주인이 동명이인이어도 이름만 쓴다', () => {
    const out = toChannelFilterOptions(
      [
        { id: 10, name: '블로그', ownerUserId: 1 },
        { id: 11, name: '기본', ownerUserId: 3 }
      ],
      identify
    );
    expect(out).toEqual([
      { id: 10, name: '블로그' },
      { id: 11, name: '기본' }
    ]);
  });

  it('로스터에 없는 주인은 폴백 문구로 갈라진다(퇴사/purge)', () => {
    const out = toChannelFilterOptions(
      [
        { id: 10, name: '기본', ownerUserId: 1 },
        { id: 11, name: '기본', ownerUserId: 99 }
      ],
      identify
    );
    expect(out).toEqual([
      { id: 10, name: '기본 (김보섭)' },
      { id: 11, name: '기본 (알 수 없는 사용자 (#99))' }
    ]);
  });

  it('입력 순서를 유지한다(서버가 주인, 표시순서로 정렬해 준다)', () => {
    const out = toChannelFilterOptions(
      [
        { id: 30, name: '유튜브', ownerUserId: 2 },
        { id: 10, name: '블로그', ownerUserId: 1 },
        { id: 20, name: '인스타', ownerUserId: 1 }
      ],
      identify
    );
    expect(out.map((o) => o.id)).toEqual([30, 10, 20]);
  });

  it('빈 목록은 빈 결과다(로스터 조회 실패 폴백)', () => {
    expect(toChannelFilterOptions([], identify)).toEqual([]);
  });
});