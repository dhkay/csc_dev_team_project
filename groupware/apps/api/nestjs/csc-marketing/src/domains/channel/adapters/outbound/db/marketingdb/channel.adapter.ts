import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, max } from 'drizzle-orm';
import { marketingDb, marketingChannels } from '@csc/database/marketingdb';
import { ChannelRepositoryPort } from '../../../../core/application/ports/outbound';
import { ChannelEntity, ChannelRosterEntry } from '../../../../core/domain';
import { toChannelEntity, toChannelRosterEntry } from './mappers';

// 채널이 없을 때 자동 생성하는 기본 채널 이름. 사람이 읽는 이름이라 한국어
const DEFAULT_CHANNEL_NAME = '기본';

// 본인 채널만 걸리는 스코프. 모든 질의가 통과하므로 남의 채널은 존재하지 않는 것과 같음
const ownerScope = (organizationId: number, ownerUserId: number) =>
  and(
    eq(marketingChannels.organizationId, organizationId),
    eq(marketingChannels.ownerUserId, ownerUserId),
  );

/**
 * ChannelRepositoryPort 구현: marketingdb 채널 행
 * 생성은 ON CONFLICT DO NOTHING 후 재조회, 삭제는 DELETE RETURNING(멱등)
 */
@Injectable()
export class ChannelRepositoryAdapter implements ChannelRepositoryPort {
  async findManyChannelRecords(
    organizationId: number,
    ownerUserId: number,
  ): Promise<ChannelEntity[]> {
    const rows = await marketingDb
      .select({
        id: marketingChannels.id,
        name: marketingChannels.name,
      })
      .from(marketingChannels)
      .where(ownerScope(organizationId, ownerUserId))
      .orderBy(asc(marketingChannels.sortOrder), asc(marketingChannels.id));
    return rows.map(toChannelEntity);
  }

  async findChannelRoster(organizationId: number): Promise<ChannelRosterEntry[]> {
    // 조직 범위 + 이름만. ownerScope 를 쓰지 않는 유일한 질의(표시용 조인 전용)
    // 정렬은 주인 다음 표시순서라 같은 이름이 여럿일 때 주인별로 묶여 보임
    const rows = await marketingDb
      .select({
        id: marketingChannels.id,
        name: marketingChannels.name,
        ownerUserId: marketingChannels.ownerUserId,
      })
      .from(marketingChannels)
      .where(eq(marketingChannels.organizationId, organizationId))
      .orderBy(
        asc(marketingChannels.ownerUserId),
        asc(marketingChannels.sortOrder),
        asc(marketingChannels.id),
      );
    return rows.map(toChannelRosterEntry);
  }

  async ensureDefaultChannelExistsRecord(
    organizationId: number,
    ownerUserId: number,
  ): Promise<void> {
    // 첫 채널 provisioning. 유니크 + onConflictDoNothing 이라 경합에 안전하고 이미 있으면 no-op
    await marketingDb
      .insert(marketingChannels)
      .values({
        organizationId,
        ownerUserId,
        name: DEFAULT_CHANNEL_NAME,
        sortOrder: 0,
      })
      .onConflictDoNothing();
  }

  async findOneChannelRecordById(
    organizationId: number,
    ownerUserId: number,
    id: number,
  ): Promise<ChannelEntity | null> {
    const [row] = await marketingDb
      .select({
        id: marketingChannels.id,
        name: marketingChannels.name,
      })
      .from(marketingChannels)
      .where(and(eq(marketingChannels.id, id), ownerScope(organizationId, ownerUserId)));
    return row ? toChannelEntity(row) : null;
  }

  async findOneChannelRecordByName(
    organizationId: number,
    ownerUserId: number,
    name: string,
  ): Promise<ChannelEntity | null> {
    const [row] = await marketingDb
      .select({
        id: marketingChannels.id,
        name: marketingChannels.name,
      })
      .from(marketingChannels)
      .where(and(eq(marketingChannels.name, name), ownerScope(organizationId, ownerUserId)));
    return row ? toChannelEntity(row) : null;
  }

  async countChannelRecords(organizationId: number, ownerUserId: number): Promise<number> {
    const [row] = await marketingDb
      .select({ total: count() })
      .from(marketingChannels)
      .where(ownerScope(organizationId, ownerUserId));
    return Number(row?.total ?? 0);
  }

  async createChannelRecord(
    organizationId: number,
    ownerUserId: number,
    name: string,
  ): Promise<ChannelEntity> {
    // 새 채널은 본인 목록의 맨 끝에 붙임(sort_order = 현재 최대 + 1)
    const [agg] = await marketingDb
      .select({ maxOrder: max(marketingChannels.sortOrder) })
      .from(marketingChannels)
      .where(ownerScope(organizationId, ownerUserId));
    const isFirst = agg?.maxOrder == null;
    const nextOrder = isFirst ? 0 : Number(agg.maxOrder) + 1;
    // 이름 중복은 서비스가 선행 검증하므로 여기선 그대로 삽입
    const [row] = await marketingDb
      .insert(marketingChannels)
      .values({ organizationId, ownerUserId, name, sortOrder: nextOrder })
      .returning({
        id: marketingChannels.id,
        name: marketingChannels.name,
      });
    return toChannelEntity(row);
  }

  async updateChannelRecord(
    organizationId: number,
    ownerUserId: number,
    id: number,
    name: string,
  ): Promise<ChannelEntity> {
    await marketingDb
      .update(marketingChannels)
      .set({ name })
      .where(and(eq(marketingChannels.id, id), ownerScope(organizationId, ownerUserId)));
    return toChannelEntity({ id, name });
  }

  async deleteChannelRecord(
    organizationId: number,
    ownerUserId: number,
    id: number,
  ): Promise<boolean> {
    const deleted = await marketingDb
      .delete(marketingChannels)
      .where(and(eq(marketingChannels.id, id), ownerScope(organizationId, ownerUserId)))
      .returning({ id: marketingChannels.id });
    return deleted.length > 0;
  }

  async reorderChannelRecords(
    organizationId: number,
    ownerUserId: number,
    orderedIds: number[],
  ): Promise<void> {
    // orderedIds 순서대로 sort_order 를 0..n-1 로 지정(한 트랜잭션, 본인 채널만)
    // 남의 id 가 섞여 와도 where 가 걸러 no-op
    await marketingDb.transaction(async (tx) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await tx
          .update(marketingChannels)
          .set({ sortOrder: i })
          .where(
            and(eq(marketingChannels.id, orderedIds[i]), ownerScope(organizationId, ownerUserId)),
          );
      }
    });
  }
}
