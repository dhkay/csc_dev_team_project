// 영상 대표 썸네일 presign BFF. 개인 자산이라 시퀀스는 공용 헬퍼가 갖는다(파티션/인가 한 곳)
import type { RequestEvent } from '@sveltejs/kit';
import { presignPersonalAsset } from '$lib/server/marketing/personalPresign';

export function POST(event: RequestEvent) {
  return presignPersonalAsset(event, 'Marketing video thumbnail presign failed');
}
