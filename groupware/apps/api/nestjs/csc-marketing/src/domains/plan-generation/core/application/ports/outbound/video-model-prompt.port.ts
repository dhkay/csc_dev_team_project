import { VideoModelPromptDescriptor } from '../../../domain';

/**
 * video-model 이 서빙하는 자기 프롬프트 서술을 가져오는 아웃바운드 포트
 * 씬 모션 프롬프트는 video-model 이 원문의 주인이라 베껴 두면 화면이 조용히 옛 값을 보여줌
 */
export interface VideoModelPromptPort {
  /** 조회 실패 시 null: 프로세스 뷰가 마지막으로 알려진 값으로 폴백한다(화면이 비지 않게) */
  getPromptDescriptor(): Promise<VideoModelPromptDescriptor | null>;
}

export const VIDEO_MODEL_PROMPT_PORT = Symbol('VIDEO_MODEL_PROMPT_PORT');
