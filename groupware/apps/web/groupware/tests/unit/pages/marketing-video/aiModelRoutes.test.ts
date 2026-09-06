/**
 * 모델 목록의 경로 축: 그 회사를 직접 부르는가, 플랫폼을 거치는가, 사내인가
 *
 * 이 축이 화면 장식이 아닌 이유는 같은 모델이 두 경로로 존재하기 때문이다(Veo 3.1). 경로를 말해
 * 주지 않으면 목록에 이름이 같은 두 줄이 남고, 고르는 사람은 등록해야 하는 키도 요금이 붙는
 * 계정도 알 수 없다.
 *
 * 부류의 정의는 자격증명 카탈로그(`@csc/api-providers`)의 kind 다. 여기서 다시 선언하지 않는
 * 것이 규칙이라, 그 규칙이 지켜지는지도 함께 단정한다.
 */
import { describe, expect, it } from 'vitest';
import { API_PROVIDER_KIND_META, findApiProvider } from '@csc/api-providers';
import {
  AI_CAPABILITIES,
  accessRouteGroups,
  accessRouteOf,
  credentialLabelOf,
  isModelGated,
  resolveRouteTab,
  routeLabel,
  routeLabelOf,
  routeTabId,
  visibleAiModelOptions,
  type AiModelOption
} from '$lib/pages/tools/marketing-video/aiModelOptions';

const videoCap = AI_CAPABILITIES.find((c) => c.key === 'video')!;
const v15Video = visibleAiModelOptions(videoCap, 'v1.5');

const opt = (over: Partial<AiModelOption> = {}): AiModelOption => ({
  key: 'k',
  label: 'L',
  description: 'd',
  provider: 'external',
  vendor: 'V',
  available: true,
  ...over
});

describe('accessRouteOf', () => {
  it('키를 요구하지 않는 모델은 키 불필요다', () => {
    expect(accessRouteOf(opt({ provider: 'internal', credentialProvider: undefined }))).toBe(
      'NO_KEY'
    );
  });

  it('키가 없다고 사내 모델인 것은 아니다', () => {
    // Edge TTS 가 그렇다: Microsoft 의 무료 서비스이고 키만 필요 없다. 그 묶음을 '사내' 라고
    //   부르면 화면이 사실이 아닌 말을 한다. 축이 답하는 것은 "어느 키로 닿는가" 다
    expect(accessRouteOf(opt({ provider: 'external', credentialProvider: undefined }))).toBe(
      'NO_KEY'
    );
    expect(routeLabel('NO_KEY')).not.toContain('사내');
  });

  it('부류는 자격증명 카탈로그가 정한다', () => {
    // 여기 값을 적어 두지 않는다. 카탈로그가 바뀌면 이 단정도 함께 따라가야 한다.
    expect(accessRouteOf(opt({ credentialProvider: 'HIGGSFIELD' }))).toBe(
      findApiProvider('HIGGSFIELD')?.kind
    );
    expect(accessRouteOf(opt({ credentialProvider: 'GEMINI' }))).toBe(
      findApiProvider('GEMINI')?.kind
    );
  });

  it('카탈로그에 없는 프로바이더는 키 불필요로 보내지 않는다', () => {
    // 그쪽으로 보내면 화면이 '요금이 붙지 않는다' 고 말하게 된다. 등록할 수 없는 키를 요구하는
    //   모델이라 애초에 고를 수도 없다.
    expect(accessRouteOf(opt({ credentialProvider: 'NOPE' as never }))).toBeNull();
  });
});

describe('routeLabel', () => {
  it('등록 화면과 같은 단어를 쓴다', () => {
    // 같은 것을 두 이름으로 배우게 하지 않는다. 그래서 라벨의 출처가 커널이어야 한다.
    expect(routeLabel('PLATFORM')).toBe(API_PROVIDER_KIND_META.PLATFORM.label);
    expect(routeLabel('VENDOR')).toBe(API_PROVIDER_KIND_META.VENDOR.label);
  });
});

describe('routeLabelOf', () => {
  it('플랫폼 경유와 운영사 직접을 구분해 말한다', () => {
    expect(routeLabelOf(opt({ credentialProvider: 'HIGGSFIELD' }))).toBe('Higgsfield 경유');
    expect(routeLabelOf(opt({ credentialProvider: 'GEMINI' }))).toBe('Gemini API 직접');
  });

  it('키가 필요 없으면 말할 것이 없다', () => {
    expect(routeLabelOf(opt({ provider: 'internal' }))).toBeNull();
  });
});

describe('credentialLabelOf', () => {
  it('경로 표기가 아니라 등록 화면에서 찾을 항목 이름이다', () => {
    // 게이팅 안내가 "Higgsfield 경유 키가 등록되지 않았습니다" 라고 말하면, 등록 화면에 그런
    //   항목이 없어 무엇을 찾아야 할지 알려 주지 못한다.
    expect(credentialLabelOf(opt({ credentialProvider: 'HIGGSFIELD' }))).toBe('Higgsfield');
    expect(credentialLabelOf(opt({ provider: 'internal' }))).toBeNull();
  });
});

describe('accessRouteGroups', () => {
  it('빈 묶음은 내지 않는다', () => {
    const groups = accessRouteGroups([opt({ credentialProvider: 'GEMINI' })]);
    expect(groups.map((g) => g.route)).toEqual(['VENDOR']);
  });

  it('모든 모델이 정확히 한 묶음에 들어간다', () => {
    // 묶음이 목록을 대신하므로, 하나라도 빠지면 그 모델은 화면에서 사라진다.
    const groups = accessRouteGroups(v15Video);
    expect(groups.flatMap((g) => g.options).map((o) => o.key).sort()).toEqual(
      v15Video.map((o) => o.key).sort()
    );
  });

  it('묶음 안에서 카탈로그 순서가 유지된다', () => {
    // 카탈로그 순서는 이 도구에 맞는 순서다(립싱크 기준). 묶으면서 흐트러지면 그 판단이 사라진다.
    const groups = accessRouteGroups(v15Video);
    for (const g of groups) {
      const inCatalog = v15Video.filter((o) => g.options.includes(o));
      expect(g.options).toEqual(inCatalog);
    }
  });
});

describe('v1.5 영상 모델의 오늘의 사실', () => {
  it('두 경로가 모두 있다', () => {
    // 한쪽 벤더 계정이 막혀도 다른 쪽으로 만들 수 있다는 것이 경로를 둘로 둔 이유다.
    const routes = new Set(v15Video.map(accessRouteOf));
    expect(routes).toEqual(new Set(['PLATFORM', 'VENDOR']));
  });

  it('같은 이름의 모델이 경로로 구분된다', () => {
    // 이 검사가 이 축의 존재 이유다. 라벨이 같은 두 줄이 서로 다른 키를 요구한다.
    const veo = v15Video.filter((o) => o.label === 'Veo 3.1');
    expect(veo).toHaveLength(2);
    expect(new Set(veo.map((o) => o.credentialProvider))).toEqual(
      new Set(['HIGGSFIELD', 'GEMINI'])
    );
    expect(new Set(veo.map(routeLabelOf)).size).toBe(2);
  });

  it('키를 등록한 경로만 고를 수 있다', () => {
    // 게이팅 판정이 경로별로 갈리는지 본다. 한쪽 키만 등록한 조직이 다른 쪽을 고를 수 있으면
    //   렌더가 402 로 끝난다(서버가 그 조직 키를 찾지 못한다)
    const configured = new Set(['GEMINI']);
    const gated = v15Video.filter((o) => isModelGated(o, configured));
    expect(gated.every((o) => o.credentialProvider !== 'GEMINI')).toBe(true);
    expect(v15Video.filter((o) => !isModelGated(o, configured)).length).toBeGreaterThan(0);
  });
});

describe('resolveRouteTab', () => {
  const platform = { ...opt({ key: 'p1', credentialProvider: 'HIGGSFIELD' }) };
  const vendorA = { ...opt({ key: 'v1', credentialProvider: 'GEMINI' }) };
  const groups = accessRouteGroups([platform, vendorA]);

  it('사람이 고른 탭이 먼저다', () => {
    expect(resolveRouteTab(groups, 'PLATFORM', 'v1')).toBe('PLATFORM');
  });

  it('고른 탭이 없으면 지금 선택된 모델이 있는 탭을 연다', () => {
    // 이 규칙이 이 함수의 존재 이유다. 저장된 모델이 다른 탭에 있는데 첫 탭을 열면 강조된 타일이
    //   없어 아무것도 고르지 않은 화면처럼 보이고, 사람은 다시 고른다.
    expect(resolveRouteTab(groups, '', 'p1')).toBe('PLATFORM');
    expect(resolveRouteTab(groups, '', 'v1')).toBe('VENDOR');
  });

  it('사라진 탭을 가리키면 되돌린다', () => {
    // 버전을 바꾸거나 검색으로 묶음이 줄면 예전 선택이 없는 탭을 가리킨다. 그대로 두면 어느
    //   묶음도 열리지 않아 목록이 빈 화면이 된다.
    expect(resolveRouteTab(groups, 'NO_KEY', 'v1')).toBe('VENDOR');
    expect(resolveRouteTab(accessRouteGroups([vendorA]), 'PLATFORM', '')).toBe('VENDOR');
  });

  it('선택도 없으면 첫 탭', () => {
    expect(resolveRouteTab(groups, '', '')).toBe(routeTabId(groups[0].route));
  });

  it('묶음이 없으면 빈 값(그 역량은 목록을 그리지 않는다)', () => {
    expect(resolveRouteTab([], '', '')).toBe('');
  });

  it('분류되지 않은 묶음도 하나의 탭이다', () => {
    // route 가 null 이라 상태로 쓸 수 없다. id 를 주지 않으면 그 탭은 열 수 없는 탭이 된다.
    const unknown = accessRouteGroups([opt({ key: 'x', credentialProvider: 'NOPE' as never })]);
    expect(resolveRouteTab(unknown, '', 'x')).toBe('UNKNOWN');
  });
});
