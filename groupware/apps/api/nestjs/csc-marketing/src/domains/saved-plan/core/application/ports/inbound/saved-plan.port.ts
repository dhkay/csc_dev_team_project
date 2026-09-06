import { SavedPlanEntity, SavedPlanScene, SavedPlanSceneImage } from '../../../domain';
import type { AudioAssetRef } from '../../../../../../shared/domain/audio';
import type {
  OwnerVersionScope,
  WorkspaceScope,
} from '../../../../../../shared/domain/workspace-scope';
import type { ConceptChoice } from '../../../../../channel-settings/core/domain';

/** 기획안 저장 입력(개인 워크스페이스). location 과 owner 는 서비스가 채움 */
export interface SavePlanInput {
  channelId: number | null;
  brandName: string;
  // 멱등키. 같은 키로 다시 저장하면 새 행을 만들지 않고 기존 행을 반환
  // 자동 저장은 기획안 하나당 한 번이라 키가 결정적(`배치:기획안` 형태)
  clientRequestId?: string | null;
  // 이 기획안을 만들 때 쓴 연출 축 조합(생성 시점 스냅샷). 빈 배열은 세트 조합 그대로
  brandConcepts: ConceptChoice[];
  // 이 기획안을 실제로 쓴 기획 LLM(생성 응답이 밝힌 모델). 필수
  // 선택으로 두면 빠뜨린 호출이 조용히 빈 값을 저장하고 그 값은 되메울 수 없음
  llmModel: string;
  // 이 기획안을 만들 때 고른 영상 모델. 빈 문자열이면 렌더 시 설정을 봄
  videoModel?: string;
  // 세그먼트 연결 방식. 빈 문자열이면 렌더 기본
  segmentMode?: string;
  title: string;
  summary: string;
  scenes: SavedPlanScene[];
  sceneImages: SavedPlanSceneImage[];
  // 기획안 전체 BGM(선택 시점 스냅샷). 씬 효과음은 scenes[].sfx 에 실림
  bgm: AudioAssetRef | null;
}

/**
 * 저장본 한 씬 편집 입력. 이미지 교체와 조립 프롬프트, 브리프 중 준 것만 반영
 * 재생성과 외부이미지 모두 새 uploadId 를 만들어 전달하고 서비스는 참조만 바꿈
 */
export interface UpdateSceneInput {
  index: number;
  // 새 이미지의 uploadId(재생성 결과 또는 외부 이미지). 이미지를 안 바꾸면 생략
  uploadId?: string;
  // 이 이미지를 만든 최종 조립 프롬프트(재생성 시). 외부 이미지엔 없어 생략
  prompt?: string;
  // 씬의 영어 브리프 수정값. 안 바꾸면 생략
  imagePrompt?: string;
}

/**
 * 저장된 기획안 Inbound Port: 개인 워크스페이스의 저장, 목록, 삭제
 * 스코프가 객체인 이유는 버전 누락 호출의 컴파일 차단이고, 단건에 채널이 없는 이유는 소유가 보안 경계라서
 */
export interface SavedPlanPort {
  savePersonal(
    scope: OwnerVersionScope,
    input: SavePlanInput,
  ): Promise<SavedPlanEntity>;
  /** 내 개인 워크스페이스 저장본 목록. 채널과 버전으로 분리됨 */
  listPersonal(scope: WorkspaceScope): Promise<SavedPlanEntity[]>;
  /** 내 개인 저장본 한 건 조회. 없거나 내 것이 아니거나 다른 버전이면 null */
  getPersonal(scope: OwnerVersionScope, id: number): Promise<SavedPlanEntity | null>;
  deletePersonal(scope: OwnerVersionScope, id: number): Promise<boolean>;
  /**
   * 내 개인 저장본의 한 씬 편집(브리프 수정, 이미지 교체)
   * 이미지가 바뀌면 이전 uploadId 를 스토리지에서 정리(best-effort)
   */
  updateScenePersonal(
    scope: OwnerVersionScope,
    id: number,
    input: UpdateSceneInput,
  ): Promise<SavedPlanEntity | null>;
}

export const SAVED_PLAN_PORT = Symbol('SAVED_PLAN_PORT');
