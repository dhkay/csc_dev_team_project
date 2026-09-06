/**
 * 창 자리의 보존 규칙(새로고침 뒤 그 자리로 다시 세우기)
 *
 * 되살릴 수 없는 것을 남기면 다시 들어온 창이 빈 폼을 열어 놓고 "이어서" 라고 말한다. 그래서
 * 무엇을 남길 수 있는가가 이 파일의 전부다.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));

const store = new Map<string, string>();
vi.stubGlobal('sessionStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

const { durableTarget, loadWorkSession, saveWorkSession, workSessionKey } = await import(
  '$lib/pages/tools/marketing-video/shared/workSession'
);

/** 셸이 그 배치를 대신 가리킬 것을 못 찾은 경우 */
const nothing = () => null;

beforeEach(() => store.clear());

describe('새로고침을 넘길 수 있는 목표', () => {
  it('초안과 프로젝트는 그대로 남는다', () => {
    // 둘 다 이 탭 밖에 근거가 있다(세션 저장소, 서버 행).
    expect(durableTarget({ kind: 'draft', draftId: 'd1' }, nothing)).toEqual({
      kind: 'draft',
      draftId: 'd1',
    });
    expect(durableTarget({ kind: 'project', projectId: 7 }, nothing)).toEqual({
      kind: 'project',
      projectId: 7,
    });
  });

  it('배치는 셸이 대신 가리키는 것으로 바꿔 남긴다', () => {
    // 배치는 메모리에만 있어 그 이름으로는 다시 찾을 수 없다. 무엇으로 대신 가리킬지는 셸이 안다:
    //   서버에 같은 일의 이름이 생겼으면 그 프로젝트, 아직이면 그 배치를 시작한 초안이다.
    expect(durableTarget({ kind: 'batch', batchId: 3 }, () => ({ kind: 'project', projectId: 42 }))).toEqual(
      { kind: 'project', projectId: 42 },
    );
    expect(durableTarget({ kind: 'batch', batchId: 3 }, () => ({ kind: 'draft', draftId: 'd1' }))).toEqual(
      { kind: 'draft', draftId: 'd1' },
    );
    expect(durableTarget({ kind: 'batch', batchId: 3 }, nothing)).toBeNull();
  });

  it('dev 미리보기는 남기지 않는다', () => {
    expect(durableTarget({ kind: 'preview' }, nothing)).toBeNull();
    expect(durableTarget(null, nothing)).toBeNull();
  });
});

describe('저장과 복원', () => {
  it('열려 있던 창과 무엇을 다루던 창인지가 남는다', () => {
    const key = workSessionKey('v1.5', 5);
    saveWorkSession(key, { open: true, target: { kind: 'project', projectId: 7 } });

    expect(loadWorkSession(key)).toEqual({ open: true, target: { kind: 'project', projectId: 7 } });
  });

  it('닫힌 창은 칸을 비운다', () => {
    // 닫혀 있었다면 다시 들어와도 열지 않으므로 무엇을 다루던 창인지는 아무도 읽지 않는다.
    const key = workSessionKey('v1.5', 5);
    saveWorkSession(key, { open: true, target: { kind: 'draft', draftId: 'd1' } });
    saveWorkSession(key, { open: false, target: { kind: 'draft', draftId: 'd1' } });
    expect(loadWorkSession(key)).toBeNull();
  });

  it('채널과 버전마다 칸이 갈린다', () => {
    expect(workSessionKey('v1.5', 5)).not.toBe(workSessionKey('v1.5', 6));
    expect(workSessionKey('v1.5', 5)).not.toBe(workSessionKey('v1.0', 5));
  });

  it('깨진 값으로 창을 세우지 않는다', () => {
    const key = workSessionKey('v1.5', 5);
    store.set(key, '{ 깨진 json');
    expect(loadWorkSession(key)).toBeNull();

    store.set(key, JSON.stringify({ target: { kind: 'draft', draftId: 'd1' } }));
    expect(loadWorkSession(key)).toBeNull();
  });
});
