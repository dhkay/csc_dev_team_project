import { Injectable, Logger } from '@nestjs/common';
import { VideoModelApiClientService } from '../../../../../../shared/adapters/outbound/video-model-api';
import { VideoModelPromptPort } from '../../../../core/application/ports/outbound';
import { VideoModelPromptDescriptor } from '../../../../core/domain';

/** video-model `GET /pipeline/prompts` 응답(snake_case) */
interface PipelinePromptsResponse {
  scene_motion: { content: string };
  // 롤링 배포 중에는 구 버전 서버가 이 필드 없이 응답한다. 없으면 호출측이 폴백을 쓴다.
  scene_dialogue?: { content: string };
  // 위와 같다(대사보다 늦게 서빙되기 시작한 값이라 더 오래 비어 올 수 있다)
  scene_narration?: { content: string };
}

/**
 * 서술 캐시 TTL: 프롬프트는 배포로만 바뀌는 사실상 정적 값이라 길게 잡는다.
 * 관리자 전용 화면 1건을 위해 매번 서버 간 홉을 태우지 않으면서, 배포 후에는 알아서 새 값을 집는다.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * VideoModelPromptPort 구현: video-model 이 내려주는 자기 프롬프트 서술을 가져온다(서비스토큰)
 *
 * 프로세스 화면은 읽기전용 부가 정보라 어떤 실패든 비파괴적으로 null 로 degrade 한다.
 * (호출측이 마지막으로 알려진 값으로 폴백). 실패를 그대로 던지면 페이지 전체가 깨진다.
 */
@Injectable()
export class VideoModelPromptAdapter implements VideoModelPromptPort {
  private readonly logger = new Logger(VideoModelPromptAdapter.name);
  private cached: { at: number; value: VideoModelPromptDescriptor } | null = null;

  constructor(private readonly client: VideoModelApiClientService) {}

  async getPromptDescriptor(): Promise<VideoModelPromptDescriptor | null> {
    const fresh = this.cached && Date.now() - this.cached.at < CACHE_TTL_MS;
    if (fresh && this.cached) return this.cached.value;

    try {
      const res = await this.client.get<PipelinePromptsResponse>('/pipeline/prompts');
      const motion = res?.scene_motion;
      if (!motion?.content) return this.cached?.value ?? null;

      const dialogue = res?.scene_dialogue;
      const narration = res?.scene_narration;
      const value: VideoModelPromptDescriptor = {
        sceneMotion: {
          content: motion.content,
        },
        // 구 버전 서버는 이 필드를 모른다. 그때는 싣지 않고 화면이 폴백을 쓰게 둔다(빈 문자열을
        //   실으면 화면에 빈 카드가 뜨는데, 그건 '없다' 가 아니라 '못 받았다' 이므로 거짓말이다)
        ...(dialogue?.content ? { sceneDialogue: { content: dialogue.content } } : {}),
        ...(narration?.content ? { sceneNarration: { content: narration.content } } : {}),
      };
      this.cached = { at: Date.now(), value };
      return value;
    } catch (err) {
      this.logger.warn(
        `video-model 프롬프트 서술 조회 실패. 폴백 사용: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
      // 만료된 캐시라도 있으면 그걸 쓴다(폴백 상수보다 최신)
      return this.cached?.value ?? null;
    }
  }
}
