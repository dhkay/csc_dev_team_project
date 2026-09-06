import { Module } from '@nestjs/common';
import { ChannelController } from './adapters/inbound/http/controllers';
import { ChannelService } from './core/application/services';
import { ChannelRepositoryAdapter } from './adapters/outbound/db/marketingdb';
import { CHANNEL_PORT } from './core/application/ports/inbound';
import { CHANNEL_REPOSITORY_PORT } from './core/application/ports/outbound';

/**
 * 채널 도메인: 조직이 공유하는 작업 맥락 CRUD.
 *
 * 마케팅 도메인의 바닥이다. 단어/설정/기획 도메인이 채널 존재를 확인하려고 이 모듈을 import 한다.
 * 반대 방향은 없다(채널은 그 도메인들을 모른다). 그래서 여기에 의존성을 추가할 때는 순환이 생기지
 * 않는지 먼저 확인한다.
 */
@Module({
  controllers: [ChannelController],
  providers: [
    { provide: CHANNEL_PORT, useClass: ChannelService },
    { provide: CHANNEL_REPOSITORY_PORT, useClass: ChannelRepositoryAdapter },
  ],
  exports: [CHANNEL_PORT],
})
export class ChannelModule {}
