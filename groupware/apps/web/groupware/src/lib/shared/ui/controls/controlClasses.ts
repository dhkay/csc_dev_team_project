/**
 * 필터 바 컨트롤(select, date input)의 공통 규격
 *
 * 상수로 두는 이유. 같은 화면군의 필터 바가 여럿이고(보관함, 활동 로그) 나란히 놓이면 높이 1px 차이도
 * 눈에 띈다. 각 컴포넌트가 같은 문자열을 따로 들고 있으면 한쪽을 고칠 때 다른 쪽이 조용히 갈리고,
 * 그 사실은 두 화면을 동시에 열어 보기 전까지 드러나지 않는다.
 *
 * 담는 범위는 규격(높이, 테두리, 여백, 글자 크기) 까지다. 폭은 화면 방향에 따라 달라지므로
 * 호출부가 정한다(`class="{FILTER_CONTROL} w-full"`)
 */
export const FILTER_CONTROL =
  'h-8 rounded-md border border-line bg-surface px-2 text-sm text-fg';
