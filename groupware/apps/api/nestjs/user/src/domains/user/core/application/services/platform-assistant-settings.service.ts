import { Inject, Injectable } from '@nestjs/common';
import {
  PlatformAssistantSettings,
  UpdatePlatformAssistantSettingsInput,
} from '../../domain/types';
import { PlatformAssistantSettingsPort } from '../ports/inbound/platform-assistant-settings.port';
import {
  USER_REPOSITORY_PORT,
  UserRepositoryPort,
} from '../ports/outbound/user-repository.port';

/**
 * 플랫폼 AI 어시스턴트 전역 설정: userdb 싱글톤 조회/수정(플랫폼 관리 위임)
 * 전역 설정은 킬스위치 + 공통 프롬프트 둘뿐이라 값 검증이 없다(모델 정책은 조직 몫). 설계: multi-tenancy.md
 */
@Injectable()
export class PlatformAssistantSettingsService implements PlatformAssistantSettingsPort {
  constructor(
    @Inject(USER_REPOSITORY_PORT)
    private readonly userRepository: UserRepositoryPort,
  ) {}

  async getSettings(): Promise<PlatformAssistantSettings> {
    return this.userRepository.findPlatformAssistantSettingsRecord();
  }

  async updateSettings(
    patch: UpdatePlatformAssistantSettingsInput,
  ): Promise<PlatformAssistantSettings> {
    return this.userRepository.updatePlatformAssistantSettingsRecord(patch);
  }
}
