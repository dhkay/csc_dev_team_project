import { Module } from '@nestjs/common';
import { ChannelModule } from '../channel/channel.module';
import {
  BrandConceptCatalogController,
  EntryPreferencesController,
  UserToolSettingsController,
} from './adapters/inbound/http/controllers';
import { ChannelSettingsService } from './core/application/services';
import {
  ChannelSettingsRepositoryAdapter,
  UserToolSettingsRepositoryAdapter,
} from './adapters/outbound/db/marketingdb';
import { DataCollectorAdapter } from './adapters/outbound/http/data-collector-api';
import { DataCollectorApiClientService } from '../../shared/adapters/outbound/data-collector-api';
import { MarketingServiceTokenService } from '../../shared/adapters/outbound/service-token';
import { CHANNEL_SETTINGS_PORT } from './core/application/ports/inbound';
import {
  CHANNEL_SETTINGS_REPOSITORY_PORT,
  DATA_COLLECTOR_PORT,
  USER_TOOL_SETTINGS_REPOSITORY_PORT,
} from './core/application/ports/outbound';

/**
 * 설정 도메인: 개인 도구 설정(버전별 모델과 브랜드컨셉, 버전 무관 진입 취향)
 * + 채널 설정(기획 프롬프트, 버전별) + 키워드 후보 수집(수집 서버 위임)
 *
 * 컨트롤러가 둘인 이유: 진입 취향은 경로에 버전을 받으면 순환이고 한 클래스는 접두사가 하나
 * 테이블도 둘: 모델과 브랜드/컨셉은 유저당 1행, 기획 프롬프트 지침은 (채널, key)당 1행
 * 소스 카탈로그는 수집기 소유라 이 서버가 판단하지 않고 화면에 내보내는 표면도 없음
 * ChannelModule 은 채널 존재 검증(CHANNEL_PORT.getChannel) 전용
 */
@Module({
  imports: [ChannelModule],
  controllers: [
    BrandConceptCatalogController,
    UserToolSettingsController,
    EntryPreferencesController,
  ],
  providers: [
    { provide: CHANNEL_SETTINGS_PORT, useClass: ChannelSettingsService },
    // 채널별 설정 KV(지금 담는 key 는 기획 프롬프트 지침 하나다)
    {
      provide: CHANNEL_SETTINGS_REPOSITORY_PORT,
      useClass: ChannelSettingsRepositoryAdapter,
    },
    // 개인 도구 설정(조직 안에서 유저당 1행): 모델 선택, 브랜드컨셉, 진입 버전, 진입 채널
    {
      provide: USER_TOOL_SETTINGS_REPOSITORY_PORT,
      useClass: UserToolSettingsRepositoryAdapter,
    },
    // 수집 서버 위임(키워드 원천 조회 + 소스 카탈로그). 이 서버는 수집을 하지 않는다.
    { provide: DATA_COLLECTOR_PORT, useClass: DataCollectorAdapter },
    DataCollectorApiClientService, // data-collector 타깃 공유 클라이언트(싱글톤)
    MarketingServiceTokenService, // 이 앱의 서비스 토큰(타깃 무관: 신원은 하나)
  ],
  // 소비자: plan-generation(브랜드/컨셉, 개인 AI 모델, 편집 지침), video-project(개인 AI 모델)
  exports: [CHANNEL_SETTINGS_PORT],
})
export class ChannelSettingsModule {}
