import { ApiProperty } from '@nestjs/swagger';
import { PlatformAssistantSettings } from '../../../../core/domain/assistant-settings.types';

/**
 * AI 어시스턴트 전역 설정
 * 어떤 모델을 쓸지는 조직이 정하므로 이 응답에는 담기지 않는다.
 */
export class PlatformAssistantSettingsResponseDto implements PlatformAssistantSettings {
  @ApiProperty({
    description: '전체 사용 여부. 끄면 모든 조직에서 대화가 차단된다',
    example: true,
  })
  globalEnabled: boolean;

  @ApiProperty({
    description: '모든 조직의 대화 앞에 붙는 공통 지시문. 없으면 null',
    example: '답변은 한국어로 한다.',
    nullable: true,
  })
  commonPrompt: string | null;
}
