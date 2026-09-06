<script lang="ts">
  // 테마 스코프: 감싼 서브트리에 현재 테마 클래스를 적용해 스타일을 그 영역에 한정한다.
  // themeStore.themeClass(테마 레지스트리 매핑)에 반응: light='' / dark='dark' / (향후) 'sepia' 등
  // data-theme 는 클래스 기반(Tailwind variant) 외에 CSS 변수 기반 테마를 얹을 때를 위한 확장 훅
  // 어떤 페이지든 루트를 이걸로 감싸면 테마를 opt-in 할 수 있다(재사용 seam)
  import type { Snippet } from 'svelte';
  import { themeStore } from '$lib/shared/lib/stores/theme/themeStore.svelte';

  interface Props {
    class?: string;
    children: Snippet;
  }

  let { class: className = '', children }: Props = $props();
</script>

<div class="{className} {themeStore.themeClass}" data-theme={themeStore.resolvedTheme}>
  {@render children()}
</div>
