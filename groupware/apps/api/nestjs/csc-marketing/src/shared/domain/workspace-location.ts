/**
 * 워크스페이스 위치 공유 커널: 기획안(saved-plan)과 최종 영상(video-final)이 같은 축으로 나뉘므로
 * 어휘를 한 곳에서 정의한다(도메인별 복제 제거)
 *
 * personal = 개인 워크스페이스(소유 작업자 본인만 조회, owner_user_id 스코프)
 * archive  = 보관함(마케팅영상 도구 접근 가능한 조직원 전체 공유, 채널로는 동일하게 분리)
 *
 * 보관함으로 옮겨도 owner_user_id 는 비우지 않는다. 누가 올렸는지의 근거이자 '꺼내기' 시
 * 돌아갈 워크스페이스다.
 */

export type WorkspaceLocation = 'personal' | 'archive';
