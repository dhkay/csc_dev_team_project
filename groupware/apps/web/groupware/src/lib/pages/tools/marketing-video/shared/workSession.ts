/**
 * 생성 창의 세션 상태: 열려 있었는가, 그리고 무엇을 다루고 있었는가
 *
 * 새로고침은 이 탭의 기억을 통째로 지운다. 그런데 하던 일은 대개 서버에 남아 있어서(렌더 잡,
 * 적어 둔 초안) 화면만 처음으로 돌아간다. 창이 닫힌 채 다시 뜨면 사용자는 자기가 보던 진행이
 * 사라졌다고 읽는다.
 *
 * 그래서 창의 자리(열림 + 무엇)를 세션 저장소에 남긴다. 초안(`planDraft`)과 같은 저장소이고 이유도
 * 같다. 이 도구는 새 탭으로 열리므로 그 탭을 닫는 것이 곧 이 작업을 접은 것이다.
 *
 * **새로고침을 넘길 수 있는 목표만 남긴다.** 배치와 dev 미리보기는 이 탭의 메모리에만 있어 그
 * 이름으로는 다시 찾을 수 없다. 배치는 무엇으로 대신 가리킬지를 셸이 정해 준다(그것이 만든
 * 프로젝트, 아직 없으면 그 배치를 시작한 초안). 미리보기는 목 상태라 대신할 것이 없어 남기지
 * 않는다. 없는 것을 가리키는 세션을 남기면 다시 들어온 창이 빈 폼을 열어 놓고 "이어서" 라고
 * 말하게 된다.
 */
import { browser } from '$app/environment';
import type { VersionMode } from '$lib/shared/lib/versionMode/versionMode';
import type { WorkTarget } from './workTabs';

/** 다시 들어왔을 때 창을 어떻게 세울지 */
export interface WorkSession {
  open: boolean;
  // 무엇을 다루던 창인가. 없으면 빈 폼으로 열려 있던 창이다.
  target: WorkTarget | null;
}

/** 저장 칸 이름. 채널과 버전으로 갈라 다른 워크스페이스의 창이 섞이지 않게 한다 */
export function workSessionKey(version: VersionMode, channelId: number | null): string {
  return `csc:marketing-video:session:${version}:${channelId ?? 'none'}`;
}

/**
 * 새로고침을 넘길 수 있는 목표로 바꾼다. 넘길 수 없으면 null.
 *
 * 배치는 이 탭의 메모리에만 있어 그 이름으로는 다시 찾을 수 없다. 무엇으로 대신 가리킬지는 셸이
 * 안다(`batchTarget`): 서버에 같은 일의 이름이 생겼으면 그 프로젝트, 아직이면 그 배치를 시작한
 * 초안이다. 초안으로 돌아가면 돌던 생성을 이어받지는 못하지만 적은 것은 그대로 서고, 그것이
 * 기획안을 만드는 구간에서 되살릴 수 있는 전부다.
 */
export function durableTarget(
  target: WorkTarget | null,
  batchTarget: (batchId: number) => WorkTarget | null,
): WorkTarget | null {
  if (!target) return null;
  if (target.kind === 'draft' || target.kind === 'project') return target;
  if (target.kind === 'batch') return batchTarget(target.batchId);
  return null;
}

/**
 * 저장. 닫힌 창은 칸을 비운다.
 *
 * 닫혀 있었다면 다시 들어와도 열지 않으므로 무엇을 다루던 창인지는 아무도 읽지 않는다. 읽히지 않는
 * 값을 남겨 두면 다음 사람이 그것으로 무언가 할 수 있다고 읽는다.
 */
export function saveWorkSession(key: string, session: WorkSession): void {
  if (!browser) return;
  try {
    if (!session.open) {
      sessionStorage.removeItem(key);
      return;
    }
    sessionStorage.setItem(key, JSON.stringify(session));
  } catch {
    // 저장하지 못해도 창은 그대로 동작한다. 잃는 것은 새로고침 뒤의 이어 열기뿐이다.
  }
}

/** 복원. 없거나 깨졌으면 null(닫힌 채로 시작한다) */
export function loadWorkSession(key: string): WorkSession | null {
  if (!browser) return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkSession;
    return typeof parsed?.open === 'boolean' ? parsed : null;
  } catch {
    return null;
  }
}
