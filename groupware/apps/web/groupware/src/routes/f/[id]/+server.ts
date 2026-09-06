// 공통 영역 파일의 공개 주소: 로그인 없이 열리는 유일한 경로
//
// 주소가 곧 파일이다. 안내 페이지를 두지 않는 이유는 이 주소의 쓰임이 다른 곳에 이미지로 붙여
// 넣는 것이기 때문이다. `<img src>` 에 넣었을 때 HTML 이 나오면 쓸 수 없다.
//
// 공통 파일만 열린다. 조직과 개인 파일의 id 로 불러도 file-upload 가 404 로 답한다. 그
// 파일들을 읽는 길은 세션을 확인하는 /api/storage/files/{id}/download 하나뿐이다.
//
// 화면도 공통 파일에는 이 주소를 쓴다(목록의 링크와 미리보기가 같은 값). 그래서 사용자가 주소를
// 복사해 밖에 붙여도 그대로 열리고, 따로 "공유하기" 단계를 거치지 않는다.
import { error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { env } from '$env/dynamic/public';
import { createServiceToken } from '$lib/shared/lib/utils/serviceToken';

const STORAGE_BASE = (
  privateEnv.PRIVATE_STORAGE_API_URL ||
  env.PUBLIC_VITE_FILE_UPLOAD_API_URL ||
  'http://localhost:8001'
).replace(/\/$/, '');

/** 업스트림이 정한 서빙 규칙을 그대로 옮긴다. 여기서 다시 정하면 두 경로가 달라진다. */
const PASS_THROUGH = [
  'content-type',
  'content-length',
  'content-disposition',
  'content-range',
  'accept-ranges',
  'content-security-policy',
  'x-content-type-options'
];

export const GET: RequestHandler = async (event) => {
  const id = event.params.id ?? '';
  if (!id) error(404);

  const range = event.request.headers.get('range');
  let upstream: Response;
  try {
    upstream = await fetch(`${STORAGE_BASE}/storage/common/${encodeURIComponent(id)}`, {
      headers: {
        'X-Service-Token': createServiceToken(),
        ...(range ? { Range: range } : {})
      },
      signal: event.request.signal
    });
  } catch (e) {
    console.error('공통 파일 중계 실패:', e instanceof Error ? e.message : 'unknown');
    error(502, '파일을 불러오지 못했습니다.');
  }

  if (!upstream.ok || !upstream.body) error(404);

  const headers = new Headers();
  for (const name of PASS_THROUGH) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  // 공개 주소라 중간 캐시가 담아 둬도 되지만 오래 잡아 두지는 않는다. 파일을 지우거나 다른
  //   영역으로 옮기면 그때부터 닫혀야 하는데, 캐시가 길면 그 변화가 늦게 반영된다.
  headers.set('Cache-Control', 'public, max-age=300');

  return new Response(upstream.body, { status: upstream.status, headers });
};
