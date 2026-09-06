// 마케팅 영상 도구의 권한 계층 판정. 세션 유저의 역할(role), 직책(position), AI도구 보유를 읽어
// 도구 안에서 무엇을 할 수 있는지 정한다.
//
// 이 파일이 단일 출처다. 같은 판정을 레이아웃(사이드바 가시성, 페이지 게이트)과 BFF(집행)가 각자
// 인라인으로 들고 있으면 한쪽만 바뀌어 버튼은 보이는데 요청이 403 이 되거나 그 반대가 된다.
// 순수 함수라 세션(RequestEvent)을 모르고, 그래서 두 곳이 같은 함수를 부른다.
//
// 대상은 서버의 세션 유저(getUser)다. 클라이언트로 내리는 user 에는 position 이 없어 브라우저에서는
// 이 판정을 다시 할 수 없다. 서버가 플래그로 내려준다.
//
// 버전을 모른다. v1.0 과 v1.5 는 화면과 산출물이 갈리지만 누가 관리하고 누가 원장을 보는지는
// 같은 사람이다. 버전별로 갈리는 권한이 생기면 그 함수만 version 을 인자로 받는다.
import { AiToolKey, OrgPosition } from '@csc/entitlements';
import { hasRootAuthority } from '$lib/shared/lib/auth/access';
import type { CurrentUser, UserRole } from '$lib/shared/types/common.types';

/** 판정에 필요한 최소 형태. 세션 유저(CurrentUser)와 테스트용 부분 객체를 모두 받는다. */
export type ToolAccessSubject =
  | CurrentUser
  | { role?: UserRole; position?: OrgPosition | null; aiTools?: AiToolKey[] }
  | null
  | undefined;

/**
 * 도구 운영 관리급: 루트(ROOT), 대표(REPRESENTATIVE), 팀장(TEAM_LEADER)
 *
 * 이 등급이 지키는 것은 조직이 함께 쓰는 것이다. 공용 자산(에셋/세트/태그 카탈로그), 운영 정보 화면
 * (프로세스/가격표), 보관함 전체 정리. 채널은 개인 소유라 여기 해당하지 않는다.
 */
export function isToolManagerSubject(subject: ToolAccessSubject): boolean {
  if (!subject) return false;
  return hasRootAuthority(subject) || subject.position === OrgPosition.TeamLeader;
}

/**
 * 활동 로그 열람: 관리급(루트/대표/팀장)
 *
 * 열람 범위는 조직 전체다. 채널 필터는 표시용이고 경계가 아니다. 팀장이 들어가는 이유는 공용 자산과
 * 운영 화면을 관리하는 사람이 그 조직에서 누가 어느 채널에서 무엇에 돈을 썼는지도 봐야 하기
 * 때문이다.
 *
 * 관리급과 같은 판정인데 함수를 따로 두는 이유. 두 정책은 지금 같을 뿐 같은 것이 아니다. 로그가
 * 더 좁아지거나(감사 전용 권한) 부서 범위로 갈리는 날 이 함수만 바뀌고 호출부는 그대로다.
 */
export function canViewActivityLogs(subject: ToolAccessSubject): boolean {
  return isToolManagerSubject(subject);
}

/**
 * 기획 프롬프트 지침 편집: 루트 권한자(ROOT/대표) 또는 (팀장 + 그 도구 보유)
 *
 * 관리급보다 좁다. 지침은 LLM 을 어떻게 지시할지의 문제라 그 도구를 실제로 쓰는 팀장에게만 연다.
 * 루트 권한자는 도구 보유와 무관하게 통과한다(조직 보유 도구 전부에 접근하는 규칙과 같다).
 * 도구 key 는 호출부가 말한다. 레이아웃은 주소가 가리킨 도구를, BFF 는 자기 라우트의 도구를 넘긴다.
 */
export function canEditToolSettings(subject: ToolAccessSubject, toolKey: string): boolean {
  if (!subject) return false;
  if (hasRootAuthority(subject)) return true;
  return (
    subject.position === OrgPosition.TeamLeader &&
    ((subject.aiTools ?? []) as string[]).includes(toolKey)
  );
}