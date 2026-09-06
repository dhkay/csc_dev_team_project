/**
 * 효과 안에서 초안을 저장하는 화면을 흉내 낸다(생성 폼은 적는 동안 늘 저장한다).
 *
 * 이 하네스가 있는 이유: 스토어 갱신이 같은 상태를 추적하며 읽으면 자기 쓰기가 자기 의존을
 * 무효화해 효과가 끝없이 다시 돈다(effect_update_depth_exceeded). 폼이 넘기는 값은 매번 새
 * 객체라(`updatedAt`) 그 되돌기가 스스로 멎지 않고 화면이 멈춘다. 그 회귀는 효과 없이는 재현되지
 * 않으므로 runes 를 쓰는 이 모듈(.svelte.ts)에서 만들고, 검증은 옆의 테스트가 한다.
 */
import { flushSync } from 'svelte';
import { planDraftStore } from '$lib/pages/tools/marketing-video/create/planDraftStore.svelte';
import type { PlanDraft } from '$lib/pages/tools/marketing-video/create/planDraft';

/**
 * 초안을 차례로 폼에 적어 넣는다(입력마다 효과가 한 번 돈다). 효과가 실제로 돈 횟수를 돌려준다.
 * 되돌기가 생기면 그 횟수가 늘기 전에 flushSync 가 터진다.
 */
export function runDraftAutosave(key: string, edits: readonly PlanDraft[]): number {
  let index = $state(0);
  let runs = 0;

  const cleanup = $effect.root(() => {
    $effect(() => {
      runs += 1;
      planDraftStore.upsert(key, { ...edits[index], updatedAt: Date.now() });
    });
  });

  flushSync();
  for (let next = 1; next < edits.length; next += 1) {
    index = next;
    flushSync();
  }
  cleanup();
  return runs;
}
