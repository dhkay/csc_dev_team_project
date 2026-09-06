<script lang="ts">
  // 영역 이동: 공통 / 조직(부서) / 개인 / 휴지통 + 사용량
  //
  // 방향은 CSS 브레이크포인트(lg) 로 다룬다. 좁은 화면은 상단 칩 바, 넓은 화면은 좌측 레일이다.
  // 관리자 영역의 다른 화면(조직 관리)이 같은 방식을 쓰고, 서버 렌더가 곧바로 맞는 배치를 그린다.
  // (스토어로 판정하면 서버는 방향을 모르므로 한 번 그린 뒤 바뀐다)
  //
  // 부서만 마크업이 갈린다. 트리는 좁은 화면에서 읽히지 않아 선택 목록으로 바꾼다. 둘 다 그려 두고
  // 한쪽을 감추는데, 부서가 화면 하나에 담기는 규모라 그 편이 분기보다 단순하다.
  import { STORAGE_AREAS } from '$lib/features/storage/lib/area';
  import { flattenDepartments } from '$lib/features/departments/types';
  import { FILTER_CONTROL } from '$lib/shared/ui/controls/controlClasses';
  import type {
    StorageActor,
    StorageArea,
    StorageScope,
    StorageUsageSummary
  } from '$lib/features/storage/types';
  import type { Department } from '$lib/features/departments/types';
  import DepartmentTreeNav from './DepartmentTreeNav.svelte';
  import StorageUsageBar from './StorageUsageBar.svelte';

  interface Props {
    actor: StorageActor;
    departments: Department[];
    scope: StorageScope;
    trashed: boolean;
    usage: StorageUsageSummary | undefined;
    onSelectArea: (area: StorageArea) => void;
    onSelectDepartment: (id: number) => void;
    onToggleTrash: () => void;
  }
  let {
    actor,
    departments,
    scope,
    trashed,
    usage,
    onSelectArea,
    onSelectDepartment,
    onToggleTrash
  }: Props = $props();

  // 좁은 화면에서는 칩처럼 나란히, 넓은 화면(레일)에서는 한 줄을 다 쓴다(컨테이너가 stretch 한다)
  const itemBase =
    'shrink-0 rounded-md px-3 py-2 text-left text-sm transition hover:bg-hover hover:text-fg';
  const selected = 'bg-accent-bg font-medium text-accent-fg';

  function areaClass(area: StorageArea): string {
    const active = !trashed && scope.area === area;
    return `${itemBase} ${active ? selected : 'text-fg-subtle'}`;
  }

  const showDepartmentPicker = $derived(!trashed && scope.area === 'DEPARTMENT');

  /** 지금 영역의 휴지통 개수. 사용량을 아직 못 받았으면 null(숫자를 지어내지 않는다) */
  const trashCount = $derived(usage ? usage.trashByArea[scope.area].files : null);

  // 영역 목록 밖(레일 하단)에 있어 자기 여백을 스스로 갖는다. 목록은 컨테이너의 lg:p-2 를 쓴다.
  const trashClass = $derived(
    `${itemBase} lg:mx-2 lg:mb-2 ${trashed ? selected : 'text-fg-subtle'}`
  );

  // 좁은 화면용 부서 선택지: 트리를 DFS 로 펼치고 깊이를 들여쓰기로 표시한다.
  //   접근 권한이 없는 부서는 애초에 목록에 넣지 않는다(파일 브라우저가 조직 구조를 알려 주는
  //   창구가 되면 안 된다. 트리와 같은 규칙이다)
  const departmentOptions = $derived(
    flattenDepartments(departments).filter(
      (d) => actor.canManage || actor.accessibleDepartmentIds.includes(d.id)
    )
  );
</script>

<nav
  class="flex shrink-0 flex-col gap-2 border-b border-line bg-surface p-2
         lg:h-full lg:min-h-0 lg:w-56 lg:gap-0 lg:border-b-0 lg:border-r lg:p-0"
>
  <div
    class="flex flex-wrap items-center gap-1
           lg:min-h-0 lg:flex-1 lg:flex-col lg:items-stretch lg:gap-0 lg:overflow-y-auto lg:p-2"
  >
    {#each STORAGE_AREAS as area (area.id)}
      <button type="button" class={areaClass(area.id)} onclick={() => onSelectArea(area.id)}>
        {area.label}
      </button>
      {#if area.id === 'DEPARTMENT' && showDepartmentPicker}
        <!-- 넓은 화면 전용: 트리. 좁은 화면에서는 아래 선택 목록이 대신한다. -->
        <div class="mb-1 ml-2 hidden border-l border-line pl-1 lg:block">
          <DepartmentTreeNav
            {departments}
            accessibleIds={actor.accessibleDepartmentIds}
            canManage={actor.canManage}
            selectedId={scope.departmentId}
            onSelect={onSelectDepartment}
          />
        </div>
      {/if}
    {/each}
  </div>

  {#if showDepartmentPicker}
    <label class="sr-only" for="storage-department">부서</label>
    <select
      id="storage-department"
      class="{FILTER_CONTROL} w-full lg:hidden"
      value={scope.departmentId ?? ''}
      onchange={(e) => onSelectDepartment(Number(e.currentTarget.value))}
    >
      {#each departmentOptions as option (option.id)}
        <!-- 들여쓰기로 계층을 표현한다(트리가 하던 일). 전각 공백을 쓰는 이유는 일반 공백이
             option 안에서 접혀 들여쓰기가 사라지기 때문이다(소속 셀렉터와 같은 관용) -->
        <option value={option.id}>{'　'.repeat(option.depth)}{option.name}</option>
      {/each}
    </select>
  {/if}

  <!--
    휴지통은 영역이 아니라 그 영역의 다른 상태다. 그래서 영역 목록에 끼우지 않고 아래에 둔다.
    (지금 보고 있는 영역의 휴지통을 연다. 제목도 `휴지통 (공통)` 으로 그 사실을 적는다)

    개수는 지금 영역의 것이다. 셋을 합친 값을 적으면 개인에서 눌러 아무것도 없는데 배지에는
    12가 적혀 있는 화면이 된다. 아직 사용량을 못 받았으면 숫자를 붙이지 않는다(0 은 거짓이 된다)
  -->
  <button type="button" class={trashClass} onclick={onToggleTrash}>
    휴지통{trashCount === null ? '' : `(${trashCount})`}
  </button>

  <StorageUsageBar {usage} />
</nav>
