// 공통 파일의 공개 주소(순수): 경로 모양을 정하는 유일한 자리
//
// 서버(목록 렌더)와 클라이언트(주소 복사)가 같은 값을 만들어야 한다. 두 곳에서 조립하면 라우트를
// 옮겼을 때 한쪽만 따라오고, 그 어긋남은 복사한 주소가 404 가 되는 형태로만 드러난다.

/** 공개 라우트의 경로 접두. `src/routes/f/[id]` 와 같은 값이어야 한다. */
const PUBLIC_PATH_PREFIX = '/f';

/** 같은 origin 기준 경로. 화면의 링크와 미리보기가 이 값을 쓴다. */
export function publicFilePath(id: string): string {
  return `${PUBLIC_PATH_PREFIX}/${encodeURIComponent(id)}`;
}

/** 밖에 붙여 넣을 절대 주소. 복사 버튼이 이 값을 클립보드에 넣는다. */
export function publicFileUrl(origin: string, id: string): string {
  return `${origin}${publicFilePath(id)}`;
}
