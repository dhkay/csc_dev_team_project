import { Injectable } from '@nestjs/common';
import { VideoModelApiClientService } from '../../../../../../shared/adapters/outbound/video-model-api';
import { RenderStatus } from '../../../../core/domain';
import {
  FinalRenderPort,
  FinalRenderSpec,
  RenderJobStatus,
} from '../../../../core/application/ports/outbound';

/** video-model 잡 응답(필요 필드만). status 는 PENDING/PROCESSING/COMPLETED/FAILED. */
interface VideoJobResponse {
  id: string;
  status: string;
  result_file_id: string | null;
  error: string | null;
  progress: number | null;
  worker_alive: boolean | null;
}

/** video-model VideoJobStatus → 우리 RenderStatus 매핑. PENDING/PROCESSING = 아직 렌더 중 */
function toRenderStatus(status: string): RenderStatus {
  switch (status) {
    case 'COMPLETED':
      return 'COMPLETED';
    case 'FAILED':
      return 'FAILED';
    default:
      return 'RENDERING';
  }
}

/**
 * FinalRenderPort 구현: video-model `POST /video-jobs`(FINALIZE 잡 등록) / `GET /video-jobs/:id`(상태)
 * provider='finalize' 가 합성 어댑터로 디스패치되고, source_file_id=원천 영상, params 로 프레임/아웃트로를 넘긴다.
 */
@Injectable()
export class FinalRenderAdapter implements FinalRenderPort {
  constructor(private readonly client: VideoModelApiClientService) {}

  async createJob(spec: FinalRenderSpec, idempotencyKey?: string): Promise<string> {
    const res = await this.client.post<VideoJobResponse>('/video-jobs', {
      // 우리 이름을 접두사로 붙인다: 키의 유일성 범위가 video-model 전체라 다른 호출자와 겹칠 수 있다.
      client_request_id: idempotencyKey ? `csc-marketing:${idempotencyKey}` : null,
      type: 'FINALIZE',
      provider: 'finalize',
      source_file_id: spec.sourceUploadId,
      params: {
        aspect_ratio: spec.aspectRatio,
        frame_file_id: spec.frameUploadId,
        outro_file_id: spec.outroUploadId,
        // 오버레이: 제목(상단 전체구간) + 자막(하단 시간동기). 자막 트랙은 captions_file_id 로 fetch, 스타일은 여기
        title: spec.overlays.title.text,
        title_style: spec.overlays.title.style,
        subtitle_style: spec.overlays.subtitle.style,
        captions_file_id: spec.captionsUploadId,
      },
    });
    return res.id;
  }

  async getJobStatus(jobId: string): Promise<RenderJobStatus> {
    const res = await this.client.get<VideoJobResponse>(
      `/video-jobs/${encodeURIComponent(jobId)}`,
    );
    return {
      status: toRenderStatus(res.status),
      resultUploadId: res.result_file_id ?? null,
      error: res.error ?? null,
      progress: res.progress ?? null,
      workerAlive: res.worker_alive ?? null,
    };
  }

  async cancelJob(jobId: string): Promise<void> {
    // 응답 본문은 쓰지 않는다. 취소는 멱등이고 상태는 다음 조회에서 본다.
    await this.client.post(`/video-jobs/${encodeURIComponent(jobId)}/cancel`);
  }
}
