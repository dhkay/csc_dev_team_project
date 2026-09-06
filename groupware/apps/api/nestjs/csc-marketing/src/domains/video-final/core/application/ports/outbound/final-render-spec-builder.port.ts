import type { FileUploadStoragePort } from '../../../../../../shared/domain/storage';
import type { VideoFinalEntity } from '../../../domain';
import type { FinalRenderSpec } from './final-render.port';

/** 최종 스펙 조립 입력: 행(생성 시점 스냅샷) + 원천에서 오는 두 값 */
export interface FinalSpecInput {
  // 최종 영상 행: 프레임/아웃트로/화면비/오버레이/제목의 출처(생성 시점에 굳었다)
  final: VideoFinalEntity;
  // 원천 결과물 uploadId: 합성의 바탕이 되는 영상
  sourceUploadId: string;
  // 원천 자막 트랙 uploadId(없으면 null): 최종이 번인한다.
  captionsUploadId: string | null;
}

/**
 * 파이프라인 이음새 3/3: 최종 합성 스펙 조립
 *
 * "완성된 원천에 무엇을 어떻게 입힐 것인가"(배경프레임, 아웃트로, 오버레이 스타일, 자막 번인)를
 * 담는다. v1.0 과 v1.5 는 제품으로 별개라 앞으로 이 규칙이 갈린다.
 *
 * 한 곳에 모은 것 자체가 먼저 필요한 정리였다: 생성 사가와 재렌더 사가가 같은 스펙을 각각
 * 조립하고 있어서, 한쪽만 고치면 그 차이가 렌더 결과에서만 드러났다.
 *
 * 선택은 `VersionRegistry<FinalRenderSpecBuilder>` 가 하며, 행에 굳은 버전으로 고른다.
 * (원천 렌더와 같은 규칙: 만든 규칙 그대로 다시 렌더돼야 한다)
 */
export interface FinalRenderSpecBuilder {
  buildSpec(input: FinalSpecInput): FinalRenderSpec;
  /** 참조 자산이 실제로 UPLOADED 인지 사전검증(doomed 잡을 만들지 않는다) */
  assertSpecAssetsUploaded(storage: FileUploadStoragePort, spec: FinalRenderSpec): Promise<void>;
}

/** DI 토큰: `VersionRegistry<FinalRenderSpecBuilder>`. */
export const FINAL_RENDER_SPEC_BUILDERS = Symbol('FINAL_RENDER_SPEC_BUILDERS');
