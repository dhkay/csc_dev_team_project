/**
 * 서브 앱바 도구 모드의 데이터 계약
 *
 * 페이지가 자기 load 에서 `subAppBar` 로 주입하고 SubAppBar 가 그대로 렌더한다.
 * 생산자(페이지)와 소비자(위젯)가 이 선언 하나를 공유한다.
 *
 * page.data 는 라우트마다 형태가 달라 SvelteKit 이 타입을 주지 않는다. 그래서 위젯은 이 타입으로
 * 한 번만 좁히고, 생산자는 `satisfies` 로 맞춘다. 계약이 한 곳이라 필드 이름을 바꾸면 양쪽 중
 * 뒤처진 쪽이 컴파일 에러로 드러난다(선언이 둘이면 캐스트가 조용히 undefined 를 준다)
 *
 * href 가 아니라 slug 를 싣는 이유: 도구를 어느 탭에서 띄우는가(탭 이름 규칙)는 aiWorkspaceTabs
 * 하나가 소유한다. 서버가 완성된 href 를 주면 target 규칙이 여기 닿지 못해 같은 탭에서 열린다.
 */
export interface SubAppBarItem {
  // 버튼에 보이는 이름
  label: string;
  // AI 도구 라우팅 slug. 있으면 그 도구를 새 탭으로 띄우고, 없으면 '준비중' 토스트
  slug?: string;
}

export interface SubAppBarData {
  items: SubAppBarItem[];
}
