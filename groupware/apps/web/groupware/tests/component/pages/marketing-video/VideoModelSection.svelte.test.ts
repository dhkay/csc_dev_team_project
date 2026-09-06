/**
 * 영상 모델 선택기의 경로 탭
 *
 * 같은 이름의 모델이 두 경로로 존재하기 때문에 생긴 화면이다(Veo 3.1: 플랫폼 경유와 운영사 직접)
 * 탭이 없으면 목록에 이름이 같은 두 줄이 나란히 남고, 고르는 사람은 등록해야 하는 키도 요금이 붙는
 * 계정도 알 수 없다.
 *
 * 규칙 자체(어느 탭이 열리는가)는 순수 함수로 따로 검사한다(aiModelRoutes.test.ts 의
 * resolveRouteTab). 여기서 지키는 것은 그 규칙이 실제 화면에 닿는가 다: 탭이 그려지고,
 * 눌러서 전환되고, 저장된 모델이 있는 탭이 열린 채 시작하는지
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import VideoModelSection from '$lib/pages/tools/marketing-video/create/VideoModelSection.svelte';
import {
  AI_CAPABILITIES,
  isModelComingSoon,
  visibleAiModelOptions
} from '$lib/pages/tools/marketing-video/aiModelOptions';

const videoCap = AI_CAPABILITIES.find((c) => c.key === 'video')!;
const V15 = visibleAiModelOptions(videoCap, 'v1.5');
const V10 = visibleAiModelOptions(videoCap, 'v1.0');

/** 두 경로의 대표 모델(카탈로그에서 뽑는다: key 를 테스트에 적으면 카탈로그가 바뀔 때 조용히 낡는다) */
const platformKey = V15.find((o) => o.credentialProvider === 'HIGGSFIELD')!.key;
const geminiKey = V15.find((o) => o.credentialProvider === 'GEMINI')!.key;

function mount(over: Partial<Record<string, unknown>> = {}) {
  return render(VideoModelSection, {
    options: V15,
    value: '',
    onSelect: () => {},
    savedValue: '',
    configured: new Set(['HIGGSFIELD', 'GEMINI']),
    isPending: false,
    ...over
  });
}

function tabs(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll('[role="tab"]')] as HTMLElement[];
}

function tileLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[aria-pressed]')].map((b) =>
    (b.querySelector('.truncate')?.textContent ?? '').trim()
  );
}

describe('경로 탭', () => {
  it('경로가 둘이면 탭으로 갈라 그린다', () => {
    const { container } = mount();
    expect(tabs(container).map((t) => t.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'AI 회사 2',
      '플랫폼 5'
    ]);
  });

  it('한 번에 한 부류만 보인다', () => {
    // 탭의 목적이 이것이다. 전부 보이면 이름이 같은 두 줄이 그대로 나란히 남는다.
    const { container } = mount();
    const shown = tileLabels(container);
    expect(shown).toEqual(['Veo 3.1', 'Veo 3.1 Fast']);
    expect(shown).not.toContain('Kling 3.0');
  });

  it('탭을 누르면 그쪽 목록으로 바뀐다', async () => {
    const { container } = mount();
    tabs(container)[1].click();
    await Promise.resolve();
    expect(tileLabels(container)).toContain('Kling 3.0');
    expect(tileLabels(container)).not.toContain('Veo 3.1 Fast');
  });

  it('지금 고른 모델이 있는 탭이 열린 채 시작한다', () => {
    // 첫 탭을 열면 강조된 타일이 없어 아무것도 고르지 않은 화면처럼 보이고, 사람은 다시 고른다.
    //   그 재선택이 곧 '이번 생성만 변경' 이 된다.
    const { container } = mount({ value: platformKey, savedValue: platformKey });
    expect(tabs(container)[1].getAttribute('aria-selected')).toBe('true');
    expect(tileLabels(container)).toContain('Kling 3.0');
  });

  it('선택이 다른 탭에 있으면 그 탭에 표시가 남는다', () => {
    // 표시가 없으면 눌러 보고서야 어디 있는지 알게 된다.
    const { container } = mount({ value: geminiKey });
    const platformTab = tabs(container)[1];
    expect(platformTab.getAttribute('aria-selected')).toBe('false');
    expect(platformTab.querySelector('[title="지금 고른 모델이 있습니다"]')).toBeNull();
    expect(tabs(container)[0].getAttribute('aria-selected')).toBe('true');
  });

  it('경로가 하나뿐이면 탭을 그리지 않는다', () => {
    // 전환할 곳이 없는 탭은 누를 수 없는 장식이다. v1.0 은 외부 영상 모델이 한 부류뿐이다.
    const { container } = mount({ options: V10 });
    expect(tabs(container)).toHaveLength(0);
    expect(container.textContent).toContain('AI 회사');
  });

  it('준비중 모델은 고를 수 없고 그 사실을 타일에 적는다', async () => {
    // 벤더가 닫아 둔 모델을 목록에 남기는 이유는 카탈로그 주석에 있다(열리는 날 한 줄로 되살아난다)
    //   그래서 눌리지 않는다는 것이 화면에 보여야 한다: 그러지 않으면 골랐다고 생각하고
    //   생성까지 갔다가 시작이 막힌다.
    const soon = V15.filter((o) => isModelComingSoon(o));
    if (soon.length === 0) return; // 전부 열렸다: 지킬 상태가 없다

    const { container } = mount();
    tabs(container)[1].click();
    await Promise.resolve();
    const tiles = [...container.querySelectorAll('[aria-pressed]')] as HTMLButtonElement[];
    for (const opt of soon) {
      const tile = tiles.find((t) => (t.querySelector('.truncate')?.textContent ?? '').trim() === opt.label);
      expect(tile, `${opt.label} 타일이 없다`).toBeDefined();
      expect(tile!.disabled).toBe(true);
      expect(tile!.textContent).toContain('준비중');
    }
  });

  it('키가 없는 경로의 모델은 고를 수 없고 무엇을 등록할지 말해 준다', async () => {
    const { container } = mount({ configured: new Set(['GEMINI']) });
    tabs(container)[1].click();
    await Promise.resolve();
    const disabled = [...container.querySelectorAll('[aria-pressed]')].filter(
      (b) => (b as HTMLButtonElement).disabled
    );
    expect(disabled.length).toBeGreaterThan(0);
    expect(container.textContent).toContain('Higgsfield 키가 등록되지 않아');
  });
});
