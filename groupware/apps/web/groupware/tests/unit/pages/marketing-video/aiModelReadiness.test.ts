import { describe, it, expect, beforeEach } from 'vitest';
import {
  ensureAiModelsReady,
  missingAiModels,
  stepCapabilities,
} from '$lib/pages/tools/marketing-video/aiModelReadiness';
import {
  isModelComingSoon,
  visibleAiCapabilities,
  visibleAiModelOptions,
} from '$lib/pages/tools/marketing-video/aiModelOptions';
import { toastStore } from '$lib/shared/lib/stores/toastStore/toastStore.svelte';
import type { AiModelSelection } from '$lib/features/marketing-channels/types';

/**
 * 생성 전 모델 점검
 *
 * 지키는 것: 고르지 않은 모델이 있으면 시작하지 않고 알린다. 그냥 보내면 백엔드가 자기 기본값
 * (자체 LLM, 슬라이드쇼)으로 만들어, 화면이 말한 적 없는 모델의 결과물이 나온다. 그리고 그 사실은
 * 다 만들어진 뒤에야 드러난다.
 */

const EMPTY: AiModelSelection = {
  llm: '',
  video: '',
  videoMode: '',
  tts: '',
  ttsVoice: '',
  ttsPitch: '',
  image: '',
};

function selection(over: Partial<AiModelSelection> = {}): AiModelSelection {
  return { ...EMPTY, ...over };
}

/**
 * v1.5 에서 그 역량으로 실제로 고를 수 있는 첫 모델. 테스트가 key 를 하드코딩하지 않게
 * 카탈로그에 묻는다.
 *
 * 준비중 모델을 건너뛰는 이유: 그것은 목록에 남아 있지만 고를 수 없어(벤더가 닫아 둠) 통과
 * 케이스의 재료가 되지 못한다. 순서만 바뀌어도 이 테스트가 엉뚱한 이유로 깨지지 않게 여기서 뺀다.
 */
function firstV15Key(capability: 'video' | 'tts'): string {
  const cap = visibleAiCapabilities('v1.5').find((c) => c.key === capability);
  const opt = cap && visibleAiModelOptions(cap, 'v1.5').find((o) => !isModelComingSoon(o));
  if (!opt) throw new Error(`v1.5 에 고를 수 있는 ${capability} 선택지가 없다`);
  return opt.key;
}

/** v1.5 에서 그 역량의 준비중 모델(없으면 null: 전부 열린 날에는 그 케이스가 사라진다) */
function comingSoonV15Key(capability: 'video'): string | null {
  const cap = visibleAiCapabilities('v1.5').find((c) => c.key === capability);
  const opt = cap && visibleAiModelOptions(cap, 'v1.5').find((o) => isModelComingSoon(o));
  return opt?.key ?? null;
}

/** v1.0 에서 그 단계를 통과시키는 최소 선택(카탈로그를 하드코딩하지 않는다) */
const V10_READY = selection({
  llm: 'claude-sonnet-5',
  image: 'gpt-image-2',
  video: 'grok-imagine-video',
  tts: 'edge-tts',
});

describe('생성 전 모델 점검', () => {
  beforeEach(() => {
    toastStore.clear();
  });

  it('v1.5 기획 단계는 LLM 이 고정이라 고르지 않아도 막히지 않는다', () => {
    // 그 버전의 기획 단계에는 LLM 호출이 있지만 고정이라 고를 자리가 없다. 고르지 않았다고 막으면
    //   고를 수 없는 것 때문에 생성이 영구히 막힌다. 씬 이미지는 그 버전에 아예 없다.
    expect(stepCapabilities('plan', 'v1.5')).toEqual(['llm']);
    expect(missingAiModels('plan', EMPTY, 'v1.5')).toEqual([]);
  });

  it('v1.5 원천 영상은 고르면 통과하고, 고르지 않으면 막힌다', () => {
    // 어댑터가 붙었다(Higgsfield 영상). 그래서 고른 뒤에는 막지 않는다.
    // 고르지 않은 상태는 여전히 막는다. 이 버전에는 대체할 기본 방식이 없어(슬라이드쇼는 씬
    //   이미지를 요구한다) 그냥 두면 씬 0개 프로젝트가 조용히 만들어진다.
    // 나레이션은 더는 여기 없다: 영상 모델이 말까지 만들어 합성 단계가 사라졌다. 남겨 두면
    //   고를 수 없는 역량 때문에 생성이 영구히 막힌다.
    // 카탈로그에서 고른다: 모델 key 를 하드코딩하면 목록이 바뀔 때 이 검사만 조용히 낡는다.
    const chosen = selection({ video: firstV15Key('video') });
    expect(missingAiModels('sourceVideo', chosen, 'v1.5')).toEqual([]);

    const missing = missingAiModels('sourceVideo', EMPTY, 'v1.5');
    expect(missing.map((m) => m.capability)).toEqual(['video']);
    expect(missing.every((m) => m.reason === 'none')).toBe(true);
  });

  it('준비중 모델이 저장돼 있으면 막고, 그 사유로 구분한다', () => {
    // 벤더가 닫아 둔 모델은 그대로 시작하면 렌더가 거절당한다(조직이 고칠 수 없는 실패다)
    //   그래서 저장값이 있어도 '고르지 않음' 과 같은 취급을 하되, 사유는 갈라 둔다: 문구가
    //   "이 버전에서 사용하지 않습니다" 로 나가면 곧 다시 쓸 모델을 없어진 것으로 읽게 된다.
    const key = comingSoonV15Key('video');
    if (key === null) return; // 전부 열렸다: 지킬 상태가 없다

    const missing = missingAiModels('sourceVideo', selection({ video: key }), 'v1.5');
    expect(missing.map((m) => m.capability)).toEqual(['video']);
    expect(missing[0].reason).toBe('coming-soon');
  });

  it('v1.0 은 고르지 않은 역량을 그 단계가 쓰는 것만 집어낸다', () => {
    const plan = missingAiModels('plan', EMPTY, 'v1.0');
    expect(plan.map((m) => m.capability)).toEqual([...stepCapabilities('plan', 'v1.0')]);
    expect(plan.every((m) => m.reason === 'none')).toBe(true);
    // 영상/나레이션은 기획서 생성 단계에서 호출되지 않으므로 여기서 막을 근거가 아니다.
    expect(plan.map((m) => m.capability)).not.toContain('video');
  });

  it('v1.0 에 남은 자체 모델은 고르지 않은 것으로 본다', () => {
    // 감췄다고 저장값이 사라지지는 않는다. 그대로 보내면 v1.0 이 쓰지 않기로 한 모델로 만들어진다.
    const missing = missingAiModels('plan', selection({ llm: 'internal-qwen3' }), 'v1.0');
    expect(missing.find((m) => m.capability === 'llm')?.reason).toBe('retired');
  });

  it('필요한 모델이 다 있으면 통과한다', () => {
    expect(missingAiModels('plan', V10_READY, 'v1.0')).toEqual([]);
    expect(missingAiModels('sourceVideo', V10_READY, 'v1.0')).toEqual([]);
  });

  it('선택을 아직 모르면(로딩) 막지 않는다', () => {
    // 모르는 걸 근거로 막으면 조회가 느린 순간에 생성 버튼이 이유 없이 실패한다.
    for (const unknown of [undefined, null]) {
      expect(missingAiModels('plan', unknown, 'v1.0')).toEqual([]);
      expect(ensureAiModelsReady('plan', unknown, 'v1.0')).toBe(true);
    }
    expect(toastStore.items).toEqual([]);
  });

  it('막을 때 알림을 띄우고, 통과할 때는 띄우지 않는다', () => {
    expect(ensureAiModelsReady('plan', EMPTY, 'v1.0')).toBe(false);
    expect(toastStore.items).toHaveLength(1);
    expect(toastStore.items[0].variant).toBe('warning');
    // 비어 있는 역량 이름이 문구에 있어야 무엇을 고르러 가야 하는지 알 수 있다.
    expect(toastStore.items[0].detail).toContain('LLM');

    toastStore.clear();
    expect(ensureAiModelsReady('plan', V10_READY, 'v1.0')).toBe(true);
    expect(toastStore.items).toEqual([]);
  });

  it('연달아 눌러도 알림이 쌓이지 않는다', () => {
    // 생성 버튼은 여러 번 눌린다. 시도마다 새 카드가 쌓이면 화면이 같은 말로 도배된다.
    ensureAiModelsReady('plan', EMPTY, 'v1.0');
    ensureAiModelsReady('plan', EMPTY, 'v1.0');
    expect(toastStore.items).toHaveLength(1);
    expect(toastStore.items[0].count).toBe(2);
  });

  it('단계가 다르면 알림이 각각 뜬다', () => {
    // 서로 다른 사유(기획 vs 영상)를 한 카드가 덮어쓰면 앞의 안내가 사라진다.
    ensureAiModelsReady('plan', EMPTY, 'v1.0');
    ensureAiModelsReady('sourceVideo', EMPTY, 'v1.0');
    expect(toastStore.items).toHaveLength(2);
  });

  it("'설정 열기' 버튼은 이동 방법을 받은 경우에만 붙는다", () => {
    // 이 모듈은 라우팅을 모른다(주소는 부르는 화면이 안다). 안 주면 문구만 띄운다.
    ensureAiModelsReady('plan', EMPTY, 'v1.0');
    expect(toastStore.items[0].action).toBeUndefined();

    toastStore.clear();
    let opened = 0;
    ensureAiModelsReady('plan', EMPTY, 'v1.0', { onOpenSettings: () => (opened += 1) });
    toastStore.items[0].action?.run();
    expect(opened).toBe(1);
  });
});
