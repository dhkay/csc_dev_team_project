// 스토리지 파일 다운로드 BFF: 인가된 바이트를 이 서버가 중계한다.
//
// 서명 주소로 302 를 주지 않는 이유가 이 화면의 핵심 성질이다. 서명 주소는 그것을 가진 누구나
// 열 수 있는 무기명 주소라, 한 번 밖으로 복사되면 로그인 없는 외부 공개가 된다. 공통과 조직
// 파일은 그러면 안 되므로 주소를 만들지 않는 쪽을 택했다(file-upload 도 스토리지 자산에는
// 발급하지 않는다). 브라우저가 보는 주소는 같은 origin 의 이 경로 하나뿐이고, 이 주소를 남에게
// 넘겨도 그 사람의 세션에는 이 조직의 파일이 없다.
//
// 링크는 여전히 평범한 `<a href>` 다. 클릭과 창 열기 사이에 기다림이 없어 팝업 차단에 걸리지
// 않고, 미리보기(`<img src>`)도 같은 주소를 쓴다.
import type { RequestHandler } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { env } from '$env/dynamic/public';
import { createServiceToken } from '$lib/shared/lib/utils/serviceToken';
import { fail } from '$lib/server/http/bff';
import { resolveStorageRequest } from '$lib/server/storage/api';

const STORAGE_BASE = (
  privateEnv.PRIVATE_STORAGE_API_URL ||
  env.PUBLIC_VITE_FILE_UPLOAD_API_URL ||
  'http://localhost:8001'
).replace(/\/$/, '');

/**
 * 그대로 넘기는 응답 헤더
 *
 * Range 는 요청, 응답 양쪽으로 통과시켜야 큰 영상을 앞뒤로 건너뛰며 볼 수 있다. 나머지는
 * file-upload 가 정한 것을 그대로 쓴다. 여기서 다시 정하면 같은 파일이 경로에 따라 다르게
 * 열린다(예: SVG 가 한쪽에서만 실행된다)
 */
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
  if (!id) return fail('대상이 없습니다.', { status: 400 });

  const params = event.url.searchParams;
  const resolved = await resolveStorageRequest(event, params.get('area'), params.get('dept'));
  if ('error' in resolved) return resolved.error;

  const range = event.request.headers.get('range');
  let upstream: Response;
  try {
    upstream = await fetch(`${STORAGE_BASE}/storage/files/${encodeURIComponent(id)}/content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': createServiceToken(),
        'X-Organization-Id': String(resolved.access.orgId),
        'X-User-Id': String(resolved.access.userId),
        ...(range ? { Range: range } : {})
      },
      body: JSON.stringify({ scope: resolved.scope }),
      // 사용자가 탭을 닫거나 받기를 멈추면 업스트림 읽기도 멈춘다.
      signal: event.request.signal
    });
  } catch (error) {
    console.error(
      '스토리지 다운로드 중계 실패:',
      error instanceof Error ? error.message : 'unknown'
    );
    return fail('파일을 내려받지 못했습니다.', { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    // 스코프 밖 대상은 file-upload 가 404 로 답한다(존재를 알려 주지 않는다). 그 뜻을 그대로 옮긴다.
    if (upstream.status === 404) return fail('대상을 찾을 수 없습니다.', { status: 404 });
    if (upstream.status === 403) return fail('접근할 수 없는 파일입니다.', { status: 403 });
    return fail('파일을 내려받지 못했습니다.', { status: 502 });
  }

  const headers = new Headers();
  for (const name of PASS_THROUGH) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  // 조직 파일이다. 중간 캐시(프록시)에 남기지 않는다.
  headers.set('Cache-Control', 'private, no-store');

  return new Response(upstream.body, { status: upstream.status, headers });
};
