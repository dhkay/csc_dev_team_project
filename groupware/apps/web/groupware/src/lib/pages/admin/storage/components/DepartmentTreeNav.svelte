<script lang="ts">
  // 부서 트리(읽기 전용): 좌측 nav 의 조직 영역이 쓴다.
  //
  // 조직 관리 화면의 OrgTree 를 재사용하지 않는 이유: 그쪽은 스테이징 스토어 다섯 개를 끌고 들어오고
  // 권한/AI도구 배지를 그린다. 파일 브라우저에 붙이면 일반 조직원에게 권한 정보가 노출된다.
  // 여기서는 데이터(Department[])만 공유하고 렌더는 따로 한다.
  //
  // 접근할 수 없는 부서는 그리지 않는다. 파일 브라우저가 조직 구조를 알려 주는 창구가 되면
  // 안 된다. 다만 접근 가능한 부서의 조상은 경로를 보여 주기 위해 눌리지 않는 텍스트로 남긴다.
  import type { Department } from '$lib/features/departments/types';
  import { buildDepartmentTree, type DepartmentNode } from '$lib/features/storage/lib/tree';

  interface Props {
    departments: Department[];
    accessibleIds: readonly number[];
    selectedId: number | null;
    canManage: boolean;
    onSelect: (id: number) => void;
  }
  let { departments, accessibleIds, selectedId, canManage, onSelect }: Props = $props();

  const accessible = $derived(new Set(accessibleIds));
  const tree = $derived(buildDepartmentTree(departments));

  /** 이 노드나 자손 중 하나라도 접근 가능하면 그린다(조상은 경로로만 보인다) */
  function visible(node: DepartmentNode): boolean {
    if (canManage || accessible.has(node.id)) return true;
    return node.children.some(visible);
  }
</script>

{#snippet branch(nodes: DepartmentNode[], depth: number)}
  <ul class="flex flex-col">
    {#each nodes.filter(visible) as node (node.id)}
      {@const clickable = canManage || accessible.has(node.id)}
      <li>
        {#if clickable}
          <button
            type="button"
            onclick={() => onSelect(node.id)}
            aria-current={selectedId === node.id ? 'true' : undefined}
            class="w-full truncate rounded-md py-1.5 pr-2 text-left text-sm transition {selectedId ===
            node.id
              ? 'bg-accent-bg font-medium text-accent-fg'
              : 'text-fg-subtle hover:bg-hover hover:text-fg'}"
            style="padding-left: {0.75 + depth * 0.75}rem"
          >
            {node.name}
          </button>
        {:else}
          <!-- 접근 권한이 없는 조상: 경로를 알아보게만 두고 누를 수 없다. -->
          <span
            class="block truncate py-1.5 pr-2 text-sm text-fg-subtle/60"
            style="padding-left: {0.75 + depth * 0.75}rem"
          >
            {node.name}
          </span>
        {/if}
        {#if node.children.length > 0}
          {@render branch(node.children, depth + 1)}
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

{#if tree.filter(visible).length === 0}
  <p class="px-3 py-2 text-xs text-fg-subtle">소속된 부서가 없습니다.</p>
{:else}
  {@render branch(tree, 0)}
{/if}
