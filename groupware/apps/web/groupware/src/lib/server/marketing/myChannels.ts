// 그 사람의 채널 목록 조회(서버 전용). 채널은 개인 소유라 (조직, 주인) 두 값으로 스코프된다.
//
// 모아 두는 이유. 이 호출의 계약이 바뀌었을 때(주인이 필수가 됐을 때) 갱신이 필요한 자리가 여러
// 곳이었고, 그중 하나가 빠져 원장의 채널 이름이 나흘간 전부 "삭제된 채널" 로 보였다. 부르는 법을
// 한 곳에만 두면 다음 계약 변경 때 고칠 자리가 하나다.
import { serverMarketingClient } from '$lib/infrastructure/http/serverClientInstances';

/** 채널 목록 항목: 이 조회가 쓰는 최소 형태 */
export interface MyChannel {
  id: number;
  name: string;
}

/**
 * 그 사람의 채널을 표시 순서대로 가져온다. 채널이 하나도 없으면 백엔드가 기본 채널을 만들어 주므로
 * 정상 경로에서 빈 배열은 오지 않는다.
 *
 * 실패를 삼키지 않고 던진다. 못 불러왔을 때 무엇으로 접을지는 호출부마다 다르다. 진입 해석은
 * 빈 목록으로 접어 안내 화면을 그리고, slug 해석은 도구 랜딩으로 되돌린다. 여기서 하나로 정하면
 * 그중 한쪽의 동작이 조용히 바뀐다.
 */
export async function fetchMyChannels(
  organizationId: number,
  ownerUserId: number
): Promise<MyChannel[]> {
  const res = await serverMarketingClient().GET<MyChannel[]>(
    `/channels?organizationId=${organizationId}&ownerUserId=${ownerUserId}`
  );
  return Array.isArray(res.data) ? res.data : [];
}