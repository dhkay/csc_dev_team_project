/**
 * 채널 id → 표시 이름 규칙 (활동 로그의 채널 컬럼과 채널 필터가 공유한다)
 *
 * 채널은 개인 소유이고 이름은 주인 안에서만 유일하다. 게다가 도구에 처음 들어온 사람에게는
 * 기본 채널이 자동으로 생겨서, 조직 전체 원장에서는 기본이 사람 수만큼 나온다.
 *
 * 그래서 이름이 조직에서 유일하면 그대로 쓰고 겹칠 때만 주인을 덧붙인다. 주인 이름까지 겹치면
 * 이메일을 함께 쓴다. 사람을 이메일로 갈라 준다는 규칙의 SSOT 는 `features/members/lib/roster.ts` 다.
 *
 * 늘 주인을 붙이지 않는 이유는 표의 한 칸이 좁기 때문이다. 필요할 때만 길어지는 편이 읽기 쉽다.
 */
import { formatMemberLabel, type MemberIdentity } from '$lib/features/members/lib/roster';
import type { ActivityFilterOption } from '../types';

/** 조직 범위 채널 한 줄(csc-marketing `GET /channels/roster` 응답 형태) */
export interface ChannelRosterEntry {
  id: number;
  name: string;
  ownerUserId: number;
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

/**
 * 조직 채널 목록 → 표시 선택지. 입력 순서를 유지한다(서버가 주인, 표시순서로 정렬해 준다)
 *
 * `identify` 는 멤버 로스터 조회 함수다(`createMemberIdentityLookup`). 로스터에 없는 주인은
 * 그 함수가 `알 수 없는 사용자 (#id)` 를 돌려주므로 여기서 따로 처리하지 않는다.
 */
export function toChannelFilterOptions(
  channels: readonly ChannelRosterEntry[],
  identify: (userId: number) => MemberIdentity
): ActivityFilterOption[] {
  const nameCounts = countBy(channels, (c) => c.name);

  // 1차: 이름이 겹치는 것에만 주인 이름을 붙인다. 원래 이름을 함께 들고 가야 2차에서 다시 만든다.
  const labelled = channels.map((c) => {
    const identity = identify(c.ownerUserId);
    const ambiguous = (nameCounts.get(c.name) ?? 0) > 1;
    return {
      id: c.id,
      label: ambiguous ? `${c.name} (${identity.name})` : c.name,
      plain: c.name,
      identity
    };
  });

  // 2차: 그래도 겹치면 주인이 동명이인이다. 그때만 이메일까지 붙인다.
  const labelCounts = countBy(labelled, (o) => o.label);
  return labelled.map((o) => ({
    id: o.id,
    name:
      (labelCounts.get(o.label) ?? 0) > 1
        ? `${o.plain} (${formatMemberLabel(o.identity)})`
        : o.label
  }));
}