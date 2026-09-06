// 파일업로드 스토리지 아웃바운드 포트(공유): file-upload 의 자산 확정, 조회, 제거 위임
// 메서드마다 실패 계약이 다름. 삭제는 best-effort, 확정과 조회는 결과 반환
// 계약: docs/specs/marketing-write-consistency.md

/** 사전검증용 에셋 상태. file-upload 의 UPLOADED/PENDING, 없으면 MISSING */
export type AssetUploadStatus = 'UPLOADED' | 'PENDING' | 'MISSING';

/** 다건 삭제 결과. failed 가 비어 있으면 전부 삭제됨 */
export interface AssetDeleteResult {
  failed: string[];
}

/** 자산 확정, 조회, 제거 포트 */
export interface FileUploadStoragePort {
  /** 단건 삭제(공통 에셋과 세트 슬롯 등). 실패를 삼키고 경고만 남김 */
  deleteAsset(uploadId: string): Promise<void>;
  /**
   * 다건 삭제(저장 기획안 씬 이미지 등). 개별 실패를 삼키고 전체는 throw 하지 않음
   * 다만 실패한 id 는 반환하므로 호출부가 활동 로그에 남겨 고아를 추적
   */
  deleteAssets(uploadIds: string[]): Promise<AssetDeleteResult>;
  /**
   * 여러 에셋을 UPLOADED 로 확정(PENDING → UPLOADED). 하나라도 실패하면 throw
   * 미확정 자산을 참조하는 행이 커밋되면 그 이미지는 영원히 서빙되지 않아 best-effort 가 아님
   */
  confirmAssets(uploadIds: string[]): Promise<void>;
  /**
   * 여러 에셋의 업로드 상태 배치 조회(렌더 등록 전 사전검증). 없는 id 는 MISSING
   * 결과를 반환해 호출부가 미업로드 자산을 참조하는 doomed 잡을 차단
   */
  getAssetStatuses(uploadIds: string[]): Promise<Record<string, AssetUploadStatus>>;
}

export const FILE_UPLOAD_STORAGE_PORT = Symbol('FILE_UPLOAD_STORAGE_PORT');
