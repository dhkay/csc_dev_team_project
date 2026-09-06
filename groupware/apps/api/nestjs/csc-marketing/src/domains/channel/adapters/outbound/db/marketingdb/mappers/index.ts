import { InferSelectModel } from 'drizzle-orm';
import { marketingChannels } from '@csc/database/marketingdb';
import { ChannelEntity, ChannelRosterEntry } from '../../../../../core/domain';

type ChannelRow = InferSelectModel<typeof marketingChannels>;

/** 채널 행 → Domain ChannelEntity. */
export function toChannelEntity(row: Pick<ChannelRow, 'id' | 'name'>): ChannelEntity {
  return {
    id: row.id,
    name: row.name,
  };
}

/** 채널 행 → 조직 범위 이름 한 줄. 주인을 함께 나르는 이유는 엔티티 주석 참고 */
export function toChannelRosterEntry(
  row: Pick<ChannelRow, 'id' | 'name' | 'ownerUserId'>,
): ChannelRosterEntry {
  return {
    id: row.id,
    name: row.name,
    ownerUserId: row.ownerUserId,
  };
}
