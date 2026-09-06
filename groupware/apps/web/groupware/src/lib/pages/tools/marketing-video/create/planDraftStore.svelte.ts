/**
 * 생성 폼 초안 스토어 (Svelte 5 runes 싱글톤: planGenerationStore 와 동형)
 *
 * 초안을 두 곳이 함께 본다. 창은 그중 하나를 편집하고, 셸은 전부를 하단 탭으로 세운다. 창이 자기
 * 값을 셸에 보고하는 방식으로는 여러 개를 다룰 수 없다(창은 한 번에 하나만 편집한다).
 *
 * 저장소 읽기, 쓰기는 옆의 `planDraft` 가 갖고 여기는 그 위의 반응 상태만 든다. 순수 규칙
 * (무엇이 초안인가, 어떻게 요약하는가)을 스토어에 넣으면 테스트가 runes 런타임을 끌고 와야 한다.
 *
 * 칸(key)은 채널과 버전으로 갈린다. 한 스토어가 여러 칸을 들고 있는 이유는 채널을 오갈 때 스토어를
 * 다시 만들 자리가 없기 때문이다(셸은 채널 전환에 리마운트되지 않는다).
 *
 * 다른 runes 스토어와 달리 `shared/lib/stores` 가 아니라 이 도구 안에 둔다. 초안의 모양이 이 폼의
 * 것이라(`CreateMode`/`SegmentMode`) 중앙 폴더에 두면 shared 가 이 도구의 모듈을 참조해 의존
 * 방향이 뒤집힌다. 같은 폴더의 marketing 스토어들(planGenerationStore 등)이 중앙에 있는 이유는
 * 그쪽이 드는 타입이 `features` 에 있어서다.
 */
import { untrack } from 'svelte';
import { loadDrafts, saveDrafts, hasContent, type PlanDraft } from './planDraft';

class PlanDraftStore {
  /** 칸 → 그 칸의 초안 목록(최근 순). $state 라 목록이 바뀌면 탭이 따라온다 */
  private _byKey = $state<Record<string, PlanDraft[]>>({});
  /** 이미 저장소에서 읽어 온 칸. 같은 칸을 두 번 읽으면 그 사이의 편집을 덮어쓴다 */
  private _loaded = new Set<string>();

  /**
   * 저장소에서 한 번 읽어 온다. 파생 계산 안이 아니라 초기화에서 부른다(상태를 쓰기 때문).
   * 멱등: 두 번째 호출은 아무것도 하지 않는다.
   */
  hydrate(key: string): void {
    if (this._loaded.has(key)) return;
    this._loaded.add(key);
    const drafts = loadDrafts(key);
    // 저장소에서 읽어 온 것이라 되쓰지 않는다(같은 값을 다시 쓰는 것뿐이다)
    if (drafts.length > 0) this.change(key, () => drafts, false);
  }

  /** 그 칸의 초안(최근 순). 없으면 빈 배열 */
  list(key: string): PlanDraft[] {
    return this._byKey[key] ?? [];
  }

  /** id 로 하나. 없으면 undefined(이미 버렸거나 제출된 초안) */
  get(key: string, draftId: string): PlanDraft | undefined {
    return this.list(key).find((d) => d.id === draftId);
  }

  /**
   * 저장(같은 id 는 갈아 끼운다). 내용이 없으면 저장이 아니라 제거다.
   *
   * 그래서 초안을 지우는 코드가 따로 필요하지 않다. 폼을 비우면 그 자체로 사라진다.
   */
  upsert(key: string, draft: PlanDraft): void {
    if (!hasContent(draft)) {
      this.remove(key, draft.id);
      return;
    }
    this.change(key, (current) => [draft, ...current.filter((d) => d.id !== draft.id)]);
  }

  /** 제거. 없는 id 는 무해 */
  remove(key: string, draftId: string): void {
    this.change(key, (current) => {
      const kept = current.filter((d) => d.id !== draftId);
      return kept.length === current.length ? null : kept;
    });
  }

  /**
   * 지금 목록을 보고 새 목록을 정한다(null 이면 바꿀 것이 없다). 상태와 저장소를 함께 갱신한다.
   * 둘이 갈리면 새로고침에서 화면이 뒤집힌다.
   *
   * 읽기를 추적하지 않는 이유: 이 갱신은 대개 효과($effect) 안에서 불린다(폼은 적는 동안 늘
   * 저장한다). 효과 안에서 같은 상태를 읽고 쓰면 자기 쓰기가 자기 의존을 무효화해 효과가 끝없이
   * 다시 돌고(effect_update_depth_exceeded) 화면이 멈춘다. 폼이 넘기는 값은 매번 새 객체라
   * (`updatedAt`) 그 되돌기가 스스로 멎지도 않는다. 구독은 읽기 메서드(list/get)의 일이고
   * 갱신의 일이 아니다.
   */
  private change(
    key: string,
    next: (current: PlanDraft[]) => PlanDraft[] | null,
    persist = true,
  ): void {
    untrack(() => {
      const drafts = next(this._byKey[key] ?? []);
      if (drafts === null) return;
      this._byKey = { ...this._byKey, [key]: drafts };
      if (persist) saveDrafts(key, drafts);
    });
  }
}

export const planDraftStore = new PlanDraftStore();
