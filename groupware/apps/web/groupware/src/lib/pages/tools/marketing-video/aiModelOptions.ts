// AI 모델 카탈로그(SSOT): 설정 AI 모델 섹션의 선택지
// 구조: 역량(LLM / 영상 / 이미지 / 나레이션) → 경로(회사 직접 / 플랫폼 경유 / 키 불필요) → 벤더 → 모델
// key = 저장되는 모델 id(백엔드는 opaque), vendor = 만든 회사, 경로 = 그 모델에 닿는 길(accessRouteOf)
// 벤더와 경로는 갈린다. Kling 을 만든 곳은 Kling 이지만 요금은 중계 플랫폼 계정에 청구된다.
//
// 버전 축은 두 층이다. 역량의 versions 는 그 버전 파이프라인에 이 단계가 있는가이고, 모델의
// versions 는 그 버전이 이 모델을 쓰는가다. 둘 다 손으로 적지 않고 파이프라인 표
// (`@csc/tool-versions`)에서 파생한다. 계약: docs/specs/marketing-tool-versions.md
//
// 저장된 선택이 렌더 잡으로 가는 길은 csc-marketing 의 video-project-spec-builder 다(key 접두사가
// 라우트다). 그 규칙과 이 선언의 일치는 scripts/check-video-model-routes.mjs 가 지킨다.

import type { ApiProviderKey, ApiProviderKind } from '@csc/api-providers';
import {
  API_PROVIDER_KIND_META,
  API_PROVIDER_KINDS,
  findApiProvider
} from '$lib/features/api-credentials/types';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import { VERSION_MODES } from '$lib/shared/lib/versionMode/versionMode';
import { pipelineFor, type ToolVersionPipeline } from '@csc/tool-versions';

export type AiCapabilityKey = 'llm' | 'video' | 'image' | 'tts';
export type AiProviderKey = 'external' | 'internal';

export interface AiModelOption {
  // 저장 값 = 실제 모델 id
  key: string;
  label: string;
  // 선택 가이드(강점, 속도 등 짧게)
  description: string;
  // 외부/내부 그룹
  provider: AiProviderKey;
  // 만든 회사/브랜드. provider 그룹 안에서 다시 이 단위로 묶음
  vendor: string;
  // 붙어 있어(배포/연동) 고를 수 있는지. false 면 목록에서 제외
  available: boolean;
  // 이 모델을 노출할 도구 버전(미지정 = 전 버전)
  // available 과 축이 다르다. available 은 "우리가 붙였는가", 이쪽은 "그 버전의 제품이 쓰는가"
  // 빠진 버전에서는 목록에도 기본 모델에도 없다. 저장값을 읽는 쪽(findAiModelOption/describeAiModel)은
  // 이 축을 보지 않는다. 다른 버전에서 만든 산출물의 모델 이름은 계속 읽혀야 하기 때문
  versions?: readonly VersionMode[];
  // 아직 고를 수 없는 이유. 목록에는 남고 선택만 비활성된다("준비중")
  // available=false 와 다르다. 그쪽은 우리가 안 붙인 모델이라 감추고, 이쪽은 배선은 끝났는데 벤더가
  // 열지 않은 모델이라 남긴다. 지우면 고르는 사람이 그런 선택지가 있다는 것 자체를 모른다.
  // credentialProvider 게이팅과도 다름. 그쪽은 키를 등록하면 풀리지만 이쪽은 조직이 할 일 없음
  // 열리면 이 줄만 지운다(렌더러와 백엔드는 이 값을 모른다)
  comingSoon?: string;
  // 이 모델이 요구하는 조직 API 키의 프로바이더(`@csc/api-providers` 카탈로그 key)
  // 미등록이면 표시하되 선택 불가. 회사 키든 플랫폼 키든 같은 자리에 적는다(게이팅에 성격 구분 불필요)
  credentialProvider?: ApiProviderKey;
}

export interface AiCapability {
  // 저장 선택 객체의 필드명
  key: AiCapabilityKey;
  label: string;
  description: string;
  // 이 역량을 쓰는 버전(미지정 = 전 버전)
  // 옵션의 versions 와 층이 다르다. 이쪽은 "그 버전 파이프라인에 이 단계가 있는가"
  // 옵션을 전부 비우는 것으로 대신할 수 없다. 선택지가 빈 역량은 화면이 "준비중" 이라 말하는데
  // 그건 곧 생긴다는 뜻이라 쓰지 않기로 한 단계를 기다리게 만듦
  versions?: readonly VersionMode[];
  // 이 역량을 고정하는 버전과 그 모델 key. 고정된 버전에서는 고를 수 없고 이 모델이 쓰인다.
  // versions 와 층이 다르다(그 단계를 밟는가 vs 밟되 고를 수 있는가). 한 축으로 묶으면 고정을
  // 표현할 수 없다. 버전에서 빼면 호출은 나가는데 비용이 가격표에서 사라지고, 넣기만 하면 고를 수
  // 없는 선택기가 살아나 준비상태가 "고른 적 없다" 로 생성을 막음
  // 값은 파이프라인 표(pinnedPlanLlm)에서 파생한다. 서버가 부르는 모델과 화면이 말하는 모델이 같은 출처
  pinnedByVersion?: Partial<Record<VersionMode, string>>;
  options: AiModelOption[];
}

/**
 * 어느 버전도 쓰지 않는 모델의 versions. 카탈로그와 단가 카드, 백엔드 배선은 두고 노출만 끈다.
 * 지우지 않는 이유는 되살리는 비용과, 그 모델로 만든 산출물의 이름과 비용을 계속 읽어야 하기 때문
 * 빈 배열 리터럴 대신 이름을 붙인 이유: `versions: []` 는 실수로 비운 것과 구분 불가
 */
const RETIRED_FROM_ALL_VERSIONS: readonly VersionMode[] = [];

/**
 * 그 버전에서 고를 수 있는 모델인가: 붙어 있고(available) 그 버전이 쓰는(versions) 모델
 * 선택지를 그리는 자리는 전부 이 판정 사용. 한쪽만 걸러 두면 고를 수 없는 모델의 단가가 가격표에 남음
 */
export function isAiModelVisible(option: AiModelOption, version: VersionMode): boolean {
  return option.available && (option.versions === undefined || option.versions.includes(version));
}

/**
 * 그 버전의 파이프라인에 있는 역량(카탈로그 순서 유지)
 * 선택지를 그리는 자리와 필요 역량을 세는 자리가 모두 이 판정을 쓴다. 한쪽만 걸러 두면 화면에 없는
 * 역량을 생성 전 점검이 요구해 고를 수 없는 것 때문에 막히는 상태가 됨
 */
export function visibleAiCapabilities(version: VersionMode): AiCapability[] {
  return AI_CAPABILITIES.filter((c) => c.versions === undefined || c.versions.includes(version));
}

/**
 * 이 버전에서 이 역량이 고정인가. 고정이면 그 모델 key, 아니면 null
 * 고정 역량은 고를 수 없지만 쓰인다. 설정은 선택기 대신 쓰이는 모델을 알리고, 가격표는 그 한 줄만
 * 싣고, 준비상태는 고른 적 없음으로 막지 않되 그 모델의 키는 요구
 */
export function pinnedModelFor(capability: AiCapability, version: VersionMode): string | null {
  return capability.pinnedByVersion?.[version] ?? null;
}

/**
 * 이 버전이 씬 이미지를 만드는가
 * 화면 곳곳(기획안 카드의 이미지 자리, 씬 이미지 오케스트레이션, 자동 저장 조건)이 같은 판정 참조
 * 화면마다 조건을 다시 세면 이미지를 만들지 않는 버전이 이미지 완성을 기다리며 저장되지 않음
 * 역량 축이 아니라 표에서 직접 읽음. 한 다리를 건너면 "역량이 있으니 이미지를 만든다" 로 인과가 뒤집힘
 */
export function usesSceneImages(version: VersionMode): boolean {
  return pipelineFor(version).usesSceneImages;
}

/** 그 버전에서 이 역량의 선택지(표시 순서 유지). 비어 있으면 UI 가 "준비중" 으로 표시 */
export function visibleAiModelOptions(
  capability: AiCapability,
  version: VersionMode,
): AiModelOption[] {
  // 고정 역량은 그 모델 하나만 내놓는다. 나머지는 고를 수도 쓸 수도 없어, 단가를 보여 주면
  // 있지도 않은 선택지의 비용을 견주게 됨
  const pinned = pinnedModelFor(capability, version);
  if (pinned) return capability.options.filter((o) => o.key === pinned);
  return capability.options.filter((o) => isAiModelVisible(o, version));
}

/**
 * 저장된 선택(key) → 카탈로그 옵션. 카탈로그에 없는 key(제거된 구 모델 등)는 undefined
 * 저장값은 opaque key 뿐이라 그 모델이 내부인지 외부인지, 라벨이 무엇인지는 카탈로그만 안다.
 * (예: 자체 자원 사용 여부로 분량을 제한하는 planComposeOptions)
 */
export function findAiModelOption(
  capability: AiCapabilityKey,
  key: string,
): AiModelOption | undefined {
  if (!key) return undefined;
  return AI_CAPABILITIES.find((c) => c.key === capability)?.options.find((o) => o.key === key);
}

/** provider 그룹 내 vendor(회사/브랜드) 목록: 카탈로그 작성 순서(최초 등장) 유지 */
export function vendorsOf(options: AiModelOption[]): string[] {
  const seen: string[] = [];
  for (const o of options) if (!seen.includes(o.vendor)) seen.push(o.vendor);
  return seen;
}

/**
 * 저장된 모델 key → 사람이 읽는 설명(경로 + 벤더 + 라벨). "생성 AI" 정보 팝오버용
 * 카탈로그에 없는 key(구 모델, 미선택, 폴백)는 key 를 그대로 노출하고 경로는 빈 값
 * 경로 자리에 '외부/내부' 를 쓰지 않는 이유: 같은 모델이 두 경로로 존재해(Veo 3.1) 저장된 선택이
 * 어느 쪽이었는지 알 수 없고, 지난 산출물을 보는 화면이라 되짚을 방법도 없음
 */
export function describeAiModel(
  capability: AiCapabilityKey,
  key: string | null | undefined,
): { label: string; route: string; vendor: string } {
  const opt = key ? findAiModelOption(capability, key) : undefined;
  if (!opt) return { label: key || '미지정', route: '', vendor: '' };
  return { label: opt.label, route: routeLabelOf(opt) ?? routeLabel('NO_KEY'), vendor: opt.vendor };
}

/** describeAiModel 을 한 줄 문자열로(팝오버 값). 예: "Gemini API 직접 / Google / Veo 3.1" */
export function formatAiModelLine(
  capability: AiCapabilityKey,
  key: string | null | undefined,
): string {
  const d = describeAiModel(capability, key);
  return [d.route, d.vendor, d.label].filter((s) => s.length > 0).join(' / ');
}

/** tts 모델로 edge-tts 를 고르면 음성/피치 드롭다운 노출 */
export const EDGE_TTS_MODEL_KEY = 'edge-tts';

/**
 * 이 조건을 만족하는 버전 목록. 역량의 versions 를 파이프라인 표에서 파생하는 데 사용
 * 손으로 적지 않는 이유: 같은 사실을 서버도 안다. 두 곳에 적으면 갈리고 그 갈림이 조용하다.
 * (화면에만 남으면 고를 자리는 있는데 서버가 거절하고, 서버에만 남으면 고를 자리 없는 단계를 계속 돈다)
 * 순서는 TOOL_VERSIONS(표시 순서)를 따른다.
 */
function versionsWhere(
  predicate: (pipeline: ToolVersionPipeline) => boolean,
): readonly VersionMode[] {
  return VERSION_MODES.filter((v) => predicate(pipelineFor(v)));
}

/**
 * 기획 LLM 을 고정하는 버전 → 그 모델 key. 고정하지 않는 버전은 담기지 않음
 * 화면이 이 값을 읽어 선택기를 감추고 가격표가 그 한 줄만 싣는다. 서버는 같은 값으로 실제 호출
 * 모델을 정한다(planLlmForVersion)
 */
function pinnedPlanLlmByVersion(): Partial<Record<VersionMode, string>> {
  const pinned: Partial<Record<VersionMode, string>> = {};
  for (const v of VERSION_MODES) {
    const key = pipelineFor(v).pinnedPlanLlm;
    if (key) pinned[v] = key;
  }
  return pinned;
}

export const AI_CAPABILITIES: AiCapability[] = [
  {
    // 두 버전이 다 쓰지만 고르는 방식이 다름. v1.0 은 셋 중에서 고르고 v1.5 는 고정
    // v1.5 가 고정인 이유: 고를 수 있던 자체 LLM 이 내려가 선택지가 0개가 됐는데 호출은 그대로
    // (영상 모델의 텍스트 인코더는 문장 하나를 클립으로 바꿀 뿐, 씬 수와 장면 구성은 정하지 못한다)
    // 고정 전에는 모델명을 비워 보내 서버 기본으로 떨어졌고, 어느 모델이 기획을 쓰는지 아무도 몰랐다.
    key: 'llm',
    label: 'LLM',
    description: '기획서 텍스트를 생성하는 언어 모델입니다.',
    pinnedByVersion: pinnedPlanLlmByVersion(),
    options: [
      { key: 'claude-opus-4-8', label: 'Claude Opus 4.8', description: '최고 품질, 복잡한 기획에 강함', provider: 'external', vendor: 'Anthropic', available: true, credentialProvider: 'ANTHROPIC' },
      { key: 'claude-sonnet-5', label: 'Claude Sonnet 5', description: '품질과 속도의 균형(기본 추천)', provider: 'external', vendor: 'Anthropic', available: true, credentialProvider: 'ANTHROPIC' },
      { key: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', description: '가장 빠르고 가벼움', provider: 'external', vendor: 'Anthropic', available: true, credentialProvider: 'ANTHROPIC' },
      // 자체 LLM: 쓰던 버전에서 LLM 역량이 사라져 고를 자리가 없음. 배선은 유지
      // (마케팅 도구 밖에서도 쓰이고, 이 모델로 만든 기획안의 이름을 계속 읽어야 한다)
      { key: 'internal-qwen3', label: '자체 LLM (Qwen3)', description: '사내 호스팅, 데이터 미유출, 비용 절감', provider: 'internal', vendor: 'Qwen', available: true, versions: RETIRED_FROM_ALL_VERSIONS },
    ],
  },
  {
    key: 'video',
    label: '영상 생성',
    description: '씬 영상을 만드는 모델입니다.',
    options: [
      // v1.5: Higgsfield 경유 텍스트→영상
      //
      // 씬 이미지 단계가 없어 text-to-video 워크플로만 싣는다. image-to-video 와 first/last-frame 은
      // 시작 이미지를 요구해 이 파이프라인에 꽂히지 않는다.
      //
      // 목록 기준은 한국어 대사를 립싱크로 내는 모델이다. 오디오가 없는 모델은 인물이 입만 다물거나
      // 소리만 나는 결과가 된다. 등급이 갈리는 모델은 립싱크가 가장 정확한 등급만 채택한다.
      // 확인되지 않은 것을 설명에서 주장하지 않는다. 고르는 사람이 그 문장을 근거로 고른다.
      //
      // key = 'higgsfield/' + 그 모델의 엔드포인트 경로. 접두사가 회사 직접 경로와 구분하고
      // 경로를 그대로 담아 모델 추가를 한 줄로 만든다. vendor 는 실제 만든 회사다.
      //
      // 벤더 계정 상태로 막힌 모델도 목록에 남긴다. 그 상태는 우리 배포 없이 바뀌므로 카탈로그에
      // 사용 중지를 적으면 벤더가 켠 날 우리 문구가 그 모델을 막는다.
      { key: 'higgsfield/kling-video/v3.0/std/text-to-video', label: 'Kling 3.0', description: '한국어 대사 립싱크. 한 장면에 여러 인물이 말할 수 있습니다', provider: 'external', vendor: 'Kling', available: true, versions: ['v1.5'], credentialProvider: 'HIGGSFIELD' },
      { key: 'higgsfield/bytedance/seedance-2.0/text-to-video', label: 'Seedance 2.0', description: '한국어 대사 립싱크. 대사와 효과음, 배경음을 한 번에 만듭니다', provider: 'external', vendor: 'ByteDance', available: true, versions: ['v1.5'], credentialProvider: 'HIGGSFIELD', comingSoon: '플랫폼에서 아직 열리지 않은 모델입니다' },
      { key: 'higgsfield/veo3.1/text-to-video', label: 'Veo 3.1', description: '대사 립싱크. 오디오 완성도가 높지만 대사는 영어에 맞춰져 있어 한국어는 상대적으로 약합니다', provider: 'external', vendor: 'Google', available: true, versions: ['v1.5'], credentialProvider: 'HIGGSFIELD', comingSoon: '플랫폼에서 아직 열리지 않은 모델입니다' },
      { key: 'higgsfield/kling-video/v2.1/master/text-to-video', label: 'Kling 2.1 Master', description: '세로(9:16)로 만들어집니다. 한국어 대사 립싱크는 확인되지 않았습니다', provider: 'external', vendor: 'Kling', available: true, versions: ['v1.5'], credentialProvider: 'HIGGSFIELD' },
      { key: 'higgsfield/kling-video/v2.5-turbo/pro/text-to-video', label: 'Kling 2.5 Turbo', description: '가로로 만들어져 세로에서는 좌우가 잘립니다. 한국어 대사 립싱크는 확인되지 않았습니다', provider: 'external', vendor: 'Kling', available: true, versions: ['v1.5'], credentialProvider: 'HIGGSFIELD' },
      // 운영사 직접(Google Gemini)
      // 위 Veo 3.1 과 같은 모델이 여기 또 있는 것이 정상이다. 다른 것은 경로이고, 이쪽은 조직의
      // Google 키로 직접 불러 요금도 그 계정 청구. 한쪽이 막혀도 다른 쪽으로 만들 수 있음
      // 화면은 두 줄을 경로로 구분해 보여 준다(같은 이름이 나란히 있으면 무엇을 고르는지 모른다)
      // key = 'gemini/' + Gemini API 모델 id. 접두사가 곧 라우트이고 렌더 provider 와 필요한 조직 키를 결정
      // Gemini API 에 안정판 Veo 는 없다(3.1 계열 preview 뿐이고 3.0/2.0 은 종료). Lite 는 립싱크가 어긋나 뺀다.
      // 9:16 지정 가능, 대사와 배경음 상시 생성, 길이는 4/6/8초 중 하나(초당 과금), 무료 등급 불가
      // 한국어는 벤더가 평가하지 않았다고만 적어 립싱크를 주장하지 않음
      { key: 'gemini/veo-3.1-generate-preview', label: 'Veo 3.1', description: '세로(9:16)로 만들어지고 대사와 배경음이 함께 만들어집니다. 한국어 대사는 벤더가 보장하지 않습니다', provider: 'external', vendor: 'Google', available: true, versions: ['v1.5'], credentialProvider: 'GEMINI' },
      { key: 'gemini/veo-3.1-fast-generate-preview', label: 'Veo 3.1 Fast', description: '같은 모델의 빠른 등급입니다. 요금이 1/4 이고 품질이 낮아 결과를 먼저 확인할 때 적합합니다', provider: 'external', vendor: 'Google', available: true, versions: ['v1.5'], credentialProvider: 'GEMINI' },
      // v1.0: 조직 XAI 키 등록 시 선택 가능. 저장돼 있어도 키가 없으면 서버가 기본 씬 비주얼로 폴백
      { key: 'grok-imagine-video', label: 'Grok Imagine', description: 'xAI Grok 영상 생성(텍스트/이미지→영상). Grok API 키 필요', provider: 'external', vendor: 'xAI', available: true, versions: ['v1.0'], credentialProvider: 'XAI' },
      // 자체 영상 생성: key = video-model 워커의 provider key(params.provider), 백엔드는 ComfyUI(GPU)
      // 배선은 남기고 노출만 껐다.
      { key: 'wan2.2-ti2v-5b', label: '자체 영상 생성 (Wan 2.2)', description: '사내 호스팅, 텍스트/이미지→영상 720p (Wan 2.2 TI2V-5B)', provider: 'internal', vendor: 'Wan', available: true, versions: RETIRED_FROM_ALL_VERSIONS },
    ],
  },
  {
    // v1.5 는 씬 이미지를 만들지 않아(영상 모델이 텍스트에서 바로 만든다) 이 역량 자체가 그 버전
    // 파이프라인에 없다. 그 사실은 서버와 같은 표에서 온다(usesSceneImages)
    key: 'image',
    label: '이미지 생성',
    description: '씬 이미지를 만드는 모델입니다.',
    versions: versionsWhere((p) => p.usesSceneImages),
    options: [
      // 버전 제한을 적지 않음. 이 역량 자체가 v1.0 전용이라 옵션에 또 적으면 두 선언이 갈릴 수 있음
      { key: 'gpt-image-2', label: 'GPT Image 2', description: 'OpenAI 이미지 생성(고품질). OpenAI API 키 필요', provider: 'external', vendor: 'OpenAI', available: true, credentialProvider: 'OPENAI' },
      // 자체 호스팅(ComfyUI FLUX.1 schnell). 배선은 남기고 노출만 껐다.
      // 엔진 호스트는 language-model IMAGE_COMFYUI_URL 로 추상화(호스트 이전 대비)
      { key: 'flux-schnell', label: '자체 이미지 생성 (FLUX.1 schnell)', description: '사내 호스팅, 무료/데이터 미유출 (FLUX.1 schnell)', provider: 'internal', vendor: 'Black Forest Labs', available: true, versions: RETIRED_FROM_ALL_VERSIONS },
    ],
  },
  {
    // 나레이션은 영상 모델과 별개 단계다. 씬 클립의 오디오를 떼고 정규화한 뒤(`-an`) 여기서 고른
    // 모델의 음성을 mux
    // 그 단계가 있는 버전에만 둔다. 영상 모델이 말까지 만드는 버전은 합성 단계 자체가 없어, 남겨 두면
    // 고른 모델이 쓰이지 않으면서 가격표에 줄을 만들고 준비상태가 없는 API 키를 요구
    // key 는 'tts' 로 유지한다. 저장값과 DB 컬럼, 렌더 스펙이 그 이름으로 굳어 개명은 마이그레이션과
    // 저장값 이전이 되고 얻는 것은 이름뿐
    key: 'tts',
    label: '나레이션',
    description: '씬 나레이션 음성을 만드는 모델입니다. 영상과 별개로 합성되어 얹힙니다.',
    // 이 서버가 소리를 만드는 버전 전용. 만들지 않는 버전은 고를 음성도 등록할 조직 키도 없음
    versions: versionsWhere((p) => p.synthesizesSpeech),
    options: [
      // ElevenLabs 텍스트→음성: 지금은 어느 버전도 쓰지 않는다(쓰던 버전이 합성 단계를 걷어냈다)
      // 배선은 남기고 노출만 끔. 되살릴 때 versions 한 줄
      // 한국어가 공식 문서에 명시된 모델만 싣는다. key = 요청 본문의 model_id 그대로
      // (만든 회사에서 직접 받으므로 같은 id 가 다른 경로로 들어올 일이 없다)
      // 고를 때의 축이 셋으로 갈려(표현력 / 안정성 / 속도와 단가) 하나로 좁히지 않았다.
      { key: 'eleven_v3', label: 'Eleven v3', description: '가장 표현력이 높은 최신 모델. 70여 개 언어(한국어 포함)', provider: 'external', vendor: 'ElevenLabs', available: true, versions: RETIRED_FROM_ALL_VERSIONS, credentialProvider: 'ELEVENLABS' },
      { key: 'eleven_multilingual_v2', label: 'Multilingual v2', description: '감정 표현이 풍부하고 숫자와 날짜를 잘 읽습니다. 29개 언어(한국어 포함)', provider: 'external', vendor: 'ElevenLabs', available: true, versions: RETIRED_FROM_ALL_VERSIONS, credentialProvider: 'ELEVENLABS' },
      { key: 'eleven_flash_v2_5', label: 'Flash v2.5', description: '가장 빠르고 문자당 단가가 절반입니다. 숫자와 날짜 읽기는 약합니다', provider: 'external', vendor: 'ElevenLabs', available: true, versions: RETIRED_FROM_ALL_VERSIONS, credentialProvider: 'ELEVENLABS' },
      { key: EDGE_TTS_MODEL_KEY, label: 'Edge TTS', description: '무료 Microsoft 음성, 한국어 지원', provider: 'external', vendor: 'Microsoft', available: true, versions: ['v1.0'] },
    ],
  },
];

// edge-tts 전용 옵션(음성/피치)
// tts 모델로 edge-tts 를 고르면 한국어(ko-KR) 음성과 피치를 드롭다운으로 고른다.
// key 는 edge-tts 에 그대로 넘기는 값(음성 id / --pitch). 음성 추가 = 아래 배열 한 줄

export interface EdgeTtsChoice {
  // edge-tts 에 넘기는 값
  key: string;
  label: string;
}

/** edge-tts 한국어(ko-KR) 음성만 */
export const EDGE_TTS_KO_VOICES: EdgeTtsChoice[] = [
  { key: 'ko-KR-SunHiNeural', label: '선히 (여성)' },
  { key: 'ko-KR-InJoonNeural', label: '인준 (남성)' },
  { key: 'ko-KR-HyunsuMultilingualNeural', label: '현수 (남성)' },
];

/** edge-tts 피치(--pitch 값). 라벨에 Hz 값을 함께 표기 */
export const EDGE_TTS_PITCHES: EdgeTtsChoice[] = [
  { key: '-50Hz', label: '매우 낮음 (-50Hz)' },
  { key: '-25Hz', label: '낮음 (-25Hz)' },
  { key: '+0Hz', label: '보통 (0Hz)' },
  { key: '+25Hz', label: '높음 (+25Hz)' },
  { key: '+50Hz', label: '매우 높음 (+50Hz)' },
];

export const EDGE_TTS_DEFAULT_VOICE = 'ko-KR-SunHiNeural';
export const EDGE_TTS_DEFAULT_PITCH = '+0Hz';

// ElevenLabs 음성은 이 카탈로그에 없다
// 음성을 요청 본문이 아니라 경로로 받아(POST /v1/text-to-speech/{voice_id}) 없으면 한 번도 호출할 수
// 없는 값이고, 축으로 보면 "무엇으로 만들까"(이 파일)가 아니라 "이 조직이 이 벤더를 쓸 수 있는가" 다
// 값은 조직 API 등록(ELEVENLABS 의 voiceId 필드)에 키와 함께 있고, 미등록은 이 카탈로그가 이미 쓰는
// 게이팅(credentialProvider)이 그대로 처리
// 개인 설정에 두지 않은 이유: 음성 목록은 그 키를 가진 사람만 볼 수 있어, 키 없는 사용자 앞에는 값을
// 구할 길이 없는 필수 입력이 된다(계정마다 음성이 다르고 공용 기본 음성은 만료가 못박혀 있다)

// 자체 영상 생성 모드(Wan 2.2 TI2V-5B)
// 자체 영상 모델을 고르면 아래 모드를 함께 고른다. key = 생성 잡 params.mode(백엔드 어댑터가 해석)
export const WAN_VIDEO_MODEL_KEY = 'wan2.2-ti2v-5b';

export interface VideoModeChoice {
  // 저장/전송 값(params.mode). 'auto' = 소스 이미지 유무로 자동
  key: string;
  label: string;
  description: string;
}

/** 자체 영상 모델의 생성 방식. 기본은 TI2V, '자동'은 소스 이미지 유무로 판단 */
export const WAN_VIDEO_MODES: VideoModeChoice[] = [
  { key: 'auto', label: '자동', description: '이미지가 있으면 이미지 기반, 없으면 텍스트 기반' },
  { key: 't2v', label: '텍스트로 생성', description: '설명(프롬프트)만으로 영상 생성 (T2V)' },
  { key: 'i2v', label: '이미지로 생성', description: '시작 이미지 기반으로 영상 생성 (I2V)' },
  { key: 'ti2v', label: '텍스트+이미지로 생성', description: '이미지에 설명을 더해 생성 (TI2V)' },
];

export const WAN_VIDEO_DEFAULT_MODE = 'ti2v';

// 원천 영상 화질
// 모델별 선택지와 기본값, clamp 는 `@csc/video-capabilities` 소유
// 프론트 선택지와 서버 clamp 가 같은 표를 써야 해서 이 카탈로그에 두지 않음

// 역량별 기본 모델
// 규칙 하나로 두 버전이 설명된다: 기본은 조직 API 키를 요구하지 않는 모델뿐
// 키가 필요한 모델을 기본으로 두면 "고르지 않아도 이걸로 만들어진다" 가 그 조직에서 거짓
// 지금은 두 버전 다 기본이 없다(남은 역량이 모두 키를 요구한다). 기본 없는 역량을 고르지 않은 채
// 생성을 시작하면 막고 알린다(aiModelReadiness.ts). 영상 생성 방식의 기본은 WAN_VIDEO_DEFAULT_MODE
/**
 * 버전 → 역량별 기본 모델. 없는 역량은 사람이 골라야 한다(Partial 인 이유)
 * 기본을 두는 역량은 그 값이 그 버전에 노출되는 모델이고 조직 키를 요구하지 않는 것
 * 목록에 없는 모델을 기본으로 두면 설정 화면이 아무것도 고르지 않은 것처럼 보인다.
 * 두 불변식은 테스트가 지킨다(tests/unit/pages/marketing-video/aiModelCatalog.test.ts)
 */
export const AI_MODEL_DEFAULTS: Readonly<
  Record<VersionMode, Readonly<Partial<Record<AiCapabilityKey, string>>>>
> = {
  'v1.5': {}, // 기본 없음: 남은 두 역량(영상, 나레이션)이 모두 조직 키를 요구한다
  'v1.0': {}, // 기본 없음: 네 역량 모두 직접 고른다
};

/** 그 버전의 역량별 기본 모델(없는 역량은 undefined) */
export function aiModelDefaults(
  version: VersionMode,
): Readonly<Partial<Record<AiCapabilityKey, string>>> {
  return AI_MODEL_DEFAULTS[version];
}

/**
 * 저장값 → 이 버전에서 실제로 쓰일 모델 key(없으면 null)
 * 설정의 "무엇이 선택돼 보이는가" 와 생성 전 점검의 "무엇이 비었는가" 가 같은 답을 내야 함
 * 갈라 두면 설정은 골랐다고 보여주는데 생성은 비었다고 막는 상태 발생
 *   1) 저장값이 이 버전에서 고를 수 있는 모델이면 그 값
 *   2) 아니면 이 버전의 기본 모델(있으면)
 *   3) 둘 다 아니면 null: 사람이 고름
 * 2번이 뒤인 이유: 다른 버전 전용 모델이 저장돼 있을 수 있고, 그대로 쓰면 이 버전이 쓰지 않기로 한
 * 모델로 만들어진다.
 */
export function effectiveAiModel(
  capability: AiCapabilityKey,
  savedKey: string | null | undefined,
  version: VersionMode,
): string | null {
  // 고정 역량은 저장값을 보지 않는다(서버도 같다: planLlmForVersion)
  // 여기서 저장값을 따르면 화면이 말하는 모델과 실제로 부르는 모델이 갈림
  const cap = AI_CAPABILITIES.find((c) => c.key === capability);
  const pinned = cap ? pinnedModelFor(cap, version) : null;
  if (pinned) return pinned;

  const saved = savedKey ? findAiModelOption(capability, savedKey) : undefined;
  // 준비중 모델은 저장돼 있어도 쓰지 않음. 그대로 쓰면 그 조직이 고칠 수 없는 렌더 실패
  // 여기서 비우면 생성 전 점검이 다시 고르라고 막음
  if (saved && isAiModelVisible(saved, version) && !isModelComingSoon(saved)) return saved.key;
  return aiModelDefaults(version)[capability] ?? null;
}

/**
 * 이 모델을 어느 플랫폼을 거쳐 부르는가(직접 부르면 null)
 * vendor 는 모델을 만든 곳이고 이 값은 조직이 키를 등록해 돈을 내는 곳이다. 둘이 갈리는 경우가
 * 실제로 있어(Kling/Seedance/Veo 는 만든 곳이 셋이지만 청구는 전부 Higgsfield) 구분을 놓치면 화면이
 * 조직이 가진 적 없는 계정에서 청구된다고 적게 됨
 * 세 화면(생성 모달, 설정 편집기, 가격표)이 각자 복제하던 것을 카탈로그로 올린 것
 */
export function viaPlatform(option: AiModelOption): string | null {
  if (!option.credentialProvider) return null;
  const meta = findApiProvider(option.credentialProvider);
  return meta?.kind === 'PLATFORM' ? meta.label : null;
}

/**
 * 이 모델에 어떻게 닿는가. 목록을 묶는 축이고 고르는 사람에게 실제로 다른 것 셋
 *   VENDOR    그 회사 키로 그 회사를 직접 호출. 요금은 그 회사 계정 청구
 *   PLATFORM  한 키로 여러 회사 모델을 호출. 요금은 그 플랫폼 계정 청구
 *   NO_KEY    조직 키가 필요 없다. 사내 호스팅이거나 무료로 열린 외부 서비스다.
 * 앞의 둘은 자격증명 카탈로그의 kind 를 그대로 쓴다. 여기 다시 선언하면 프로바이더가 늘 때
 * 등록 화면과 모델 목록이 같은 키를 다른 부류로 말하게 됨
 * 셋째를 '사내' 라 부르지 않는 이유: Edge TTS 는 Microsoft 의 무료 서비스라 키만 불필요
 * 이 축이 답하는 질문은 "어느 키로 닿는가" 이고 그 답이 "키 없이" 다
 * 카탈로그에 없는 프로바이더를 가리키는 모델은 어느 부류도 아니라 null 이다. 조용히 '키 불필요' 로
 * 보이면 그냥 쓸 수 있다고 오해하기 때문
 */
export type AiModelRoute = ApiProviderKind | 'NO_KEY';

export function accessRouteOf(option: AiModelOption): AiModelRoute | null {
  if (!option.credentialProvider) return 'NO_KEY';
  return findApiProvider(option.credentialProvider)?.kind ?? null;
}

/** 묶음 머리글. 등록 화면과 같은 단어를 쓴다(그 두 화면이 같은 것을 가리킨다) */
export function routeLabel(route: AiModelRoute): string {
  return route === 'NO_KEY' ? '키 불필요' : API_PROVIDER_KIND_META[route].label;
}

/** 묶음 설명. 무엇이 다른지는 "요금이 어디로 붙는가" 다 */
export function routeDescription(route: AiModelRoute): string {
  return route === 'NO_KEY'
    ? '조직 API 키 없이 씁니다. 사내 GPU 이거나 무료로 열린 서비스라 별도 요금이 붙지 않습니다.'
    : API_PROVIDER_KIND_META[route].description;
}

/**
 * 이 모델의 요금이 어디로 붙는지 한 줄로. 타일마다 붙는다(묶음 머리글만으로는 어느 계정인지 모른다)
 * viaPlatform 을 두 부류로 넓힌 것이다. 그쪽은 플랫폼 경유일 때만 답해, 운영사 직접 경로가 생기자
 * 같은 이름의 두 모델(Veo 3.1)을 구분할 수단이 없었다.
 */
export function routeLabelOf(option: AiModelOption): string | null {
  const route = accessRouteOf(option);
  if (!route || route === 'NO_KEY' || !option.credentialProvider) return null;
  const meta = findApiProvider(option.credentialProvider);
  if (!meta) return null;
  return route === 'PLATFORM' ? `${meta.label} 경유` : `${meta.label} 직접`;
}

/**
 * 이 모델이 요구하는 키의 이름(키가 필요 없으면 null)
 * routeLabelOf 와 다르다. 그쪽은 닿는 방법이고(예: 'Higgsfield 경유') 이쪽은 등록 화면에서 찾아야
 * 하는 항목의 이름. 게이팅 안내는 이 이름을 써야 무엇을 찾을지 알려 줌
 */
export function credentialLabelOf(option: AiModelOption): string | null {
  if (!option.credentialProvider) return null;
  return findApiProvider(option.credentialProvider)?.label ?? option.credentialProvider;
}

/** 경로별 묶음(`API_PROVIDER_KINDS` 순서 뒤에 키 불필요, 마지막에 분류 불가). 빈 묶음은 제외 */
export function accessRouteGroups(
  options: readonly AiModelOption[],
): { route: AiModelRoute | null; options: AiModelOption[] }[] {
  const order: (AiModelRoute | null)[] = [...API_PROVIDER_KINDS, 'NO_KEY', null];
  return order
    .map((route) => ({ route, options: options.filter((o) => accessRouteOf(o) === route) }))
    .filter((g) => g.options.length > 0);
}

/** 탭 상태로 쓸 안정 id. 분류되지 않은 묶음도 하나의 탭이라 그것에도 id 부여 */
export function routeTabId(route: AiModelRoute | null): string {
  return route ?? 'UNKNOWN';
}

/**
 * 지금 열려 있어야 할 탭. 순서대로 판정
 *   1. 사용자가 고른 탭이 아직 목록에 있으면 그것. 사람의 선택이 먼저다.
 *   2. 없으면 지금 고른 모델이 들어 있는 탭
 *   3. 그것도 없으면 첫 탭
 * 2번이 핵심이다. 저장된 모델이 다른 탭에 있는데 첫 탭을 열면 강조된 타일이 없어 아무것도 고르지
 * 않은 화면처럼 보이고 사람은 다시 고른다.
 * 묶음이 없으면 빈 문자열(그 역량은 "준비중" 이라 탭을 그리지 않는다)
 */
export function resolveRouteTab(
  groups: readonly { route: AiModelRoute | null; options: AiModelOption[] }[],
  pickedTabId: string,
  selectedKey: string,
): string {
  if (groups.length === 0) return '';
  if (groups.some((g) => routeTabId(g.route) === pickedTabId)) return pickedTabId;
  const holding = selectedKey
    ? groups.find((g) => g.options.some((o) => o.key === selectedKey))
    : undefined;
  return routeTabId((holding ?? groups[0]).route);
}

/** 벤더가 아직 열지 않아 고를 수 없는 모델인가(목록에는 남는다) */
export function isModelComingSoon(option: AiModelOption): boolean {
  return !!option.comingSoon;
}

/**
 * 이 모델이 조직 키가 없어 고를 수 없는가. 키를 요구하지 않는 모델은 언제나 선택 가능
 * 세 화면이 같은 판정을 각자 들고 있었다(설정 편집기, 생성 모달, 서버). 복제된 판정은 규칙이 바뀔 때
 * 일부만 고쳐지고, 그 어긋남은 "등록했는데 고를 수 없다" 나 "고를 수 있는데 렌더가 402" 로만 드러남
 */
export function isModelGated(
  option: AiModelOption,
  configured: ReadonlySet<string> | readonly string[],
): boolean {
  if (!option.credentialProvider) return false;
  const has = Array.isArray(configured)
    ? configured.includes(option.credentialProvider)
    : (configured as ReadonlySet<string>).has(option.credentialProvider);
  return !has;
}
