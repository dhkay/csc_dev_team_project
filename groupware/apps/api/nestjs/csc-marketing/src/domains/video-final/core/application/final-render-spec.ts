import { FinalRenderSpec } from './ports/outbound';

/**
 * 최종 합성 스펙이 참조하는 file-upload uploadId(원천 영상 + 프레임 + 아웃트로) 수집: 사전검증 대상
 *
 * 생성 사가와 재렌더가 함께 쓴다. 서비스 파일의 private 로 두면 사가가 복제하게 되고, 두 경로가
 * 다른 집합을 검증하면 한쪽만 doomed 잡을 막는다.
 */
export function collectFinalAssetIds(spec: FinalRenderSpec): string[] {
  return [spec.sourceUploadId, spec.frameUploadId, spec.outroUploadId].filter(
    (x): x is string => !!x,
  );
}
