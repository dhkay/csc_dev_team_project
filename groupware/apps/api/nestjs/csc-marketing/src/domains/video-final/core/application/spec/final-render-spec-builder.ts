import { Injectable } from '@nestjs/common';
import { assertAssetsUploaded, FileUploadStoragePort } from '../../../../../shared/domain/storage';
import { overlaysFromSet } from '../../../../../shared/domain/overlay';
import { collectFinalAssetIds } from '../final-render-spec';
import type {
  FinalRenderSpec,
  FinalRenderSpecBuilder,
  FinalSpecInput,
} from '../ports/outbound';

/**
 * 최종 합성 스펙 조립(파이프라인 이음새 3/3의 현재 구현)
 *
 * 생성 사가와 재렌더 사가가 같은 규칙을 쓰게 하려고 두 곳에 흩어져 있던 조립을 여기로 모았다.
 * 두 경로가 다른 스펙을 만드는 어긋남은 렌더 결과에서만 드러난다(디버깅이 가장 비싼 종류)
 *
 * 협력자가 없다(입력만으로 스펙이 결정된다). 그래도 클래스인 이유는 DI 표에 실려 버전별로 교체되기
 * 때문이다: 갈리는 날 이 클래스 대신 다른 클래스를 그 슬롯에 꽂는다.
 */
@Injectable()
export class DefaultFinalRenderSpecBuilder implements FinalRenderSpecBuilder {
  buildSpec({ final, sourceUploadId, captionsUploadId }: FinalSpecInput): FinalRenderSpec {
    return {
      sourceUploadId,
      // 프레임/아웃트로/화면비는 행에 굳은 값이다: 세트가 그 사이 바뀌어도 예약한 것과 어긋나지 않는다.
      frameUploadId: final.frameUploadId,
      outroUploadId: final.outroUploadId,
      aspectRatio: final.aspectRatio,
      // 자막 트랙은 원천에서 재취득(최종이 번인한다)
      captionsUploadId,
      // 저장된 오버레이가 없으면(구 행) 세트 기본값으로 되돌린다: 렌더가 오버레이 없이는 못 돈다.
      overlays: final.overlays ?? overlaysFromSet(final.title, null),
    };
  }

  async assertSpecAssetsUploaded(
    storage: FileUploadStoragePort,
    spec: FinalRenderSpec,
  ): Promise<void> {
    await assertAssetsUploaded(storage, collectFinalAssetIds(spec));
  }
}
