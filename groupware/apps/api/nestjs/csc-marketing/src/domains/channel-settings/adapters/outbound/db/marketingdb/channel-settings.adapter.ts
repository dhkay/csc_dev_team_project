import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { marketingDb, marketingChannelSourceSettings } from '@csc/database/marketingdb';
import {
  ChannelSettingsRecord,
  ChannelSettingsRepositoryPort,
} from '../../../../core/application/ports/outbound';

/** ChannelSettingsRepositoryPort 구현: marketingdb(channel_id + source_key 스코프) */
@Injectable()
export class ChannelSettingsRepositoryAdapter
  implements ChannelSettingsRepositoryPort
{
  async findRecord(
    channelId: number,
    sourceKey: string,
  ): Promise<ChannelSettingsRecord | null> {
    const [row] = await marketingDb
      .select()
      .from(marketingChannelSourceSettings)
      .where(
        and(
          eq(marketingChannelSourceSettings.channelId, channelId),
          eq(marketingChannelSourceSettings.sourceKey, sourceKey),
        ),
      )
      .limit(1);
    return row
      ? { channelId: row.channelId, sourceKey: row.sourceKey, settings: row.settings }
      : null;
  }

  async upsertRecord(
    organizationId: number,
    channelId: number,
    sourceKey: string,
    settings: string,
  ): Promise<ChannelSettingsRecord> {
    const now = new Date();
    const [row] = await marketingDb
      .insert(marketingChannelSourceSettings)
      .values({ organizationId, channelId, sourceKey, settings, updatedAt: now })
      .onConflictDoUpdate({
        target: [
          marketingChannelSourceSettings.channelId,
          marketingChannelSourceSettings.sourceKey,
        ],
        set: { settings, updatedAt: now },
      })
      .returning();
    return { channelId: row.channelId, sourceKey: row.sourceKey, settings: row.settings };
  }
}
