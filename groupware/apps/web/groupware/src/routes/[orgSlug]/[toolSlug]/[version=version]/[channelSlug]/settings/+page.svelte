<script lang="ts">
  // AI 도구 설정: 브랜드/컨셉 ↔ AI 모델 탭. 셸(nav)은 상위 레이아웃
  //   열린 섹션은 URL(?section=brand-concept|ai-model)이 단일 출처 → 새로고침/뒤로가기/링크공유로 복원
  //   파라미터가 없거나 모르는 값이면 첫 섹션으로 떨어진다(빈 화면이 뜨지 않게). 패널은 controlled.
  //   채널도 편집 권한도 쓰지 않는다: 두 섹션 모두 개인 설정이다(채널 스코프였던 브랜드/컨셉이
  //   개인으로 옮겨졌다). 버전은 쓴다: 두 설정이 버전 슬롯에 저장되므로 어느 슬롯인지가 필요하다.
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import SettingsSectionsPanel from '$lib/pages/tools/marketing-video/settings/SettingsSectionsPanel.svelte';
  import type { LayoutData } from '../$types';
  import {
    MARKETING_SETTINGS_SECTIONS,
    type SettingsSectionKey,
  } from '$lib/pages/tools/marketing-video/marketingSettingsSections';

  // 버전은 `[version]` 셸이 확정해 내려준다(주소가 단일 출처)
  let { data }: { data: LayoutData } = $props();

  const KEYS: readonly string[] = MARKETING_SETTINGS_SECTIONS.map((s) => s.key);
  const DEFAULT_SECTION = MARKETING_SETTINGS_SECTIONS[0].key;
  const section = $derived<SettingsSectionKey>(
    KEYS.includes(page.url.searchParams.get('section') ?? '')
      ? (page.url.searchParams.get('section') as SettingsSectionKey)
      : DEFAULT_SECTION,
  );
  // 탭 전환 = ?section 갱신. replaceState 로 히스토리 스팸 방지(탭은 페이지 이동이 아니다)
  function selectSection(key: SettingsSectionKey): void {
    const p = new URLSearchParams(page.url.searchParams);
    p.set('section', key);
    void goto(`${page.url.pathname}?${p.toString()}`, {
      replaceState: true,
      keepFocus: true,
      noScroll: true,
    });
  }
</script>

<SettingsSectionsPanel {section} version={data.version} onSelectSection={selectSection} />
