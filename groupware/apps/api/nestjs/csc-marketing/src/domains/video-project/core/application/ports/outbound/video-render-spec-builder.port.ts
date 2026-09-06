import type { SavedPlanEntity } from '../../../../../saved-plan/core/domain';
import type { FileUploadStoragePort } from '../../../../../../shared/domain/storage';
import type { OwnerVersionScope } from '../../../../../../shared/domain/workspace-scope';
import type { AiModelSelection } from '../../../../../channel-settings/core/application/ports/inbound';
import type { VideoProjectEntity, VideoProjectScene } from '../../../domain';
import type { VideoRenderSpec } from './video-render.port';

/** 기획안에서 유도한 예약 행 재료 + 그 시점 스펙 */
export interface PreparedProjectSpec {
  aiModels: AiModelSelection;
  scenes: VideoProjectScene[];
  aspectRatio: string;
  resolution: string;
  spec: VideoRenderSpec;
}

/**
 * 파이프라인 이음새 2/3: 원천 영상 렌더 스펙 조립
 * provider 라우팅, TTS 기본값, 화질 결정, 씬 구성이 여기서 정해지고 버전마다 갈릴 수 있음
 * 선택은 VersionRegistry 가 하며 재렌더는 요청 버전이 아니라 행에 굳은 버전으로 고름
 */
export interface VideoRenderSpecBuilder {
  /** 저장 기획안 → 예약 행 재료 + 그 시점 스펙(자격증명은 붙이지 않는다) */
  prepareFromPlan(
    scope: OwnerVersionScope,
    plan: SavedPlanEntity,
    requestedResolution: string | null,
  ): Promise<PreparedProjectSpec>;
  /** 예약/기존 행 → 벤더로 나갈 스펙(자격증명 포함, 저장하지 않는다) */
  buildSpecFromRow(project: VideoProjectEntity): Promise<VideoRenderSpec>;
  /** 참조 자산이 실제로 UPLOADED 인지 사전검증(doomed 잡을 만들지 않는다) */
  assertSpecAssetsUploaded(storage: FileUploadStoragePort, spec: VideoRenderSpec): Promise<void>;
}

/** DI 토큰: `VersionRegistry<VideoRenderSpecBuilder>`. */
export const VIDEO_RENDER_SPEC_BUILDERS = Symbol('VIDEO_RENDER_SPEC_BUILDERS');
