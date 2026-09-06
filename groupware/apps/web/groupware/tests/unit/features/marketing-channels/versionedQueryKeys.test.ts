import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';

/**
 * 마케팅 쿼리 키의 버전 축
 *
 * 버전이 키에 있으면 전환 시 무효화가 아예 필요 없다(다른 키 공간이라 서로를 못 본다)
 * 축이 빠지면 전환할 때마다 무효화 목록을 손으로 유지해야 하고, 그 목록에서 빠진 자원이 직전 버전의
 * 목록을 그대로 보여준다. 그 회귀를 여기서 잡는다.
 */
vi.mock('$lib/infrastructure/http/clientInstances', () => ({ frontClient: vi.fn() }));

import { savedPlansKeys } from '$lib/features/marketing-channels/queries/savedPlans.query';
import { videoProjectsKeys } from '$lib/features/marketing-channels/queries/videoProjects.query';
import { videoFinalsKeys } from '$lib/features/marketing-channels/queries/videoFinals.query';
import { videoArchiveKeys } from '$lib/features/marketing-channels/queries/videoArchive.query';
import { planPromptKeys } from '$lib/features/marketing-channels/queries/planPrompt.query';
import { aiModelKeys } from '$lib/features/marketing-channels/queries/aiModel.query';
import { brandConceptKeys } from '$lib/features/marketing-channels/queries/brandConcept.query';
import { imageEngineLoadKeys } from '$lib/features/marketing-channels/queries/imageEngineLoad.query';
import { channelsKeys } from '$lib/features/marketing-channels/queries/channels.query';
import { defaultChannelKeys } from '$lib/features/marketing-channels/queries/defaultChannel.query';
import { brandConceptCatalogKeys } from '$lib/features/marketing-channels/queries/brandConceptCatalog.query';

/** 워크스페이스 자원(버전 × 채널) */
const WORKSPACE = [
  ['savedPlans', savedPlansKeys.list],
  ['videoProjects', videoProjectsKeys.list],
  ['videoFinals', videoFinalsKeys.list],
  ['planPrompt', planPromptKeys.view],
] as const;

/** 개인 자원(버전만). 채널이 들어가면 같은 값이 채널 수만큼 따로 캐시된다. */
const PERSONAL = [
  // 보관함은 개인 자원이 아니지만 키 모양이 같다(버전만). 조직 공용이라 채널로 갈리지 않는다.
  ['videoArchive', videoArchiveKeys.list],
  ['aiModel', aiModelKeys.mine],
  ['brandConcept', brandConceptKeys.mine],
  ['imageEngineLoad', imageEngineLoadKeys.mine],
] as const;

describe('마케팅 쿼리 키의 버전 축', () => {
  it.each(WORKSPACE)('%s: 버전이 다르면 다른 키다', (_name, key) => {
    expect(key('v1.5', 3)).not.toEqual(key('v1.0', 3));
  });

  it.each(WORKSPACE)('%s: 채널이 다르면 다른 키다', (_name, key) => {
    expect(key('v1.5', 3)).not.toEqual(key('v1.5', 4));
  });

  it.each(WORKSPACE)('%s: 버전이 index 1 이다(접두사 보존)', (_name, key) => {
    // 버전을 맨 앞에 두면 `['marketing-plans']` 같은 접두사 조회가 조용히 깨진다.
    expect(key('v1.0', 3)[1]).toBe('v1.0');
  });

  it.each(PERSONAL)('%s: 버전이 다르면 다른 키다', (_name, key) => {
    expect(key('v1.5')).not.toEqual(key('v1.0'));
  });

  it('버전 무관 자원에는 버전이 없다', () => {
    // 채널 목록/진입 채널/브랜드컨셉 카탈로그는 두 버전이 공유한다. 버전을 넣으면 같은 값을
    //   버전마다 다시 받고, 채널을 만들어도 다른 버전 화면에는 안 보인다.
    expect(channelsKeys.list()).toEqual(['marketing-channels']);
    expect(defaultChannelKeys.mine()).toEqual(['marketing-my-default-channel']);
    expect(brandConceptCatalogKeys.axes()).toEqual(['marketing-brand-concept-catalog']);
  });

  /**
   * 새 쿼리 파일이 이 검사를 그냥 지나가지 못하게 한다.
   *
   * 위 목록만 두면 검사가 자기가 아는 키만 본다. 나중에 추가된 자원이 버전을 안 실어도 아무도
   * 잡지 않는데, 그 실수는 화면에서 "전환했는데 목록이 그대로" 로만 드러난다(실제로 두 번 겪었다)
   * 그래서 쿼리 파일을 디스크에서 세어 세 목록과 맞춘다: 새 파일은 어느 쪽인지 정해야 통과한다.
   */
  it('모든 마케팅 쿼리 파일이 세 목록 중 정확히 한 쪽에 있다', () => {
    // 버전 무관: 두 버전이 공유하는 자원(위 '버전 무관 자원' 검사가 실제 키를 못박는다)
    const VERSION_FREE = ['channels', 'defaultChannel', 'brandConceptCatalog'];
    // 버전 축을 갖지만 키 모양이 달라(요청 객체 + runId) 전용 파일에서 검증한다.
    const TESTED_ELSEWHERE = ['plans']; // tests/unit/features/marketing-channels/plansQueryKey.test.ts
    const classified = new Set([
      ...WORKSPACE.map(([name]) => name),
      ...PERSONAL.map(([name]) => name),
      ...VERSION_FREE,
      ...TESTED_ELSEWHERE,
    ]);
    const dir = resolve(__dirname, '../../../../src/lib/features/marketing-channels/queries');
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.query.ts'))
      .map((f) => f.replace('.query.ts', ''));
    expect(files.filter((f) => !classified.has(f)).sort()).toEqual([]);
    // 목록이 없는 파일을 가리키면(개명/삭제) 검사가 조용히 무력해진다.
    expect([...classified].filter((c) => !files.includes(c)).sort()).toEqual([]);
  });

  it('서로 다른 버전의 키 집합은 교집합이 없다', () => {
    const v15 = WORKSPACE.map(([, key]) => JSON.stringify(key('v1.5', 3)));
    const v10 = WORKSPACE.map(([, key]) => JSON.stringify(key('v1.0', 3)));
    expect(v15.filter((k) => v10.includes(k))).toEqual([]);
  });
});
