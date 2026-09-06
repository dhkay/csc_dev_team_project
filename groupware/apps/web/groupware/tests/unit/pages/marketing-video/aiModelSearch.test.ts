// 모델 목록의 표현 규칙. 여기가 깨지면 카탈로그에 있는 모델이 검색으로 나오지 않거나, 선택지가
// 늘어난 역량이 여전히 스크롤로만 훑는 격자로 남는다. 둘 다 목록이 길어진 뒤에야 드러난다.
import { describe, it, expect } from 'vitest';
import {
  DENSE_LIST_THRESHOLD,
  filterModels,
  matchesModelQuery,
  sharedRouteLabel,
  usesDenseList,
} from '$lib/pages/tools/marketing-video/aiModelSearch';
import {
  accessRouteGroups,
  routeLabelOf,
  visibleAiCapabilities,
  visibleAiModelOptions,
  type AiModelOption,
} from '$lib/pages/tools/marketing-video/aiModelOptions';
import { VERSION_MODES } from '$lib/shared/lib/versionMode/versionMode';

/** 그 버전에서 이 역량으로 고를 수 있는 모델(카탈로그 실제 값) */
function optionsOf(version: 'v1.0' | 'v1.5', capability: string): AiModelOption[] {
  const cap = visibleAiCapabilities(version).find((c) => c.key === capability);
  return cap ? visibleAiModelOptions(cap, version) : [];
}

/** 검색 규칙을 카탈로그와 무관하게 확인하기 위한 가짜 선택지 */
const makeOptions = (n: number): AiModelOption[] =>
  Array.from({ length: n }, (_, i) => ({
    key: `m${i}`,
    label: `M${i}`,
    description: '',
    provider: 'external' as const,
    vendor: 'V',
    available: true,
  }));

describe('검색이 붙는 기준은 버전이 아니라 선택지 수', () => {
  it('임계치를 넘는 순간에만 바뀐다', () => {
    expect(usesDenseList(makeOptions(DENSE_LIST_THRESHOLD))).toBe(false);
    expect(usesDenseList(makeOptions(DENSE_LIST_THRESHOLD + 1))).toBe(true);
  });

  it('세는 단위는 화면이 한 번에 보여 주는 목록이다', () => {
    // 규칙 자체는 위에서 가짜 목록으로 확인한다. 여기서 고정하는 것은 오늘의 사실이고, 이
    // 검사가 실패하는 것은 목록이 늘거나 줄었다는 뜻이라 그 화면을 실제로 보라는 신호다.
    //
    // 단위가 역량 전체가 아니라 경로 묶음인 이유: 경로가 둘 이상이면 화면이 탭으로 갈라 한
    // 번에 한 묶음만 보여 준다. 전체로 재면 화면에 없는 모델까지 세어, 실제로는 다섯 줄짜리
    // 목록 위에 검색창이 붙는다. v1.5 의 영상 모델이 일곱이 된 지금이 정확히 그 경우다.
    const dense: string[] = [];
    for (const version of VERSION_MODES) {
      for (const cap of visibleAiCapabilities(version)) {
        for (const group of accessRouteGroups(optionsOf(version, cap.key))) {
          if (usesDenseList(group.options)) dense.push(`${version}/${cap.key}/${group.route}`);
        }
      }
    }
    expect(dense).toEqual([]);
  });
});

describe('matchesModelQuery', () => {
  // 카탈로그의 특정 모델에 매달지 않는다. 여기서 지키는 것은 "어느 항목으로 찾을 수 있는가" 라는
  // 규칙이고, 그 규칙은 목록이 바뀌어도 같아야 한다(모델을 지우면 검사가 사라지면 안 된다)
  const option: AiModelOption = {
    key: 'higgsfield/kling-video/v3.0/std/text-to-video',
    label: 'Kling 3.0',
    description: '한국어 대사 립싱크',
    provider: 'external',
    vendor: 'Kling',
    available: true,
  };

  it('빈 검색어는 전부 통과한다', () => {
    expect(matchesModelQuery(option, '')).toBe(true);
    expect(matchesModelQuery(option, '   ')).toBe(true);
  });

  it('표시명으로 찾는다', () => {
    expect(matchesModelQuery(option, 'kling 3')).toBe(true);
  });

  it('만든 회사로 찾는다', () => {
    // 여러 회사가 섞인 목록에서 사람이 먼저 떠올리는 것이 회사인 경우가 많다.
    expect(matchesModelQuery(option, 'kling')).toBe(true);
  });

  it('설명에 있는 말로도 찾는다', () => {
    expect(matchesModelQuery(option, '립싱크')).toBe(true);
  });

  it('엔드포인트 경로 조각으로도 찾는다', () => {
    // key 가 곧 벤더 엔드포인트라, 벤더 문서를 보고 온 사람이 그 경로로 찾을 수 있어야 한다.
    expect(matchesModelQuery(option, 'text-to-video')).toBe(true);
  });

  it('어디에도 없는 말은 걸리지 않는다', () => {
    expect(matchesModelQuery(option, 'zzz-없는말')).toBe(false);
  });
});

describe('filterModels', () => {
  const options = makeOptions(3).map((o, i) => ({ ...o, vendor: i === 0 ? 'Kling' : 'ByteDance' }));

  it('빈 검색어면 모델을 하나도 빠뜨리지 않고 순서도 그대로다', () => {
    // 화면이 이 결과를 제공자/회사로 다시 묶으므로 카탈로그 순서가 유지되어야 그룹 순서도 유지된다.
    expect(filterModels(options, '')).toEqual(options);
  });

  it('회사명으로 검색하면 그 회사 모델만 남는다', () => {
    const kling = filterModels(options, 'kling');
    expect(kling.length).toBe(1);
    expect(kling.every((o) => o.vendor === 'Kling')).toBe(true);
  });

  it('한 회사의 여러 모델이 함께 남는다', () => {
    expect(filterModels(options, 'bytedance').length).toBe(2);
  });

  it('일치가 없으면 빈 배열이다(화면은 이때 안내를 띄운다)', () => {
    expect(filterModels(options, 'zzz-없는말')).toEqual([]);
  });
});

describe('sharedRouteLabel', () => {
  const platform = makeOptions(3).map((o) => ({ ...o, credentialProvider: 'HIGGSFIELD' as const }));
  const vendor = makeOptions(2).map((o) => ({ ...o, credentialProvider: 'GEMINI' as const }));

  it('전부 같은 경로면 그 표기를 준다(타일마다 반복하지 않기 위해)', () => {
    expect(sharedRouteLabel(platform, routeLabelOf)).toBe('Higgsfield 경유');
  });

  it('플랫폼 경유만 다루지 않는다: 운영사 직접도 똑같이 모은다', () => {
    // 이름을 바꾼 이유가 이것이다. 예전 이름(sharedPlatform)은 하는 일보다 좁게 읽혔다.
    expect(sharedRouteLabel(vendor, routeLabelOf)).toBe('Gemini API 직접');
  });

  it('섞여 있으면 null 이다(그때는 어느 것이 어느 경로인지가 정보다)', () => {
    expect(sharedRouteLabel([...platform, ...vendor], routeLabelOf)).toBeNull();
  });

  it('경로가 없는 목록은 null 이다', () => {
    expect(sharedRouteLabel(optionsOf('v1.5', 'tts'), routeLabelOf)).toBeNull();
    expect(sharedRouteLabel([], routeLabelOf)).toBeNull();
  });
});
