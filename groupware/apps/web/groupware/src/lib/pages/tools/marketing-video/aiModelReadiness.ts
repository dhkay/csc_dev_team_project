// 생성 전 모델 점검: 그 단계를 시작할 수 없는 이유가 있으면 막고 알린다.
//
// 막는 이유는 셋이다.
//
// 1. 고르지 않았다. 백엔드는 빈 값을 받으면 자기 기본값으로 만들어, 화면이 말한 적 없는 모델의
//    결과물이 만들어진 뒤에야 그 사실을 알게 된다.
// 2. 골라 둔 모델을 이 버전이 더는 쓰지 않는다. 목록에서 감춰도 저장값은 남아 있다.
// 3. 골라 둔 모델이 아직 열리지 않았다(카탈로그의 comingSoon). 그대로 시작하면 렌더가 벤더에서
//    거절당하고, 조직이 고칠 수 없는 실패다.
//
// 확장 지점:
//   - 단계 추가: GenerationStep 에 한 줄 + STEP_CAPABILITIES 에 한 줄(Record 라 빠뜨리면 컴파일이 잡는다)
//   - 역량 추가: 카탈로그(AiCapabilityKey)만 넓히고 그 역량을 쓰는 단계에 넣는다.
//   - 다른 차단 사유: MissingAiModel.reason 을 넓히고 missingAiModels 에 판정을 더한다.

import { toastStore } from '$lib/shared/lib/stores/toastStore/toastStore.svelte';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import type { AiModelSelection } from '$lib/features/marketing-channels/types';
import {
  AI_CAPABILITIES,
  effectiveAiModel,
  findAiModelOption,
  isModelComingSoon,
  visibleAiCapabilities,
  type AiCapabilityKey,
} from './aiModelOptions';

/** AI 모델을 쓰는 생성 단계 */
export type GenerationStep = 'plan' | 'sourceVideo';

/**
 * 단계별로 실제 호출될 수 있는 역량(버전 무관 상한)
 *
 * 기획서 생성은 LLM(문안)과 이미지(씬 이미지)를, 원천 영상은 영상과 나레이션을 쓴다.
 * 최종 영상(프레임 적용)은 배경/아웃트로 합성이라 AI 모델을 쓰지 않아 단계에 없다.
 * 백엔드가 무엇을 읽는지가 근거다: 기획은 plan-generation.service 의 aiModels.llm/image,
 * 원천은 video-project-spec-builder 의 aiModels.video/tts.
 *
 * 버전에 따라 이보다 좁아진다(v1.5 는 씬 이미지도 별도 언어 모델 호출도 없다). 그래서 내보내지
 * 않는다: 이 상수를 직접 읽으면 그 버전에 없는 역량을 요구하게 되고, 고를 자리가 없는 것 때문에
 * 생성이 막힌다. 밖에서 묻는 길은 아래 `stepCapabilities` 하나다.
 */
const STEP_CAPABILITIES: Readonly<Record<GenerationStep, readonly AiCapabilityKey[]>> = {
  plan: ['llm', 'image'],
  sourceVideo: ['video', 'tts'],
};

/**
 * 그 버전에서 이 단계가 실제로 쓰는 역량
 *
 * 버전 필터를 여기서 다시 정의하지 않고 카탈로그의 역량 축(visibleAiCapabilities)과 교집합을
 * 취한다. 두 곳에 적으면 역량을 버전에서 빼거나 넣을 때 한쪽만 따라가고, 그러면 화면에 없는
 * 역량을 생성 전 점검이 요구해 고를 수 없는 것 때문에 막히는 상태가 된다.
 */
export function stepCapabilities(
  step: GenerationStep,
  version: VersionMode,
): readonly AiCapabilityKey[] {
  const inVersion = new Set(visibleAiCapabilities(version).map((c) => c.key));
  return STEP_CAPABILITIES[step].filter((cap) => inVersion.has(cap));
}

/** 시작할 수 없게 하는 역량 하나. reason 은 알림 문구를 가르는 근거다. */
export interface MissingAiModel {
  capability: AiCapabilityKey;
  // 역량 이름(카탈로그의 표시명). 알림에 그대로 쓴다.
  label: string;
  // 'none': 고른 적이 없다.
  // 'retired': 골라 둔 모델을 이 버전이 더는 쓰지 않는다(예: v1.0 에 남은 자체 모델)
  // 'coming-soon': 골라 둔 모델이 이 버전의 것이긴 하나 아직 열리지 않았다(벤더 사정)
  reason: 'none' | 'retired' | 'coming-soon';
}

/** 역량 key → 표시명. 카탈로그에 없는 역량은 key 를 그대로 쓴다(문구가 비지 않게) */
function capabilityLabel(capability: AiCapabilityKey): string {
  return AI_CAPABILITIES.find((c) => c.key === capability)?.label ?? capability;
}

/**
 * 이 단계를 시작할 수 없게 하는 역량 목록(비어 있으면 시작 가능)
 *
 * 선택을 아직 모르면(로딩) 빈 배열을 준다. 모르는 걸 근거로 막으면 조회가 느린 순간에 생성
 * 버튼이 이유 없이 실패한다(planComposeOptions 의 분량 제한과 같은 원칙)
 */
export function missingAiModels(
  step: GenerationStep,
  selection: AiModelSelection | null | undefined,
  version: VersionMode,
): MissingAiModel[] {
  if (!selection) return [];
  const blocked: MissingAiModel[] = [];
  for (const cap of stepCapabilities(step, version)) {
    const effective = effectiveAiModel(cap, selection[cap], version);
    if (effective === null) {
      const saved = selection[cap] ? findAiModelOption(cap, selection[cap]) : undefined;
      blocked.push({
        capability: cap,
        label: capabilityLabel(cap),
        // 저장값이 있는데도 비었다면 둘 중 하나다: 이 버전이 쓰지 않는 모델이거나(retired),
        //   이 버전의 모델이지만 아직 열리지 않은 것이다(coming-soon). 고칠 방법이 같아도
        //   (설정에서 다시 고른다) 사유를 갈라 두면 문구가 사실을 말한다.
        reason: !selection[cap] ? 'none' : saved && isModelComingSoon(saved) ? 'coming-soon' : 'retired',
      });
    }
  }
  return blocked;
}

export interface AiModelReadinessOptions {
  // 알림의 '설정 열기' 버튼이 할 일. 주지 않으면 버튼 없이 문구만 띄운다.
  //
  // 이동을 여기서 하지 않는 이유: 이 모듈이 라우팅(주소 조립, goto)을 알면 화면 밖에서도 쓰기
  // 어려워지고 테스트가 SvelteKit 을 끌고 온다. 어디로 갈지는 부르는 화면이 안다.
  onOpenSettings?: () => void;
}

/**
 * 우하단 알림 1건으로 알린다(역량마다 띄우지 않는다: 한 번의 시도는 한 번의 통보다)
 *
 * key 를 단계로 고정해, 연속으로 눌러도 쌓이지 않고 같은 자리에서 갱신된다(toastStore 규칙)
 *
 * 내보내지 않는다. 아래 ensureAiModelsReady 가 점검과 알림을 함께 하는 이유가 "한쪽만 부르는
 * 호출부를 만들지 않는 것" 이라, 이 함수를 공개하면 그 이유를 스스로 무르는 셈이다.
 */
function notifyMissingAiModels(
  step: GenerationStep,
  missing: readonly MissingAiModel[],
  options: AiModelReadinessOptions = {},
): void {
  if (missing.length === 0) return;
  const names = missing.map((m) => m.label).join(', ');
  // 저장값이 있는 사유를 먼저 말한다. "안 골랐다" 로 뭉뚱그리면, 고른 기억이 있는 사용자가
  //   화면을 의심하게 된다(실제로 골랐고 그 값이 남아 있다). 준비중이 낡은 선택보다 앞인 이유:
  //   그쪽은 곧 다시 쓸 모델이라 "이 버전에서 사용하지 않습니다" 가 사실이 아니다.
  const retired = missing.some((m) => m.reason === 'retired');
  const soon = missing.some((m) => m.reason === 'coming-soon');
  toastStore.show({
    variant: 'warning',
    key: `ai-model-missing:${step}`,
    title: 'AI 모델을 먼저 선택하세요',
    detail: soon
      ? `${names}: 골라 둔 모델이 아직 준비중입니다. 설정 > AI 모델에서 다른 모델을 고른 뒤 시작하세요.`
      : retired
        ? `${names}: 골라 둔 모델을 이 버전에서는 사용하지 않습니다. 설정 > AI 모델에서 다시 고른 뒤 시작하세요.`
        : `${names}: 아직 고르지 않았습니다. 설정 > AI 모델에서 고른 뒤 시작하세요.`,
    // 두 사유 모두 설정에서 고르면 풀린다.
    action: options.onOpenSettings
      ? { label: '설정 열기', run: options.onOpenSettings }
      : undefined,
  });
}

/**
 * 점검 + 알림을 한 번에. 시작해도 되면 true, 막았으면 false.
 *
 * 호출부는 `if (!ensureAiModelsReady(...)) return;` 한 줄로 쓴다. 점검과 알림을 따로 부르게 두면
 * 한쪽만 부르는 호출부가 생긴다(막고 알리지 않거나, 알리고 그대로 진행하거나)
 */
export function ensureAiModelsReady(
  step: GenerationStep,
  selection: AiModelSelection | null | undefined,
  version: VersionMode,
  options: AiModelReadinessOptions = {},
): boolean {
  const missing = missingAiModels(step, selection, version);
  if (missing.length === 0) return true;
  notifyMissingAiModels(step, missing, options);
  return false;
}
