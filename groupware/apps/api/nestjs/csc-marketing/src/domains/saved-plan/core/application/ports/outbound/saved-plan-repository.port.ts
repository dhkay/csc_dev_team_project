import {
  SavedPlanEntity,
  WorkspaceLocation,
  SavedPlanScene,
  SavedPlanSceneImage,
} from '../../../domain';
import type { AudioAssetRef } from '../../../../../../shared/domain/audio';
import type {
  OwnerVersionScope,
  WorkspaceScope,
} from '../../../../../../shared/domain/workspace-scope';
import type { ConceptChoice } from '../../../../../channel-settings/core/domain';

/**
 * 저장 레코드 생성 입력
 * 조직, 작업자, 버전은 스코프 소유라 여기 없음(요청과 다른 버전으로 행을 만들 수 없게)
 */
export interface CreateSavedPlanRecord {
  location: WorkspaceLocation;
  channelId: number | null;
  brandName: string;
  // 멱등키. 부분 유니크가 (org, owner, key) 중복을 막음
  clientRequestId: string | null;
  // 생성 시점 연출 축 조합 스냅샷. 빈 배열은 세트 조합 그대로
  brandConcepts: ConceptChoice[];
  // 생성 시점에 고른 영상 모델. 빈 문자열은 미선택
  videoModel: string;
  // 생성 시점에 고른 세그먼트 연결 방식. 빈 문자열은 미선택
  segmentMode: string;
  title: string;
  summary: string;
  scenes: SavedPlanScene[];
  sceneImages: SavedPlanSceneImage[];
  // 기획안 전체 BGM(선택 시점 스냅샷)
  bgm: AudioAssetRef | null;
  // 생성에 쓰인 모델 스냅샷. 없으면 빈 문자열
  llmModel: string;
  imageModel: string;
}

/** 저장된 기획안 레포지토리 아웃바운드 포트 */
export interface SavedPlanRepositoryPort {
  /**
   * 스코프의 버전으로 행을 굳힌다(요청 버전 = 산출물 버전)
   * 멱등: clientRequestId 가 같으면 이미 만든 행을 반환해 사가 예약 단계의 재실행이 안전해짐
   */
  createRecord(
    scope: OwnerVersionScope,
    record: CreateSavedPlanRecord,
  ): Promise<SavedPlanEntity>;
  /**
   * 개인 워크스페이스 목록. 스코프는 (조직, 작업자, 채널, 버전) + location
   * 기획안 보관함은 미구현이고 소유와 공유 규칙이 달라 구현 시 별도 메서드를 추가
   */
  findRecordsByOwner(
    scope: WorkspaceScope,
    location: WorkspaceLocation,
  ): Promise<SavedPlanEntity[]>;
  /**
   * 내 저장본 단건. 스코프가 소유 검증을 함께 해 다른 버전이나 남의 id 는 null
   * location 은 걸지 않음(소유는 보안 경계, 위치는 제품 규칙이라 필요한 호출부에 둠)
   */
  findOneOwned(scope: OwnerVersionScope, id: number): Promise<SavedPlanEntity | null>;
  deleteRecordById(organizationId: number, id: number): Promise<boolean>;
  /**
   * 저장본의 씬과 씬이미지(jsonb) 교체 저장. 씬 편집 반영
   * 서비스가 소유 검증 후 새 배열을 계산해 전달하고 없는 id 는 null
   */
  updateScenesRecord(
    organizationId: number,
    id: number,
    scenes: SavedPlanScene[],
    sceneImages: SavedPlanSceneImage[],
  ): Promise<SavedPlanEntity | null>;
}

export const SAVED_PLAN_REPOSITORY_PORT = Symbol('SAVED_PLAN_REPOSITORY_PORT');
