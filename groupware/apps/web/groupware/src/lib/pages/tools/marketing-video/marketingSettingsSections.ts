// 설정 섹션 정의(SSOT): 설정은 섹션 탭 전환이다. 배열 순서가 곧 탭 순서이고 첫 항목이 기본 탭이다.
// 섹션은 계속 추가해나갈 수 있다: 여기 한 줄 + SettingsSectionsPanel 의 분기(그 섹션 컴포넌트) 한 줄
// 화면(섹션 컴포넌트)이 없는 섹션은 등록하지 않는다(빈 stub 금지)

import { sectionPath } from './workspaceUrl';

/** 섹션 식별자: SettingsSectionsPanel 분기 키. ?section= 값으로도 쓰인다. */
export type SettingsSectionKey = 'brand-concept' | 'ai-model';

/**
 * 그 설정 섹션을 바로 여는 주소(딥링크). 알림의 '설정 열기' 처럼 화면 밖에서 보낼 때 쓴다.
 *
 * 쿼리 이름을 호출부마다 적지 않는다: 설정 화면이 읽는 값(?section=)과 어긋나면 링크는 열리는데
 * 엉뚱한 탭이 뜬다(그 어긋남은 눌러 봐야 안다)
 */
export function settingsSectionUrl(basePath: string, key: SettingsSectionKey): string {
  return `${sectionPath(basePath, 'settings')}?section=${key}`;
}

export interface SettingsSection {
  key: SettingsSectionKey;
  // 탭에 보이는 이름
  label: string;
  // 탭 툴팁: 그 섹션이 무엇을 정하는지
  description: string;
}

export const MARKETING_SETTINGS_SECTIONS: SettingsSection[] = [
  {
    key: 'brand-concept',
    label: '브랜드/컨셉',
    description: '내가 쓸 브랜드와 컨셉 설명(기획서 톤의 기준).',
  },
  {
    key: 'ai-model',
    label: 'AI 모델',
    description: '내가 쓸 LLM/영상 생성/TTS 모델 선택(외부/내부).',
  },
];
