import { Inject, Injectable } from '@nestjs/common';
import { AiToolCatalogItem } from '../../domain/types';
import {
  AiToolNotFoundError,
  AiToolSlugAlreadyExistsError,
  InvalidAiToolSlugError,
} from '../../domain/errors';
import {
  AiToolCatalogPort,
  UpdateAiToolInput,
} from '../ports/inbound/ai-tool-catalog.port';
import { isReservedSlug } from '../../domain/types';
import {
  USER_REPOSITORY_PORT,
  UserRepositoryPort,
} from '../ports/outbound/user-repository.port';

const SLUG_PATTERN = /^[a-z0-9-]+$/;

/**
 * AI 도구 카탈로그: 표시명/slug 관리(플랫폼). key/enum 은 고정, 추가/삭제 없음
 * 카탈로그는 userdb 소유(엔타이틀먼트 설계: .claude/rules/multi-tenancy.md)
 */
@Injectable()
export class AiToolCatalogService implements AiToolCatalogPort {
  constructor(
    @Inject(USER_REPOSITORY_PORT)
    private readonly userRepository: UserRepositoryPort,
  ) {}

  async listAiToolCatalog(): Promise<AiToolCatalogItem[]> {
    return this.userRepository.listAiToolCatalogRecords();
  }

  async updateAiTool(key: string, patch: UpdateAiToolInput): Promise<AiToolCatalogItem> {
    const existing = await this.userRepository.findAiToolRecordByKey(key);
    if (!existing) {
      throw new AiToolNotFoundError(key);
    }

    if (patch.slug !== undefined && patch.slug !== existing.slug) {
      if (!SLUG_PATTERN.test(patch.slug)) {
        throw new InvalidAiToolSlugError('slug 은 소문자/숫자/하이픈만 허용합니다.');
      }
      if (isReservedSlug(patch.slug)) {
        throw new InvalidAiToolSlugError(`예약된 slug 입니다: ${patch.slug}`);
      }
      const conflict = await this.userRepository.findAiToolRecordBySlug(patch.slug);
      if (conflict) {
        throw new AiToolSlugAlreadyExistsError(patch.slug);
      }
    }

    return this.userRepository.updateAiToolRecordByKey(key, patch);
  }
}
