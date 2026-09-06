import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChannelEntity, ChannelRosterEntry } from '../../domain';
import { ChannelPort } from '../ports/inbound';
import { ChannelRepositoryPort, CHANNEL_REPOSITORY_PORT } from '../ports/outbound';

/**
 * ChannelPort 구현: 개인 소유 작업 맥락 CRUD
 *
 * 모든 동작이 (조직, 소유자)로 스코프되어 별도 권한 검증이 없음
 * 불변식은 사람마다 채널 최소 하나. 없으면 목록 조회가 기본 채널을 만들고 마지막 하나는 삭제 거절
 * 이름 검증은 DTO 담당이고 중복은 선행 조회로 걸러 Conflict, 경합은 유니크 제약이 막음
 */
@Injectable()
export class ChannelService implements ChannelPort {
  constructor(
    @Inject(CHANNEL_REPOSITORY_PORT)
    private readonly repository: ChannelRepositoryPort,
  ) {}

  async listChannels(organizationId: number, ownerUserId: number): Promise<ChannelEntity[]> {
    const channels = await this.repository.findManyChannelRecords(organizationId, ownerUserId);
    if (channels.length > 0) return channels;
    // 채널이 하나도 없으면 기본 채널을 자동 생성해 "채널을 먼저 만드세요" 화면을 없앰
    await this.repository.ensureDefaultChannelExistsRecord(organizationId, ownerUserId);
    return this.repository.findManyChannelRecords(organizationId, ownerUserId);
  }

  listChannelRoster(organizationId: number): Promise<ChannelRosterEntry[]> {
    // 위와 달리 기본 채널을 만들지 않음. 남의 provisioning 을 대신 트리거하면 목록이 사실과 어긋남
    return this.repository.findChannelRoster(organizationId);
  }

  async createChannel(
    organizationId: number,
    ownerUserId: number,
    name: string,
  ): Promise<ChannelEntity> {
    const trimmedName = name.trim();
    const dupeName = await this.repository.findOneChannelRecordByName(
      organizationId,
      ownerUserId,
      trimmedName,
    );
    if (dupeName) {
      throw new ConflictException('이미 존재하는 채널 이름입니다.');
    }
    return this.repository.createChannelRecord(organizationId, ownerUserId, trimmedName);
  }

  async updateChannel(
    organizationId: number,
    ownerUserId: number,
    id: number,
    name: string,
  ): Promise<ChannelEntity> {
    const trimmedName = name.trim();
    const existing = await this.repository.findOneChannelRecordById(
      organizationId,
      ownerUserId,
      id,
    );
    if (!existing) {
      throw new NotFoundException('채널을 찾을 수 없습니다.');
    }
    const dupeName = await this.repository.findOneChannelRecordByName(
      organizationId,
      ownerUserId,
      trimmedName,
    );
    if (dupeName && dupeName.id !== id) {
      throw new ConflictException('이미 존재하는 채널 이름입니다.');
    }
    return this.repository.updateChannelRecord(organizationId, ownerUserId, id, trimmedName);
  }

  async deleteChannel(
    organizationId: number,
    ownerUserId: number,
    id: number,
  ): Promise<boolean> {
    // 마지막 채널은 삭제 불가. 재생성에 맡기면 사용자가 보기엔 채널이 사라지고 작업물까지 잃음
    const total = await this.repository.countChannelRecords(organizationId, ownerUserId);
    if (total <= 1) {
      throw new BadRequestException(
        '마지막 채널은 삭제할 수 없습니다. 이름을 바꾸거나 새 채널을 먼저 만드세요.',
      );
    }
    return this.repository.deleteChannelRecord(organizationId, ownerUserId, id);
  }

  async reorderChannels(
    organizationId: number,
    ownerUserId: number,
    orderedIds: number[],
  ): Promise<void> {
    // 중복 제거 + 정수만(경계 방어). 빈 배열이면 no-op
    const ids = [...new Set(orderedIds)].filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return;
    await this.repository.reorderChannelRecords(organizationId, ownerUserId, ids);
  }

  getChannel(
    organizationId: number,
    ownerUserId: number,
    id: number,
  ): Promise<ChannelEntity | null> {
    return this.repository.findOneChannelRecordById(organizationId, ownerUserId, id);
  }
}
