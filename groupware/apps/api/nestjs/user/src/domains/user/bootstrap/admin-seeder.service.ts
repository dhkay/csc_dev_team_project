import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../core/domain/types/user.types';
import {
  PLATFORM_ADMIN_REPOSITORY_PORT,
  PlatformAdminRepositoryPort,
} from '../core/application/ports/outbound/platform-admin-repository.port';
import {
  PASSWORD_HASHER_PORT,
  PasswordHasherPort,
} from '../core/application/ports/outbound/password-hasher.port';

/**
 * 플랫폼 슈퍼관리자 시더: 환경변수(PLATFORM_ROOT_EMAIL/PLATFORM_ROOT_PASSWORD)를 단일 출처로
 * 벤더(플랫폼) ROOT 를 platform_admins 테이블에 부트스트랩한다. 이 계정으로 control-tower 에서 조직을 관리한다.
 * 조직(테넌트) 개념과 무관하다. email 전역 유일이라 단순 idempotent(없으면 생성, 비번 바뀌면 갱신)
 * 멀티테넌시 설계: .claude/rules/multi-tenancy.md
 */
@Injectable()
export class AdminSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminSeederService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(PLATFORM_ADMIN_REPOSITORY_PORT)
    private readonly platformAdminRepository: PlatformAdminRepositoryPort,
    @Inject(PASSWORD_HASHER_PORT)
    private readonly passwordHasher: PasswordHasherPort,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // 시드는 best-effort 다. 어떤 실패도 부팅을 죽이지 않는다(로그만 남기고 진행)
    try {
      const email = this.config.get<string>('PLATFORM_ROOT_EMAIL');
      const password = this.config.get<string>('PLATFORM_ROOT_PASSWORD');

      if (!email || !password) {
        this.logger.warn('PLATFORM_ROOT_EMAIL/PASSWORD 미설정: 플랫폼 루트 시드 건너뜀');
        return;
      }

      const existing = await this.platformAdminRepository.findOneRecordByEmail(email);

      if (!existing) {
        const passwordHash = await this.passwordHasher.hash(password);
        await this.platformAdminRepository.createRecord({
          email,
          passwordHash,
          name: '플랫폼 루트관리자',
          role: UserRole.ROOT,
        });
        this.logger.log(`플랫폼 루트 생성: ${email}`);
        return;
      }

      // env 비밀번호가 바뀌었으면 해시 갱신(env 를 단일 출처로 유지)
      const matched = await this.passwordHasher.compare(password, existing.passwordHash);
      if (!matched) {
        const passwordHash = await this.passwordHasher.hash(password);
        await this.platformAdminRepository.updatePasswordHashRecord(existing.id, passwordHash);
        this.logger.log(`플랫폼 루트 비밀번호 갱신: ${email}`);
      } else {
        this.logger.log(`플랫폼 루트 확인됨: ${email}`);
      }
    } catch (err) {
      this.logger.error(
        `플랫폼 루트 시드 실패(부팅은 계속한다): ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
