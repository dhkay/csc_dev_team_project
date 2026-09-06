// 버전별 화면 구성. 두 버전이 갈리는 자리를 한 곳에 모음
// 흩어져 있으면 새 버전을 붙일 때 어디를 고칠지 모르고, 한 곳을 빠뜨리면 그 자리만 다른 버전처럼 보임
// `Record<VersionMode, …>` 라 값 공간에 버전을 더하면 컴파일이 빠진 프로필을 잡음
// 담는 것은 화면 구성뿐. 파이프라인이 갈리는 자리는 백엔드의 버전별 구현이고 데이터가 갈리는 자리는
// 주소의 버전 세그먼트. 어떤 AI 모델을 쓰는가는 `aiModelOptions.ts` 소유
// (모델 목록과 기본은 같이 움직여야 하고 둘 다 카탈로그의 사실이라 여기로 끌어오면 갈라지기 때문)

import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import type { WorkspaceSection, WorkspaceTab } from './workspaceUrl';

/**
 * 생성 모달의 입력 방식. 버전 사이가 아니라 버전 안에서 갈리는 축
 *   concept  브랜드와 컨셉, 목적 키워드를 골라 기획안을 받음
 *   prompt   만들 영상을 직접 문장으로 적음
 * 프로필이 갖는 이유: 어느 버전이 어떤 방식을 쓰는지가 곧 화면 구성이고, 화면마다 다시 판단하면
 * 이 파일이 막으려던 것(버전 조건이 흩어지는 것)이 그대로 재현되기 때문
 */
export type CreateMode = 'concept' | 'prompt';

/** 한 입력 방식의 표시 문구. 값과 표시를 나눠야 문구를 고쳐도 저장과 비교가 흔들리지 않음 */
export interface CreateModeMeta {
  // 탭에 보이는 이름. 탭이 좁아 제목보다 짧다.
  readonly label: string;
  // 본문 머리의 제목
  readonly title: string;
  // 제목 아래 한 줄: 이 방식으로 무엇을 하는지. 화면 이름은 되풀이하지 않음
  readonly description: string;
}

export const CREATE_MODE_META: Record<CreateMode, CreateModeMeta> = {
  concept: {
    label: '컨셉입력',
    title: '컨셉 입력',
    description: '씬 내용과 카테고리를 선택해 영상 컨셉을 구성하세요.',
  },
  prompt: {
    label: '프롬프트',
    title: '프롬프트',
    // 컨셉입력에서 옮겨 오면 브랜드와 카테고리 선택이 통째로 사라짐. 설명이 그것을 말해야 칸이
    // 없어진 것을 오류로 읽지 않고, 적지 않으면 아무도 정해 주지 않는다는 사실도 전달
    description: '만들 영상을 문장으로 직접 적습니다. 고르는 것 없이 적지 않은 것은 AI 가 정합니다.',
  },
};

export interface VersionProfile {
  // 이 버전에 존재하는 섹션. 배열 순서 = nav 순서, 서버 게이트도 이 목록 참조
  readonly sections: readonly WorkspaceSection[];
  // 생성 버튼 라벨. v1.5 는 흐름의 목적지('영상 생성'), v1.0 은 만들어지는 산출물('기획서 생성')
  // 여는 모달과 동작은 두 버전 동일
  readonly createLabel: string;
  // 제작 3단계 라벨. key 는 두 버전 공통(?tab= 링크가 버전을 옮겨도 유지)
  // 탭이 없는 버전에서는 탭 이름이 아니라 한 화면에 쌓인 구역의 제목
  readonly tabLabels: Record<WorkspaceTab, string>;
  // 워크스페이스에 제작 단계 전환 토글이 있는가
  // v1.0 전용. 순서대로 밟는 구성이라 현재 단계가 곧 화면의 상태
  // v1.5 는 만들면 바로 영상이 나와 단계 전환이 한 번 더 눌러야 하는 빈 조작
  // 끄면 세 구역이 한 화면에 쌓이고 주소가 아니라 선택이 그 자리를 대신(page 의 `stage`)
  readonly hasStageTabs: boolean;
  // 워크스페이스가 보여주는 제작 구역
  // v1.0 은 셋을 순서대로(기획안 → 원천 영상 → 프레임 적용), v1.5 는 영상 하나
  // 그 버전의 '영상 생성' 은 한 번 눌러 최종까지 만들고, 기획안은 도중에 저장되는 중간 산출물
  // 세트를 입힌 배포본이라는 별도 산출물도 없음(그 버전에는 에셋 화면이 없다)
  // 목록의 첫 구역이 라이브 배치가 마운트되는 자리. 다만 곧 보인다는 뜻은 아니고, v1.5 는 완성
  // 전까지 아무것도 그리지 않음(그동안의 일은 생성 진행 화면이 말한다)
  // 그래도 배치는 마운트 필요. 자동 저장이 거기서 돌기 때문
  readonly workspaceStages: readonly WorkspaceTab[];
  // 보관함에 담기는 산출물이 어느 구역의 것인가
  // 보관함은 화면 하나이고 버전마다 따로 있지 않음. 갈리는 것은 그 안에 무엇이 들어가는가
  // `workspaceStages` 의 마지막 값과 지금은 같지만 그것으로 대신하지 않음. 이 값이 서버가 어느
  // 표에 쓰는지를 정하고(lib/server/marketing/archiveTarget) 틀리면 조용히 다른 표를 고치기 때문
  readonly archiveSource: Extract<WorkspaceTab, 'source' | 'final'>;
  // 영상을 이루는 조각 하나를 부르는 이름. 클립 하나 = 그 단위 하나
  // 기획서를 뽑아 고르는 버전은 기획안 안의 씬, 영상 한 편이 목적지인 버전은 동영상
  // 프로필이 갖는 이유: 이 이름이 화면 여러 곳에 나와(가격표의 호출 횟수, 생성 폼의 개수)
  // 자리마다 다시 정하면 같은 것을 두 이름으로 부르게 되기 때문
  readonly segmentUnitLabel: string;
  // 생성 모달의 입력 방식(배열 순서 = 탭 순서, 첫 항목이 기본)
  // 둘 이상일 때만 탭을 그림. 하나뿐인데 그리면 고를 것이 없는 탭이 자리만 차지
  readonly createModes: readonly CreateMode[];
  // 생성 모달 본문 머리의 윗줄: 이 흐름이 무엇을 만드는지
  // 헤더 제목(`createLabel`)은 지금 누른 동작의 이름, 이쪽은 그 동작이 향하는 산출물
  // 입력 방식이 여럿이면 제목이 방식 이름으로 바뀌어 무엇을 만드는 중인지 말할 줄이 따로 필요
  // 방식이 하나뿐이면 그리지 않음(제목이 이미 말한 것의 되풀이)
  readonly createEyebrow: string;
  // 컨셉입력 폼에 직접 적는 지시 칸('씬 / 사용자 입력사항', '제한사항 입력')이 있는가
  // 두 칸을 한 플래그로 묶는 이유: 무엇을 담을지와 무엇을 피할지가 같은 결정의 앞뒤라 늘 함께이기 때문
  // v1.5 전용. 영상 한 편이 목적지라 직접 지시하는 자리가 필요하고, v1.0 은 기획서를 여러 개 뽑아
  // 고르는 흐름이라 그 지시가 선택의 폭을 좁힘. `hasPlanCompose` 와 배타
  readonly hasDirectBriefs: boolean;
  // 컨셉입력 폼에 '기획서 구성'(기획안 개수, 씬 개수) 섹션이 있는가
  // v1.0 전용. 여러 개를 뽑아 고르는 흐름이라 몇 개를 몇 씬으로 만들지가 선택
  // v1.5 는 그 구성을 '씬 / 사용자 입력사항' 이 정해, 두면 같은 것을 두 곳에서 정하게 됨
  // 없으면 개수는 고르는 값이 아니라 그 버전의 고정값(planComposeOptions)
  // '인포그래픽 배제' 토글은 이 섹션 안이라 따로 플래그 없음
  readonly hasPlanCompose: boolean;
  // 생성 폼에 영상 설정 묶음(영상 모델, 세그먼트 연결 방식, 나레이션)이 있는가
  // v1.5 전용. 생성 시점에 어느 모델로 어떻게 이어붙일지가 선택이고 그 값이 예약 행에 스냅샷으로
  // 남아 렌더까지 감. v1.0 은 모델이 하나뿐이고 이어붙이는 방식도 파이프라인이 정함
  // `hasDirectBriefs` 와 따로 두는 이유: 무엇을 적을지와 무엇으로 만들지가 다른 결정이기 때문
  readonly hasVideoSettings: boolean;
  // 생성 모달 헤더에 '기획서 생성 프롬프트' 편집 바로가기가 있는가
  // v1.0 전용. 그 버전의 모달은 제목이 '기획서 생성' 이라 이 버튼이 지금 만드는 것을 가리킴
  // v1.5 의 모달은 '영상 생성' 이고 기획안은 중간 산출물이라 헤더가 다른 이야기를 하게 되며,
  // 프롬프트 단계가 여럿이라 그중 하나만 헤더로 끌어올리는 것이 임의적
  // 없애도 편집 경로는 남음. 같은 편집기를 프로세스 섹션이 사슬 문맥 안에서 연다.
  readonly hasPlanPromptShortcut: boolean;
  // 생성 버튼을 누르면 모달이 진행 화면으로 바뀌는가
  // v1.5 전용. 한 번 누르면 영상 한 편이 나올 때까지 이어지고 그 사이가 길어 어디까지 갔는지 볼
  // 자리가 필요. v1.0 은 그 단계를 밟지 않아(기획서 여러 벌이 산출물) 일어나지도 않을 병합과
  // 업로드를 기다리게 되고, 이미 그리드 타일이 기획안 도착을 하나씩 보여줌
  readonly hasGenerationProgress: boolean;
  // 끝내지 않은 일로 돌아가는 길을 두는가
  // 두 가지를 함께 켠다. 화면 아래 탭(돌고 있는 작업 + 적어 둔 초안)과, 새로고침 뒤 창을 그 자리로
  // 다시 세우는 것. 한 결정이라 한 플래그다: 둘 다 "하던 일이 화면과 함께 사라지지 않는다" 는 약속
  // v1.5 전용. 그 버전은 창을 닫아도 생성이 계속되는데 돌아갈 길이 없었고, 완성본은 마지막에
  // 배치해야 워크스페이스에 남아서 돌아가지 못하면 만든 영상을 잃음
  // `hasGenerationProgress` 로 대신하지 않는 이유: 진행 화면을 두는가와 그리로 돌아갈 자리를
  // 셸에 두는가는 다른 결정이고, 뒤엣것은 이 도구 셸의 구성이라 나중에 다른 목록(열어 둔 영상 등)이
  // 같은 줄을 함께 쓸 수 있음. 지금은 두 값이 같을 뿐 같은 것이 아님
  readonly hasWorkContinuity: boolean;
}

/**
 * v1.5: 에셋을 화면에서 걷어낸 구성. 영상 한 편이 목적지라 탭 라벨도 산출물의 이름
 * 보관함은 v1.5 에도 둠. 완성본을 작업 공간에서 내보내 모아 두는 자리라 영상 생성이 목적인 구성에서
 * 오히려 더 필요(화면 자체는 버전과 무관하고 담기는 것만 갈린다)
 * 보관함은 조직 공용. 누가 만든 것이든 그 조직의 보관물이면 함께 보임
 */
const V15: VersionProfile = {
  sections: ['workspace', 'archive', 'process', 'price', 'log', 'settings'],
  createLabel: '영상 생성',
  // 구역이 하나뿐이라 라벨이 화면에 뜨지 않음. 값은 둔다: TABS 를 두 버전이 공유하고
  // ?tab= 링크가 버전을 넘어와도 라벨을 찾을 수 있어야 한다.
  tabLabels: { plan: '기획안', source: '영상', final: '최종 영상' },
  // 만들면 바로 영상이 나오는 구성이라 단계를 오가는 조작이 불필요
  hasStageTabs: false,
  workspaceStages: ['source'],
  // 최종 구역이 없어 그 하나뿐인 영상 구역의 완성본이 그대로 보관됨
  archiveSource: 'source',
  segmentUnitLabel: '동영상',
  // 영상 한 편이 목적지라 들어가는 길이 둘(컨셉에서 출발하거나 직접 적거나)
  createModes: ['concept', 'prompt'],
  createEyebrow: 'AI 숏츠 생성',
  hasDirectBriefs: true,
  hasPlanCompose: false,
  hasVideoSettings: true,
  hasPlanPromptShortcut: false,
  hasGenerationProgress: true,
  hasWorkContinuity: true,
};

/**
 * v1.0: 제작 3단계를 사람이 순서대로 밟는 구성. 탭 라벨이 그 단계에서 하는 일의 이름
 * '원천/최종' 은 우리끼리의 구분이라 밖에서는 무엇이 다른지 알 수 없고, '프레임 적용' 은 그 단계가
 * 실제로 하는 일이라 처음 보는 사람도 순서를 읽음
 * v1.5 와 갈라 두는 이유: 그 버전의 생성 버튼 라벨이 이미 '영상 생성' 이라 탭까지 같은 문구가 되면
 * 서로 다른 두 동작이 같은 이름으로 보이기 때문
 */
const V10: VersionProfile = {
  sections: ['workspace', 'assets', 'archive', 'process', 'price', 'log', 'settings'],
  createLabel: '기획서 생성',
  tabLabels: { plan: '기획안', source: '영상 생성', final: '프레임 적용' },
  // 세 단계를 순서대로 밟는 구성이라 현재 단계가 곧 화면의 상태
  hasStageTabs: true,
  workspaceStages: ['plan', 'source', 'final'],
  // 세트를 입힌 배포본이 이 버전의 완성물이라 보관함에 담기는 것도 그것
  archiveSource: 'final',
  segmentUnitLabel: '씬',
  createModes: ['concept'],
  createEyebrow: 'AI 기획서 생성',
  hasDirectBriefs: false,
  hasPlanCompose: true,
  hasVideoSettings: false,
  hasPlanPromptShortcut: true,
  hasGenerationProgress: false,
  // 돌아갈 진행 화면이 없다. 이 버전의 배치는 그리드 타일이 도착을 하나씩 보여주고 그것이 곧 진행이다.
  hasWorkContinuity: false,
};

const VERSION_PROFILES: Record<VersionMode, VersionProfile> = {
  'v1.5': V15,
  'v1.0': V10,
};

/** 그 버전의 화면 구성 */
export function versionProfile(version: VersionMode): VersionProfile {
  return VERSION_PROFILES[version];
}

/**
 * 그 버전에 이 섹션이 있는가. nav 가시성과 서버 게이트가 같은 값 참조
 * 가시성만 감추면 주소를 직접 열었을 때 그대로 들어가짐
 */
export function hasSection(version: VersionMode, section: WorkspaceSection): boolean {
  return versionProfile(version).sections.includes(section);
}
