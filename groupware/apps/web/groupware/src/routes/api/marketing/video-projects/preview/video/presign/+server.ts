// 미리보기 완성 영상 presign BFF. 개발 전용
//
// 미리보기가 브라우저에서 병합한 영상(MediaRecorder Blob)을 실제 저장소에 올린다. 그래야 등록된 행이
// 실제 산출물과 똑같이 재생되고, 그 뒤 동작(보관, 다운로드)도 실제와 같은 자산을 다룬다.
//
// 라우트를 썸네일과 따로 두는 이유는 `personalPresign` 의 주석 그대로다: 그 라우트가 곧 "무엇을 어디에
// 올리는가" 의 선언이라, 남의 이름으로 올리면 그 선언이 사실과 달라진다.
import type { RequestEvent } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { fail } from '$lib/server/http/bff';
import { presignPersonalAsset } from '$lib/server/marketing/personalPresign';

export function POST(event: RequestEvent) {
  // 운영에는 미리보기가 없으므로 이 업로드도 없다(등록 경로와 같은 게이트)
  if (!dev) return fail('Not found', { status: 404 });
  return presignPersonalAsset(event, 'Marketing preview video presign failed');
}
