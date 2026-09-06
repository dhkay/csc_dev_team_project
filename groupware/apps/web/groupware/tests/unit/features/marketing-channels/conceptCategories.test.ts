import { describe, expect, it } from 'vitest';
import {
  addCustomAxis,
  addCustomOption,
  mergeAxes,
  newCustomKey,
  removeCustomAxis,
  removeCustomOption,
  renameCustomAxis,
  sameSets,
  setDetailKey,
  updateCustomOption,
  validateAxisLabel,
  validateOptionLabel,
} from '$lib/features/marketing-channels/lib/conceptCategories';
import type {
  BrandConceptAxis,
  BrandConceptSetInput,
} from '$lib/features/marketing-channels/types';

// 기본 카테고리 7종은 서버 카탈로그가 소유한다. 여기서는 규칙 검증에 필요한 최소 형태만 세운다.
const catalog: BrandConceptAxis[] = [
  {
    key: 'style',
    label: '표현 형식',
    description: '무엇으로 보여줄지',
    options: [
      { key: 'ugc-handheld', label: 'UGC 핸드헬드', description: '' },
      { key: 'live-action-closeup', label: '실사 클로즈업', description: '' },
    ],
  },
  {
    key: 'mood',
    label: '무드',
    description: '어떤 느낌인지',
    options: [{ key: 'warm-cozy', label: '따뜻하고 아늑한', description: '' }],
  },
];

const AXIS = 'x:1a2b3c4d' as const;
const OPT = 'x:9f8e7d6c' as const;

function makeSet(overrides: Partial<BrandConceptSetInput> = {}): BrandConceptSetInput {
  return {
    brandName: '촉촉연구소',
    brandDescription: '보습 전문',
    concepts: [],
    ...overrides,
  };
}

/** 커스텀 카테고리 하나 + 그 카테고리의 레퍼런스 하나를 고른 세트 */
function setWithCustomAxis(): BrandConceptSetInput {
  return makeSet({
    concepts: [{ axis: AXIS, option: OPT }],
    customAxes: [{ key: AXIS, label: '계절감' }],
    customOptions: [{ axis: AXIS, key: OPT, label: '오션 무드', description: '파스텔톤' }],
  });
}

describe('newCustomKey', () => {
  /**
   * 서버가 받는 형식. 원본은
   * `apps/api/nestjs/csc-marketing/.../types/custom-concept.types.ts` 의
   * `CUSTOM_CONCEPT_KEY_PATTERN` 이고, 어긋나면 서버가 그 정의를 조용히 버린다.
   * (화면은 저장 성공을 보여주고 카테고리는 사라진다)
   */
  const SERVER_KEY_PATTERN = /^x:[0-9a-f]{4,32}$/;

  it('서버가 받는 형식으로 만든다', () => {
    for (let i = 0; i < 50; i += 1) expect(newCustomKey()).toMatch(SERVER_KEY_PATTERN);
  });

  it('서버의 축 길이 제한(32자) 안에 들어간다', () => {
    // uuid(36자)를 쓰면 여기서 걸린다. ConceptChoiceDto.axis 가 32자다.
    expect(newCustomKey().length).toBeLessThanOrEqual(32);
  });
});

describe('이름 정규화 (추가/수정 경로를 통해)', () => {
  it('개행과 연속 공백을 한 칸으로 접는다', () => {
    // 프롬프트가 `카테고리: 라벨, 노트` 한 줄을 만드는 구조라 개행이 그 줄을 쪼갠다.
    const set = addCustomOption(
      addCustomAxis(makeSet(), '  계절감  ', AXIS),
      AXIS,
      '오션\n무드',
      '파스텔톤   바닷가',
      OPT,
    );
    expect(set.customAxes![0].label).toBe('계절감');
    expect(set.customOptions![0].label).toBe('오션 무드');
    expect(set.customOptions![0].description).toBe('파스텔톤 바닷가');
  });

  it('길이를 자른다', () => {
    const set = addCustomAxis(makeSet(), '가'.repeat(100), AXIS);
    expect(set.customAxes![0].label.length).toBe(60);
  });

  it('수정 경로도 같은 규칙을 쓴다', () => {
    const set = updateCustomOption(setWithCustomAxis(), OPT, { label: '숲\n무드' });
    expect(set.customOptions![0].label).toBe('숲 무드');
  });
});

describe('setDetailKey (카테고리 관리 모달의 dirty 판정)', () => {
  it('아무것도 바꾸지 않으면 같다', () => {
    // 이 판정이 없으면 아무것도 바꾸지 않은 저장 요청이 나간다.
    const set = setWithCustomAxis();
    expect(setDetailKey(set)).toBe(setDetailKey(setWithCustomAxis()));
  });

  it('카테고리를 더하면 달라진다', () => {
    const before = makeSet();
    expect(setDetailKey(before)).not.toBe(setDetailKey(addCustomAxis(before, '계절감', AXIS)));
  });

  it('이름만 바꿔도 달라진다', () => {
    const before = setWithCustomAxis();
    expect(setDetailKey(before)).not.toBe(
      setDetailKey(renameCustomAxis(before, AXIS, '분위기')),
    );
  });

  it('레퍼런스 설명만 바꿔도 달라진다', () => {
    const before = setWithCustomAxis();
    expect(setDetailKey(before)).not.toBe(
      setDetailKey(updateCustomOption(before, OPT, { description: '바뀐 설명' })),
    );
  });

  it('선택만 달라도 달라진다(모달에서도 고르고 저장한다)', () => {
    const a = setWithCustomAxis();
    const b = { ...setWithCustomAxis(), concepts: [] };
    expect(setDetailKey(a)).not.toBe(setDetailKey(b));
  });

  it('선택 순서는 보지 않는다', () => {
    // 랜덤은 카탈로그 순서로, 세트는 저장 순서로 담긴다. 순서를 보면 같은 조합이 달라 보인다.
    const a = makeSet({
      concepts: [
        { axis: 'style', option: 'ugc-handheld' },
        { axis: 'mood', option: 'warm-cozy' },
      ],
    });
    const b = makeSet({
      concepts: [
        { axis: 'mood', option: 'warm-cozy' },
        { axis: 'style', option: 'ugc-handheld' },
      ],
    });
    expect(setDetailKey(a)).toBe(setDetailKey(b));
  });

  it('정의가 없는 세트와 빈 배열을 가진 세트를 같게 본다', () => {
    // 서버는 빈 정의를 키 없이 저장한다. 다르게 보면 열자마자 저장이 활성화된다.
    expect(setDetailKey(makeSet())).toBe(
      setDetailKey({ ...makeSet(), customAxes: [], customOptions: [] }),
    );
  });
});

describe('mergeAxes', () => {
  it('기본 축 뒤에 커스텀 축을 붙인다', () => {
    const axes = mergeAxes(catalog, setWithCustomAxis());
    expect(axes.map((a) => a.label)).toEqual(['표현 형식', '무드', '계절감']);
    // 기본 제공은 불변이라는 사실이 이 플래그로 화면에 전달된다.
    expect(axes.map((a) => a.custom)).toEqual([false, false, true]);
  });

  it('기본 카테고리에 더한 레퍼런스는 그 축의 선택지 뒤에 붙는다', () => {
    const set = makeSet({
      customOptions: [{ axis: 'style', key: OPT, label: '내 연출', description: '' }],
    });
    const style = mergeAxes(catalog, set).find((a) => a.key === 'style')!;
    expect(style.options.map((o) => o.label)).toEqual([
      'UGC 핸드헬드',
      '실사 클로즈업',
      '내 연출',
    ]);
    // 기본 선택지에는 수정/삭제가 없다. 더한 것만 그 표식을 갖는다.
    expect(style.options.map((o) => o.custom)).toEqual([false, false, true]);
    expect(style.custom).toBe(false);
  });

  it('커스텀 정의가 없는 세트는 카탈로그 그대로다', () => {
    const axes = mergeAxes(catalog, makeSet());
    expect(axes).toHaveLength(catalog.length);
    expect(axes.every((a) => !a.custom)).toBe(true);
  });

  it('세트가 없어도 카탈로그를 그린다', () => {
    expect(mergeAxes(catalog, null)).toHaveLength(catalog.length);
  });
});

describe('validateAxisLabel', () => {
  it('기본 카테고리와 같은 이름은 거절한다', () => {
    // 겹치면 프롬프트에 `무드:` 줄이 둘 실려 모델이 상반된 지시를 받는다.
    expect(validateAxisLabel(catalog, makeSet(), '무드')).toBe(
      '기본 카테고리와 같은 이름은 쓸 수 없습니다.',
    );
  });

  it('같은 세트의 다른 커스텀 이름과 겹치면 거절한다', () => {
    expect(validateAxisLabel(catalog, setWithCustomAxis(), '계절감')).toBe(
      '이미 있는 카테고리 이름입니다.',
    );
  });

  it('수정 중인 자기 이름과는 겹쳐도 된다', () => {
    // 이름을 그대로 두고 확정하는 것이 정상 동작이다.
    expect(validateAxisLabel(catalog, setWithCustomAxis(), '계절감', AXIS)).toBeNull();
  });

  it('빈 이름은 거절한다', () => {
    expect(validateAxisLabel(catalog, makeSet(), '   ')).toBe('이름을 입력해 주세요.');
  });

  it('겹치지 않으면 통과한다', () => {
    expect(validateAxisLabel(catalog, setWithCustomAxis(), '촬영 시간대')).toBeNull();
  });
});

describe('validateOptionLabel', () => {
  it('그 카테고리의 기본 선택지와 같은 이름은 거절한다', () => {
    const axes = mergeAxes(catalog, makeSet());
    expect(validateOptionLabel(axes, 'style', 'UGC 핸드헬드')).toBe(
      '이 카테고리에 이미 있는 이름입니다.',
    );
  });

  it('다른 카테고리에 같은 이름이 있는 것은 상관없다', () => {
    // 축이 다르면 칩이 같은 줄에 서지 않아 구별에 문제가 없다.
    const axes = mergeAxes(catalog, makeSet());
    expect(validateOptionLabel(axes, 'mood', 'UGC 핸드헬드')).toBeNull();
  });

  it('수정 중인 자기 이름과는 겹쳐도 된다', () => {
    const axes = mergeAxes(catalog, setWithCustomAxis());
    expect(validateOptionLabel(axes, AXIS, '오션 무드', OPT)).toBeNull();
  });
});

describe('카테고리 편집', () => {
  it('추가하면 카드에 그 카테고리가 나타난다', () => {
    const next = addCustomAxis(makeSet(), '  계절감  ', AXIS);
    expect(next.customAxes).toEqual([{ key: AXIS, label: '계절감' }]);
    expect(mergeAxes(catalog, next).at(-1)!.label).toBe('계절감');
  });

  it('이름을 바꿔도 이미 고른 선택은 유지된다', () => {
    const next = renameCustomAxis(setWithCustomAxis(), AXIS, '분위기');
    expect(next.customAxes![0]).toEqual({ key: AXIS, label: '분위기' });
    // key 로 가리키므로 선택이 고아가 되지 않는다. 이름을 key 로 쓰면 여기서 깨진다.
    expect(next.concepts).toEqual([{ axis: AXIS, option: OPT }]);
  });

  it('삭제하면 그 레퍼런스와 그 축의 선택이 함께 사라진다', () => {
    const next = removeCustomAxis(setWithCustomAxis(), AXIS);
    expect(next.customAxes).toEqual([]);
    expect(next.customOptions).toEqual([]);
    // 선택을 남기면 서버 검증이 그 세트를 거절해 편집 전체가 저장되지 않는다.
    expect(next.concepts).toEqual([]);
  });

  it('삭제는 다른 축의 선택을 건드리지 않는다', () => {
    const set = makeSet({
      concepts: [
        { axis: 'style', option: 'ugc-handheld' },
        { axis: AXIS, option: OPT },
      ],
      customAxes: [{ key: AXIS, label: '계절감' }],
      customOptions: [{ axis: AXIS, key: OPT, label: '오션 무드', description: '' }],
    });
    expect(removeCustomAxis(set, AXIS).concepts).toEqual([
      { axis: 'style', option: 'ugc-handheld' },
    ]);
  });

  it('상한을 넘으면 추가하지 않는다', () => {
    let set = makeSet();
    for (let i = 0; i < 10; i += 1) {
      set = addCustomAxis(set, `카테고리${i}`, `x:${i.toString(16).padStart(8, '0')}`);
    }
    expect(set.customAxes).toHaveLength(8);
  });
});

describe('레퍼런스 편집', () => {
  it('기본 카테고리에도 더할 수 있다', () => {
    const next = addCustomOption(makeSet(), 'style', '내 연출', '설명', OPT);
    expect(next.customOptions).toEqual([
      { axis: 'style', key: OPT, label: '내 연출', description: '설명' },
    ]);
  });

  it('이름과 설명을 바꿔도 선택은 유지된다', () => {
    const next = updateCustomOption(setWithCustomAxis(), OPT, { label: '숲 무드' });
    expect(next.customOptions![0].label).toBe('숲 무드');
    // 설명은 건드리지 않았으므로 그대로다.
    expect(next.customOptions![0].description).toBe('파스텔톤');
    expect(next.concepts).toEqual([{ axis: AXIS, option: OPT }]);
  });

  it('삭제하면 그것을 가리키는 선택도 사라진다', () => {
    const next = removeCustomOption(setWithCustomAxis(), OPT);
    expect(next.customOptions).toEqual([]);
    expect(next.concepts).toEqual([]);
    // 카테고리 자체는 남는다(레퍼런스만 지운 것이다)
    expect(next.customAxes).toHaveLength(1);
  });

  it('한 카테고리의 상한을 넘으면 추가하지 않는다', () => {
    let set = makeSet();
    for (let i = 0; i < 25; i += 1) {
      set = addCustomOption(set, 'style', `옵션${i}`, '', `x:${i.toString(16).padStart(8, '0')}`);
    }
    expect(set.customOptions).toHaveLength(20);
  });

  it('세트 전체 상한을 넘으면 추가하지 않는다', () => {
    let set = makeSet();
    // 두 축에 20개씩 채우면 세트 상한(40)에 닿는다. key 는 실제 형식(hex)을 쓴다.
    for (const [n, axis] of (['style', 'mood'] as const).entries()) {
      for (let i = 0; i < 20; i += 1) {
        const id = (n * 20 + i).toString(16).padStart(8, '0');
        set = addCustomOption(set, axis, `${axis}${i}`, '', `x:${id}`);
      }
    }
    const full = set.customOptions!.length;
    expect(full).toBe(40);
    expect(addCustomOption(set, 'style', '하나 더', '').customOptions).toHaveLength(full);
  });
});

describe('sameSets (스테이징 dirty 판정)', () => {
  // 정의(카테고리/레퍼런스)는 관리 모달이 자기 요청으로 저장한다. 하단 바가 관할하지 않으므로
  //   그것만 달라진 것을 "저장하지 않은 변경" 으로 세면, 하단 바가 자기 것이 아닌 변경을 두고
  //   저장을 재촉하고 그 저장은 아무것도 바꾸지 않는다.
  it('커스텀 카테고리만 다른 것은 하단 바의 변경이 아니다', () => {
    const before = makeSet();
    const after = addCustomAxis(before, '계절감', AXIS);
    expect(sameSets([before], [after])).toBe(true);
  });

  it('커스텀 레퍼런스의 설명만 다른 것도 하단 바의 변경이 아니다', () => {
    const before = setWithCustomAxis();
    const after = updateCustomOption(before, OPT, { description: '바뀐 설명' });
    expect(sameSets([before], [after])).toBe(true);
  });

  it('카테고리 이름만 다른 것도 하단 바의 변경이 아니다', () => {
    const before = setWithCustomAxis();
    expect(sameSets([before], [renameCustomAxis(before, AXIS, '분위기')])).toBe(true);
  });

  it('카테고리를 지워 선택이 함께 빠진 것은 변경으로 본다', () => {
    // 선택은 하단 바 관할이다. 정의를 지우면 그것을 가리키던 선택도 사라지므로 그 차이는 잡혀야 한다.
    const before = setWithCustomAxis();
    expect(sameSets([before], [removeCustomAxis(before, AXIS)])).toBe(false);
  });

  it('같은 내용이면 같다고 본다(선택 순서는 무관)', () => {
    const a = makeSet({
      concepts: [
        { axis: 'style', option: 'ugc-handheld' },
        { axis: 'mood', option: 'warm-cozy' },
      ],
    });
    const b = makeSet({
      concepts: [
        { axis: 'mood', option: 'warm-cozy' },
        { axis: 'style', option: 'ugc-handheld' },
      ],
    });
    expect(sameSets([a], [b])).toBe(true);
  });

  it('빈 배열과 없음을 같게 본다(서버는 빈 것을 키 없이 저장한다)', () => {
    // 저장 직후 재조회 결과와 스테이징이 이것 때문에 달라 보이면 dirty 가 풀리지 않는다.
    const withEmpty = makeSet({ customAxes: [], customOptions: [] });
    expect(sameSets([makeSet()], [withEmpty])).toBe(true);
  });

  it('구분자가 들어간 브랜드명이 다른 세트와 같아 보이지 않는다', () => {
    // 자유 입력이라 어떤 구분자든 들어올 수 있다. 이어 붙이는 키는 여기서 충돌한다.
    const a = makeSet({ brandName: 'A|B', brandDescription: 'C' });
    const b = makeSet({ brandName: 'A', brandDescription: 'B|C' });
    expect(sameSets([a], [b])).toBe(false);
  });

  it('개수가 다르면 다르다고 본다', () => {
    expect(sameSets([makeSet()], [makeSet(), makeSet()])).toBe(false);
  });
});
