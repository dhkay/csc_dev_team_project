// 기획서 생성 데이터 접근(브라우저)
// BFF(POST /api/marketing/channels/:id/plans/generate) frontClient 호출. 값 = 기획안 배열(개수는 선택값)
import { frontClient } from '$lib/infrastructure/http/clientInstances';
import { ROUTES } from '$lib/infrastructure/http/apiRoutes';
import type {
  ConceptChoice,
  GeneratedPlans,
  PlanGenerationRequest,
  PlanPromptView,
  ImageEngineLoad,
} from '../types';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import { run, type ApiResult } from './result';
import { versionQuery } from './versionQuery';

// 버전은 쿼리로 싣는다: 프롬프트 조립 규칙과 모델 슬롯이 버전마다 갈린다(versionQuery 주석 참고)
const base = (v: VersionMode, channelId: number) =>
  `${ROUTES.MARKETING.CHANNELS}/${channelId}/plans/generate?${versionQuery(v)}`;
const sceneImageBase = (v: VersionMode, channelId: number) =>
  `${ROUTES.MARKETING.CHANNELS}/${channelId}/plans/scene-image?${versionQuery(v)}`;
const promptBase = (v: VersionMode, channelId: number) =>
  `${ROUTES.MARKETING.CHANNELS}/${channelId}/plan-prompt?${versionQuery(v)}`;

/**
 * 선택 브랜드/컨셉 + 선택 개수(기획안/씬) + 인포그래픽 배제로 기획서 생성
 *
 * signal 로 취소 가능하다. 수십 초 걸리는 LLM 호출이라, 배치를 지운 뒤에도 계속 도는 것을 막는 수단이
 * 있어야 한다(씬 이미지 생성이 이미 같은 형태다). 다만 abort 는 이 서버와의 소켓을 닫을 뿐이고,
 * csc-marketing 이 language-model 로 이미 보낸 요청까지 끊지는 못한다(그건 그쪽 취소 경로가 필요하다)
 */
export function generatePlans(
  version: VersionMode,
  channelId: number,
  req: PlanGenerationRequest,
  signal?: AbortSignal,
): Promise<ApiResult<GeneratedPlans>> {
  return run<GeneratedPlans>(() =>
    frontClient().POST(base(version, channelId), req, { signal }),
  );
}

/** 한 씬 이미지 생성: 선택 브랜드/컨셉 + 목적 키워드 + 씬 내용. 결과는 inline data URL. signal 로 취소 가능 */
export function generateSceneImage(
  version: VersionMode,
  channelId: number,
  input: {
    brandName: string;
    // 그 기획안을 만들 때 쓴 연출 축 조합(저장된 스냅샷). 생략하면 세트의 현재 조합을 쓴다.
    // 보내는 이유: 세트가 그 사이 바뀌었으면 처음 만든 그림과 화풍이 어긋난다.
    concepts?: ConceptChoice[];
    // 씬의 영어 시각 브리프(PlanScene.imagePrompt): 이미지 모델이 읽는 유일한 씬 내용
    imagePrompt: string;
    proposalTitle?: string;
    // 재시도 변주(같은 씬의 다른 버전). 기본 0.
    variant?: number;
  },
  signal?: AbortSignal,
): Promise<ApiResult<{ dataUrl: string; prompt: string }>> {
  // prompt = 실제로 이미지 모델에 보낸 최종 조립 결과(백엔드가 조립하므로 백엔드가 돌려준다)
  return run<{ dataUrl: string; prompt: string }>(() =>
    frontClient().POST(sceneImageBase(version, channelId), input, { signal }),
  );
}

/**
 * 이미지 엔진 부하(공유 GPU 큐) 조회: 자체 모델이면 { running, pending }, 외부면 null.
 * 응답 자체가 null 일 수 있어(큐 없는 벤더) ApiResult<ImageEngineLoad | null>.
 */
export function getImageEngineLoad(
  version: VersionMode,
): Promise<ApiResult<ImageEngineLoad | null>> {
  return run<ImageEngineLoad | null>(() =>
    frontClient().GET(`${ROUTES.MARKETING.IMAGE_ENGINE_LOAD}?${versionQuery(version)}`),
  );
}

/** 기획서 생성 프롬프트(고정 머리/꼬리 + 편집 중간 + 기본값) 조회 */
export function getPlanPrompt(
  version: VersionMode,
  channelId: number,
): Promise<ApiResult<PlanPromptView>> {
  return run<PlanPromptView>(() => frontClient().GET(promptBase(version, channelId)));
}

/** 편집 지침 저장(빈 값이면 기본값 리셋) */
export function setPlanPrompt(
  version: VersionMode,
  channelId: number,
  instructions: string,
): Promise<ApiResult<PlanPromptView>> {
  return run<PlanPromptView>(() =>
    frontClient().PUT(promptBase(version, channelId), { instructions }),
  );
}
